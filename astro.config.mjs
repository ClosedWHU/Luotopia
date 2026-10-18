// @ts-check
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import postcss from 'postcss';

/*
 * MiSans ships its own @font-face CSS, but it declares the weights Xiaomi used
 * when cutting the family — Regular 330, Medium 380, Bold 630 — not the values
 * this site asks for. Left alone, `font-weight: 400` (body) and `500` (nav and
 * labels) both resolve to Medium, because 380 is the nearest face to each, and
 * the MD3 type scale loses the body/label distinction it is built on.
 *
 * So each face is re-declared at a standard weight as it is imported. Only the
 * descriptor is rewritten: the glyph data and the unicode-range subsets are
 * untouched, and Vite still resolves and emits the woff2 chunks normally.
 *
 * These two are the minimum that keeps the hierarchy intact — dropping Medium
 * would collapse 500 back onto Regular, since |500-400| beats |500-700| only on
 * a tie-break.
 *
 * Bold is not imported at all. Every weight in the MD3 type scale below is 400
 * or 500, so nothing asks MiSans for 700; the site's single `font-bold` is the
 * navbar wordmark, whose text is "Luotopia" — Latin, served at a true 700 by
 * Plus Jakarta Sans Variable (a 200-800 variable face ahead of MiSans in
 * `--font-sans`). Shipping it anyway cost 56 @font-face rules and their woff2
 * chunks for glyphs that are never drawn. Should CJK bold ever be wanted, 700
 * resolves to Medium (|700-500| < |700-400|) rather than being synthesized, so
 * re-adding the face is a deliberate quality choice, not a bug fix.
 */
const MISANS_WEIGHTS = {
  'MiSans-Regular.min.css': 400,
  'MiSans-Medium.min.css': 500,
};

/** @returns {import('vite').Plugin} */
function misansWeights() {
  return {
    name: 'luotopia-misans-weights',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0].replace(/\\/g, '/');
      const file = Object.keys(MISANS_WEIGHTS).find((f) =>
        path.endsWith(`/misans/lib/Normal/${f}`),
      );
      if (!file) return null;
      const weight = MISANS_WEIGHTS[file];
      return {
        code: code.replace(/font-weight:\s*\d+/g, `font-weight:${weight}`),
        map: null,
      };
    },
  };
}

/*
 * Drop @font-face subsets that cannot render anything this site contains.
 *
 * MiSans is cut into 56 unicode-range subsets *per weight*, by character cluster
 * rather than by script, and each subset carries a long literal range list. The
 * result was 172 @font-face rules totalling 237 KB of the 293 KB shared
 * stylesheet — 81% of a render-blocking file, for a site whose twelve built
 * pages use 1038 distinct codepoints between them. Roughly two thirds of those
 * subsets describe characters that appear nowhere.
 *
 * Pruning happens here, in `transform`, and deliberately not in `generateBundle`:
 * Vite hashes the CSS *after* transform, so the emitted filename describes the
 * pruned content. Pruning later would leave the pre-prune hash on post-prune
 * bytes, and a build that only changed site copy would then ship new CSS under
 * an old, `immutable`, year-long-cached filename. It also means the woff2 files
 * behind the dropped rules are never emitted at all.
 *
 * Build-only, matching `flattenCssLayers`: in dev a stale character set would
 * silently fall back to a system face until the server restarted, which is a
 * confusing thing to debug. Dev serves the full family.
 *
 * A character the scan misses degrades to the next face in `--font-sans`
 * (PingFang SC / Microsoft YaHei), so the failure mode is a substituted glyph,
 * not a missing one. Runtime-supplied copy — UptimeRobot monitor names on
 * /status — is the known case, and is exactly why the stack keeps those.
 */

/** CSS modules whose @font-face rules are subset candidates. */
const SUBSETTED_FONT_CSS = [
  /\/misans\/lib\/Normal\/[^/]+\.css$/,
  /\/@fontsource-variable\/plus-jakarta-sans\/[^/]+\.css$/,
  /\/@fontsource\/noto-sans-tc\/[^/]+\.css$/,
  /\/@fontsource\/noto-sans-jp\/[^/]+\.css$/,
  /\/@fontsource\/noto-sans-kr\/[^/]+\.css$/,
];

/** Text under `src/` that can contribute rendered characters. */
const CHARSET_SOURCES = /\.(astro|ts|tsx|js|jsx|mjs|cjs|css|md|mdx|json|html|svg)$/;

/** Parse `U+4e98`, `U+7750-7751` into [lo, hi] pairs. */
function parseUnicodeRange(value) {
  const ranges = [];
  for (const part of value.split(',')) {
    const match = /^\s*U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?\s*$/.exec(part);
    if (!match) continue;
    const lo = parseInt(match[1], 16);
    ranges.push([lo, match[2] ? parseInt(match[2], 16) : lo]);
  }
  return ranges;
}

