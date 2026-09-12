// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

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

export default defineConfig({
  site: 'https://whu.sb',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [misansWeights(), tailwindcss()],
    build: {
      cssMinify: 'esbuild',
      assetsInlineLimit(filePath, content) {
        if (filePath.endsWith(".woff2")) return false;
        return content.byteLength < 4096;
      },
    },
  },
});
