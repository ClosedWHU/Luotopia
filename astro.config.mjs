// @ts-check
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
 * These three are the minimum that keeps the hierarchy intact — dropping Medium
 * would collapse 500 back onto Regular, since |500-400| beats |500-700| only on
 * a tie-break.
 */
const MISANS_WEIGHTS = {
  'MiSans-Regular.min.css': 400,
  'MiSans-Medium.min.css': 500,
  'MiSans-Bold.min.css': 700,
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

export default defineConfig({
  site: 'https://whu.sb',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [misansWeights(), flattenCssLayers(), tailwindcss()],
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
