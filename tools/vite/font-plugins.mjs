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
 * /status, a release note whose per-locale translation is missing and falls
 * back to the hand-written Chinese — is the known case, and is exactly why the
 * stack keeps those system faces.
 *
 * The charset is per family, not per site: the sheet is shared by all ten
 * locales, but each CJK family is named by exactly one locale's `--font-sans`
 * (see FONT_FAMILIES), so a subset covering a character that only, say, the ja
 * dictionary contains is unreachable dead weight in the MiSans/Noto TC/Noto KR
 * rules — and vice versa. Pruning against the union of all locales' text (the
 * previous behaviour) kept every one of those; pruning per family drops them
 * while leaving each family complete for the pages that can actually select it.
 */

/**
 * The subsetted families, and the locales whose `--font-sans` can actually
 * reach each one. global.css's `html[lang]` blocks are the source of truth for
 * the stacks: MiSans is Simplified-oriented with no `locl`, so only zh-Hans
 * names it; each Noto regional face is named by exactly one locale; Plus
 * Jakarta Sans sits first in all ten.
 *
 * That mapping is what makes per-family pruning possible. The sheet is shared,
 * so a subset whose characters no *reachable* locale renders is dead weight on
 * every page view — MiSans rules for glyphs that exist only in the ja
 * dictionary, Noto TC rules for Simplified-only characters, and so on. Pruning
 * against the whole-site charset (what this used to do) cannot see that; it
 * keeps every subset any locale's text mentions, for every family.
 *
 * `docs` marks the families rendered on /docs, which is zh-Hans-only: the 160
 * markdown articles are a large charset source the other three CJK faces can
 * never be asked for.
 */
const FONT_FAMILIES = [
  { name: 'misans', css: /\/misans\/lib\/Normal\/[^/]+\.css$/, locales: ['zh-Hans'], docs: true },
  { name: 'pjs', css: /\/@fontsource-variable\/plus-jakarta-sans\/[^/]+\.css$/, locales: 'all', docs: true },
  { name: 'noto-tc', css: /\/@fontsource\/noto-sans-tc\/[^/]+\.css$/, locales: ['zh-Hant'], docs: false },
  { name: 'noto-jp', css: /\/@fontsource\/noto-sans-jp\/[^/]+\.css$/, locales: ['ja'], docs: false },
  { name: 'noto-kr', css: /\/@fontsource\/noto-sans-kr\/[^/]+\.css$/, locales: ['ko'], docs: false },
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

/**
 * Scan source text into a codepoint set, in one of four slices:
 *
 *   `shell`  everything under src/ except the dictionaries and the docs
 *            collection — i.e. the chrome and literals every locale's pages
 *            render. Deliberately includes `i18n/locales.ts`: the switcher's
 *            endonyms (简体中文, 日本語, 한국어…) are CJK rendered on *every*
 *            page in *every* locale, so every family needs them. Excluding the
 *            whole i18n directory once dropped exactly those glyphs and the
 *            navbar fell back to a system face for four characters.
 *   `docs`   only the docs collection, which renders solely under zh-Hans.
 *   `dict`   one locale's dictionary.
 *   `all`    the union, i.e. the old whole-site charset.
 *
 * Deriving `shell` by *subtracting* the dictionaries from `all` would be wrong:
 * a character that appears in both a template and a dictionary has to survive
 * the template half, so the slices are scanned separately.
 */
function collectCharset(root, mode, code) {
  const charset = new Set();
  const srcRoot = path.join(root, 'src');
  const stack = [srcRoot];
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
        continue;
      }
      if (!CHARSET_SOURCES.test(entry.name)) continue;
      const rel = path.relative(srcRoot, full).split(path.sep).join('/');
      const isDict = /^i18n\/[^/]+\.json$/.test(rel);
      const isDocs = rel.startsWith('content/docs/');
      const take =
        mode === 'all' ? true
        : mode === 'docs' ? isDocs
        : mode === 'dict' ? rel === `i18n/${code}.json`
        : !isDict && !isDocs;
      if (!take) continue;
      try {
        for (const ch of readFileSync(full, 'utf8')) charset.add(ch.codePointAt(0));
      } catch {
        /* unreadable file — over-inclusion elsewhere still covers us */
      }
    }
  }
  return charset;
}

/** @returns {import('vite').Plugin} */
export function pruneFontSubsets() {
  let root = process.cwd();
  let scanned = null;

  /*
   * The charset a family is pruned against: every character a *template* can
   * render on any page (shared chrome, hardcoded literals, the docs shell),
   * plus the dictionaries of the locales whose `--font-sans` names the family,
   * plus the docs collection for the two faces /docs can render. Plus Jakarta
   * Sans takes the whole-site set — it is first in every stack, so anything
   * any page renders in Latin is its business.
   */
  function familyCharset(family) {
    scanned ??= {
      all: collectCharset(root, 'all'),
      shell: collectCharset(root, 'shell'),
      docs: collectCharset(root, 'docs'),
      dicts: new Map(),
    };
    if (family.locales === 'all') return scanned.all;
    const set = new Set(scanned.shell);
    if (family.docs) for (const cp of scanned.docs) set.add(cp);
    for (const code of family.locales) {
      let dict = scanned.dicts.get(code);
      if (!dict) {
        dict = collectCharset(root, 'dict', code);
        scanned.dicts.set(code, dict);
      }
      for (const cp of dict) set.add(cp);
    }
    return set;
  }

  return {
    name: 'luotopia-prune-font-subsets',
    enforce: 'pre',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      const family = FONT_FAMILIES.find((f) => f.css.test(file));
      if (!family) return null;
      if (!code.includes('@font-face')) return null;

      const charset = familyCharset(family);
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
        this.info?.(
          `[prune-font-subsets] ${family.name}/${path.basename(file)}: dropped ${dropped} subsets unreachable by ${
            family.locales === 'all' ? 'any locale' : family.locales.join('+')
          }, ${stripped} woff fallbacks`,
        );
      }
      return { code: dewoffed, map: null };
    },
  };
}