function collectSiteCharset(root) {
  const charset = new Set();
  const stack = [path.join(root, 'src')];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (CHARSET_SOURCES.test(entry.name)) {
        try {
          for (const ch of readFileSync(full, 'utf8')) charset.add(ch.codePointAt(0));
        } catch {
          /* unreadable file — over-inclusion elsewhere still covers us */
        }
      }
    }
  }
  return charset;
}

/** @returns {import('vite').Plugin} */
function pruneFontSubsets() {
  let root = process.cwd();
  let charset = null;

  return {
    name: 'luotopia-prune-font-subsets',
    enforce: 'pre',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!SUBSETTED_FONT_CSS.some((pattern) => pattern.test(file))) return null;
      if (!code.includes('@font-face')) return null;

      charset ??= collectSiteCharset(root);
      /*
       * Fail open. An empty or tiny set means the scan found nothing — wrong
       * root, moved sources — and pruning against it would strip the whole
       * family and leave the site on system fallbacks. Shipping the unpruned
       * CSS costs bytes; shipping no CJK webfont costs the design.
       */
      if (charset.size < 64) return null;

      let dropped = 0;
      const pruned = code.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
        const range = /unicode-range:\s*([^;}]+)/.exec(block);
        // No unicode-range means the face applies unconditionally — keep it.
        if (!range) return block;
        const ranges = parseUnicodeRange(range[1]);
        if (ranges.length === 0) return block;
        for (const cp of charset) {
          for (const [lo, hi] of ranges) {
            if (cp >= lo && cp <= hi) return block;
          }
        }
        dropped += 1;
        return '';
      });

      if (dropped > 0) {
        this.info?.(`[prune-font-subsets] dropped ${dropped} unused @font-face subsets from ${path.basename(file)}`);
      }
      return { code: pruned, map: null };
    },
  };
}

/**
 * Unwrap Tailwind v4's cascade layers in the built CSS.
 *
 * v4 emits everything into `@layer properties/theme/base/utilities`, and
 * cascade layers are Chromium 99+. Older Android WebViews — which on
 * out-of-support devices without Play services never update — discard an
 * entire `@layer` block they cannot parse, so every utility vanishes and the
 * page collapses to unstyled HTML. That, not any single property, is why the
 * site reads as "broken" there.
 *
 * Unwrapping preserves the emitted order, which is exactly the layer
 * precedence order, so modern browsers resolve the same cascade as before —
 * Astro's scoped component styles still win their duels because the
 * `[data-astro-cid]` attribute outranks single-class utilities on specificity
 * (layer membership never mattered for those), and global.css's hand-written
 * rules are emitted after the utilities they override.
 *
 * Build-time only: `astro dev` still serves layered CSS, so verify old-kernel
 * behavior against `astro build && astro preview`.
 */
function flattenCssLayers() {
  return {
    name: 'luotopia-flatten-css-layers',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const source =
          typeof file.source === 'string'
            ? file.source
            : Buffer.from(file.source).toString('utf8');
        if (!source.includes('@layer')) continue;

        const root = postcss.parse(source, { from: file.fileName });
        // Loop for nested layers: replaceWith splices children in at the
        // parent's position, so a restart re-walks whatever surfaced.
        let found = true;
        while (found) {
          found = false;
          root.walkAtRules('layer', (rule) => {
            found = true;
            if (rule.nodes && rule.nodes.length > 0) rule.replaceWith(rule.nodes);
            else rule.remove(); // `@layer a, b;` order statements
            return false;
          });
        }
        file.source = root.toString();
      }
    },
  };
}

/**
 * Local stand-in for `functions/api/status.ts`.
 *
 * `astro dev` serves the site only — Pages Functions are a Cloudflare runtime
 * concern and never run under Vite — so without this the status page would show
 * its error card on every local visit. Both paths call the same
 * runtime-agnostic core in `functions/lib/uptimerobot.ts`; only the caching
 * differs (a Map here, `caches.default` in production), which is the whole
 * reason that core avoids Workers globals.
 *
 * Credentials are read the way wrangler reads them: `.dev.vars` first, then the
 * Vite env files, then the real environment. A missing key answers 503
 * `not_configured` — the same response production gives — so the page's failure
 * path is exercised locally rather than papered over.
 */
