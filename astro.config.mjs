// @ts-check
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import postcss from 'postcss';
import { rehypeShiki, unified } from '@astrojs/markdown-remark';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypePreMermaid from './src/plugins/rehype-pre-mermaid.mjs';
import { redirects as docsRedirects } from './src/config/docs/redirects.mjs';
import { misansWeights, pruneFontSubsets } from './tools/vite/font-plugins.mjs';

/*
 * The documentation site (merged from ClosedWHU/Luotopia-Docs, see
 * docs/docs-site.md) lives under /docs as first-class pages of THIS project —
 * src/pages/docs/[...slug].astro renders the src/content/docs collection
 * through the marketing site's own shell. Its legacy URL map is
 * docs-root-relative; every key and target gains the /docs prefix here. The
 * same module drives the docs.whu.sb 301s in functions/lib/docs-redirects.ts,
 * so the two lists can never drift apart.
 */
const siteRedirects = Object.fromEntries(
  Object.entries(docsRedirects).map(([from, to]) => [`/docs${from}`, `/docs${to}`]),
);

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
  redirects: siteRedirects,
  integrations: [assetsOnlyMirror()],
  /*
   * Site-wide markdown processor, configured for the docs collection (the
   * only markdown this project renders — legal pages are .md.ts endpoints
   * serving raw text): remarkAlert powers the 61 GitHub-style alerts,
   * rehypePreMermaid stages ```mermaid blocks for the lazy client runtime in
   * DocsPage, and rehypeShiki does syntax highlighting — with a custom
   * processor the top-level `shikiConfig` no longer applies, so the dual
   * theme is configured on the plugin (the .dark swap rules live in
   * src/styles/docs.css). Astro 7 defaults to the Sätteri processor; opting
   * into unified() is what re-enables the plugin pipeline.
   */
  markdown: {
    /*
     * Astro's built-in highlighter runs *before* user rehype plugins, so with
     * the default (`syntaxHighlight: 'shiki'`) a ```mermaid fence reached
     * `rehypePreMermaid` already rewritten into `<pre class="astro-code">` with
     * Shiki spans — the plugin's guard could never match, the one diagram in
     * the docs rendered as a code block, and the ~4 MB of lazy mermaid chunks
     * were deployed for a code path that never fired. Turning the built-in off
     * hands every fence to the explicit `rehypeShiki` below (which still
     * highlights them) and lets the mermaid fence through untouched.
     */
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [remarkAlert],
      rehypePlugins: [
        rehypePreMermaid,
        [
          rehypeShiki,
          {
            themes: {
              light: 'github-light',
              dark: 'github-dark',
            },
          },
        ],
      ],
    }),
  },
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
