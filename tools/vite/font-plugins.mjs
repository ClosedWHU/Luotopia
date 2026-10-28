// Vite plugins extracted from astro.config.mjs (kept here so the config stays
// readable and the plugins can be tested/reused independently): the MiSans
// weight remap and the charset-driven @font-face subset pruning. Provenance
// and rationale live in the comments below, carried over verbatim.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

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
export function misansWeights() {
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
export function pruneFontSubsets() {
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

      /*
       * Drop the `.woff` half of every surviving `src:`. woff2 is Chrome 36 /
       * Safari 10 / Firefox 39 / Edge 14 and this site's floor is 66 / 12 / 68 /
       * 88, so the fallback is unreachable by anything that can run the bundle
       * at all — yet it doubled the emitted font weight (518 files, ~13.8 MB, a
       * fifth of dist, mirrored to two more hosts) and put 36 KB of dead `src:`
       * text in the render-blocking sheet. Blocks whose only source is woff are
       * left alone rather than emptied.
       */
      let stripped = 0;
      const dewoffed = pruned.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
        if (!block.includes('.woff2') || !/format\(["']?woff["']?\)/.test(block)) return block;
        stripped += (block.match(/url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g) || []).length;
        return block.replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, '');
      });

      if (dropped > 0 || stripped > 0) {
        this.info?.(`[prune-font-subsets] ${path.basename(file)}: dropped ${dropped} unused subsets, ${stripped} woff fallbacks`);
      }
      return { code: dewoffed, map: null };
    },
  };
}