function statusDevApi() {
  /** Mirrors MIN_FRESH_AGE_MS in functions/api/status.ts. */
  const MIN_FRESH_AGE_MS = 60_000;
  let cached = null; // { at, body }
  let corePromise = null;

  function readEnvFiles(root) {
    const values = {};
    for (const file of ['.dev.vars', '.env.local', '.env']) {
      const filePath = path.join(root, file);
      if (!existsSync(filePath)) continue;
      for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        let value = match[2].trim();
        if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
        if (values[match[1]] === undefined) values[match[1]] = value;
      }
    }
    return values;
  }

  return {
    name: 'luotopia-status-dev-api',
    apply: 'serve',
    configureServer(server) {
      /*
       * A filter callback rather than `use('/api/status', handler)`: connect
       * strips the mount prefix from `req.url`, so the query string would have
       * to be reconstructed to find `?fresh=1`. Matching by hand keeps the full
       * URL intact.
       */
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || '';
        if (!requestUrl.startsWith('/api/status')) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        const send = (body, status, headers) => {
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...headers,
          });
          res.end(req.method === 'HEAD' ? undefined : body);
        };

        (async () => {
          if (!corePromise) {
            // Loaded through Vite rather than `import()`: the core is TypeScript,
            // and the dev server is the thing that knows how to transform it.
            const load = server.environments?.ssr?.loadModule ?? server.ssrLoadModule.bind(server);
            corePromise = load('/functions/lib/uptimerobot.ts');
          }
          const core = await corePromise;
          const env = { ...readEnvFiles(server.config.root), ...process.env };
          const options = core.resolveStatusOptions(env);
          if (!options.apiKey) {
            return send(
              JSON.stringify({
                error: 'not_configured',
                message: 'UPTIMEROBOT_API_KEY is not set — add it to homepage/.dev.vars',
              }),
              503,
            );
          }

          const fresh = new URL(requestUrl, 'http://localhost').searchParams.get('fresh') === '1';
          const now = Date.now();
          if (cached && (!fresh || now - cached.at < MIN_FRESH_AGE_MS)) {
            return send(cached.body, 200, { 'x-status-source': fresh ? 'throttled' : 'cache' });
          }

          const snapshot = await core.buildStatusSnapshot(options, now);
          cached = { at: now, body: JSON.stringify(snapshot) };
          return send(cached.body, 200, { 'x-status-source': 'api' });
        })().catch((error) => {
          send(
            JSON.stringify({
              error: error?.code ?? 'fetch_failed',
              message: error?.message ?? String(error),
            }),
            typeof error?.status === 'number' ? error.status : 500,
          );
        });
      });
    },
  };
}

/*
 * Static mirror mode (`MIRROR_ASSETS_ONLY=1`).
 *
 * The mirror deployment exists to distribute *files* — hot-update manifests and
 * scripts, scale data, fonts, CSS/JS bundles — to clients that reach Cloudflare
 * poorly. It is not a second website: every HTML page in the build output is
 * replaced with a stub that immediately sends the visitor to the same path on
 * the canonical domain, while asset paths keep serving byte-identical files.
 *
 * Build time is the only place this can live. The mirror host serves the output
 * as pure static files and runs nothing from `functions/`, so a runtime switch
 * would have no code to read it; the environment variable is consumed here, by
 * the build that the mirror platform runs. The primary deployment simply does
 * not set it.
 *
 * The redirect is client-side (JS `location.replace`, `<meta refresh>` as the
 * no-JS fallback) because a static host has no runtime to emit a real 3xx with.
 * The JS form preserves the query string and hash, which meta refresh cannot;
 * the baked-in meta target covers the path only. `<link rel=canonical>` points
 * crawlers at the real page so the mirror never competes with it.
 *
 * The root `404.html` deliberately survives untouched. Cloudflare-Pages-shaped
 * platforms choose between "custom 404" and "SPA rewrite" by its presence (see
 * docs/deployment.md §404 处理): without it, a miss on `/hot-update/typo.json`
 * would be rewritten to `/` and could come back as a bogus 200. With it, every
 * genuine miss — a typo, a deleted asset — stays a deterministic 404 instead of
 * bouncing to the main domain to 404 there.
 */
const MIRROR_ASSETS_ONLY = ['1', 'true', 'yes', 'on'].includes(
  (process.env.MIRROR_ASSETS_ONLY ?? '').trim().toLowerCase(),
);

/*
 * Where mirror page stubs send browsers. Must agree with `MAIN_DOMAIN` in
 * functions/_middleware.ts — that constant governs the primary deployment,
 * this one the mirror; `_middleware.ts` is TypeScript and this config cannot
 * import it (see `PUBLISHED` below). Overridable for staging mirrors; anything
 * that is not a plain hostname falls back to the default rather than shipping
 * stubs with an injected target.
 */
const MIRROR_MAIN_DOMAIN = /^[a-z0-9.-]+$/.test(
  (process.env.MIRROR_MAIN_DOMAIN ?? '').trim().toLowerCase(),
)
  ? process.env.MIRROR_MAIN_DOMAIN.trim().toLowerCase()
  : 'www.whu.sb';

