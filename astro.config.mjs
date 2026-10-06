// @ts-check
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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

export default defineConfig({
  site: 'https://whu.sb',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
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