/** The document that replaces each page in mirror mode. */
function mirrorStubHtml(urlPath) {
  const origin = `https://${MIRROR_MAIN_DOMAIN}`;
  return (
    `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Luotopia</title>` +
    `<link rel="canonical" href="${origin}${urlPath}">` +
    `<meta http-equiv="refresh" content="0;url=${origin}${urlPath}">` +
    `<script>location.replace(${JSON.stringify(origin)} + location.pathname + location.search + location.hash);</script>` +
    `</head><body></body></html>\n`
  );
}

/** @returns {import('astro').AstroIntegration} */
function assetsOnlyMirror() {
  return {
    name: 'luotopia-assets-only-mirror',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        if (!MIRROR_ASSETS_ONLY) return;
        const root = fileURLToPath(dir);
        const kept404 = path.join(root, '404.html');
        let stubbed = 0;
        const walk = (current) => {
          for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
              walk(full);
              continue;
            }
            if (!entry.name.endsWith('.html') || full === kept404) continue;
            const rel = path.relative(root, full).split(path.sep).join('/');
            // Astro emits routes as `<path>/index.html`; the stub's meta target
            // is the directory URL, while its JS keeps whatever was requested.
            const urlPath = rel.endsWith('index.html')
              ? `/${rel.slice(0, -'index.html'.length)}`
              : `/${rel}`;
            writeFileSync(full, mirrorStubHtml(urlPath));
            stubbed += 1;
          }
        };
        walk(root);
        logger.info(
          `[assets-only-mirror] replaced ${stubbed} HTML page(s) with redirects to ` +
            `https://${MIRROR_MAIN_DOMAIN}; kept 404.html and all assets`,
        );
      },
    },
  };
}

/**
 * The locales the site builds, shared with `src/i18n/locales.ts` and
 * `tools/check-i18n.mjs`.
 *
 * Read as JSON rather than imported from the TypeScript module because this file
 * is plain ESM and cannot resolve `.ts`. One file feeding all three consumers is
 * the point: a locale named here but not built would make every auto-detected
 * redirect from that language land on a 404.
 */
const PUBLISHED = JSON.parse(
  readFileSync(new URL('./src/i18n/published.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  site: 'https://whu.sb',
  integrations: [assetsOnlyMirror()],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  /*
   * Routing, not detection.
   *
   * Astro's i18n layer is build-time: it decides which URLs exist, sets
   * `Astro.currentLocale`, and hands the `astro:i18n` helpers their locale→path
   * mapping. It cannot see request headers, because there is no server — `output`
   * is static and there is no adapter. First-visit language detection therefore
   * lives in `functions/_middleware.ts`, which is the only thing in this
   * deployment that runs per request.
   *
   * `prefixDefaultLocale: false` keeps the default locale at `/`, so every URL
   * that already exists keeps working: no redirect for existing backlinks, no
   * sitemap churn, and no change to the `luotopia.whu.sb` → `/open/` rewrite.
   * It also means `redirectToDefaultLocale` must stay unset — Astro rejects the
   * combination, since the default locale's prefixed URL would then redirect to
   * itself.
   *
   * `i18n.fallback` is deliberately *not* configured. It looks like the right
   * tool for the untranslated half of a partly-localised site, but it does not
   * understand routes built by `src/pages/[lang]/*`: it treats `/en` as an
   * ordinary page needing an English version, emits a redirect stub at `/en/en`,
   * and — worse — its stub for `/en/features` outranks the real route, so the
   * actual translated page is dropped from the build with only a warning. The
   * stubs it does emit are also 2-second meta-refresh pages canonicalising to the
   * apex domain, which is a two-hop redirect chain. `functions/_middleware.ts`
   * does the same job with a single 302 and no build output.
   */
  i18n: {
    defaultLocale: PUBLISHED.default,
    locales: PUBLISHED.locales,
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    plugins: [misansWeights(), pruneFontSubsets(), flattenCssLayers(), statusDevApi(), tailwindcss()],
    build: {
      /*
       * Legacy WebView floor. Vite's default (baseline-widely-available,
       * ~Chrome 107) ships `?.`/`??` verbatim, which is a *parse* error below
       * Chrome 80 — the module dies before a single line runs. Chrome 66 is
       * the floor this codebase can actually serve: `AbortController` (66,
       * page-lifecycle's core), dynamic `import()` (63, the shader chunk) and
       * `import.meta` (64) all exist, and esbuild lowers everything else.
       * Below 66 the page degrades to the no-JS path: readable static HTML
       * (flattened CSS needs no JS) plus the head's reveal failsafe/noscript.
       */
      target: ['chrome66', 'safari12', 'firefox68', 'edge88'],
      cssMinify: 'esbuild',
      assetsInlineLimit(filePath, content) {
        if (filePath.endsWith(".woff2")) return false;
        return content.byteLength < 4096;
      },
    },
  },
});
