/**
 * The site's locale table — one source of truth for two runtimes.
 *
 * It deliberately imports nothing from `astro:*`. `functions/_middleware.ts`
 * needs the same code→path mapping to negotiate `Accept-Language`, and it runs
 * in the Cloudflare Workers runtime where Astro's virtual modules do not exist.
 * Keeping this file dependency-free is what lets both sides agree; a second copy
 * here would eventually disagree.
 *
 * The set is the one `store-listings/README.md` already pins down — it requires
 * the store copy to match the app's `msix_config.languages` / ARB set — so the
 * site, the store listings and the app cannot drift apart. All ten are published.
 * The app ships two more (Cantonese, written and traditional); neither has store
 * copy and neither has a plausible web audience distinct from `zh-Hant`.
 *
 * ## Every row here costs font bytes, and that is now a settled cost
 *
 * `pruneFontSubsets()` in `astro.config.mjs` derives the site charset by scanning
 * source **text** under `src/` — data and comments alike — and drops every MiSans
 * `@font-face` subset whose `unicode-range` covers none of it. That is how 172
 * rules became 56 and 81% of a render-blocking stylesheet disappeared.
 *
 * Ten languages undoes it, by design and not by accident. Measured on the built
 * stylesheet, with every page translated: MiSans subsets kept go 50 → 110 of 112,
 * its `@font-face` text goes 71 KB → 160 KB raw (25 → 57 KB gzip, 8.1 → 18.6 KB
 * brotli), and the whole shared file goes 133 KB → 222 KB raw, 38 → 70 KB gzip,
 * 19.0 → 29.3 KB brotli. Font subsets are 72% of the shared CSS by raw bytes and
 * essentially all of the growth; the pruning plugin is left with almost nothing to
 * drop, which is the honest consequence of a charset that really does span
 * simplified and traditional hanzi, kana, hangul, Cyrillic and Vietnamese.
 *
 * The number that actually transfers is the brotli delta: **+10.3 KB** on a
 * render-blocking file. The +89 KB raw mostly costs parse time, and it is almost
 * entirely `unicode-range` hex lists, which is why it compresses 6:1.
 *
 * Two consequences worth knowing before "optimising" this:
 *
 * - The subsets are *lazy*. `unicode-range` means a browser only downloads the
 *   woff2 behind a rule when a rendered character falls in it, so a Spanish
 *   visitor never fetches the hangul faces. What grew is the CSS, not the fonts.
 * - MiSans is only reached for CJK and Cyrillic. `--font-sans` puts Plus Jakarta
 *   Sans ahead of it, so Latin copy never uses MiSans at all. If the CSS size ever
 *   needs to come back down, that is the lever: load MiSans only on the locales
 *   whose content needs it. It has not been done because it would make the
 *   switcher's own endonyms render in a different face per page.
 *
 * The same reasoning is why comments in this file are English: a quoted CJK
 * phrase in a comment retains a subset for a glyph no page renders. The endonyms
 * below are the one place non-Latin text is genuinely load-bearing.
 *
 * `path` must equal Astro's own normalisation of `code` (lowercase, `_` → `-`),
 * because `astro:i18n`'s URL helpers derive it the same way and a mismatch would
 * make generated hrefs 404. `tools/check-i18n.mjs` asserts this against the
 * config so the invariant cannot rot silently.
 */

/*
 * The locales the site actually builds, as opposed to the ones it aspires to.
 *
 * A JSON file rather than a constant in this module because it has three
 * consumers that must not disagree: `astro.config.mjs` (which cannot import
 * TypeScript, and derives `i18n.locales` from it), this module (which uses it to
 * refuse redirects to a locale with no pages), and `tools/check-i18n.mjs` (which
 * asserts it matches the set of dictionary files on disk exactly). A duplicated
 * list in the config would eventually name a locale nobody built, and the
 * failure mode is a 404 on every auto-detected visit from that language.
 */
import published from "./published.json";
export interface SiteLocale {
  /** BCP 47 tag. Also the dictionary filename and `Astro.currentLocale`. */
  code: string;
  /**
   * URL path segment, without slashes. Empty for the default locale, which
   * `routing.prefixDefaultLocale: false` serves unprefixed — so every URL that
   * already exists keeps working and nothing external has to be redirected.
   */
  path: string;
  /**
   * Endonym, rendered in the switcher in *its own* script on every page.
   *
   * Not translated on purpose: the whole point is that a reader who cannot read
   * the page they landed on can still find their own language in the list.
   * Listing languages by exonym ("English" rendered as the Chinese word for it,
   * say) would defeat exactly the person the switcher exists for.
   */
  label: string;
  /** `hreflang` / `<html lang>` value. */
  hreflang: string;
  /** `og:locale`, in Facebook's underscore form. */
  ogLocale: string;
}

/**
 * Read from `published.json` rather than written here, so this module and
 * `astro.config.mjs` cannot disagree about which locale is served unprefixed.
 * A disagreement would mean every auto-detected redirect lands on a 404.
 */
export const DEFAULT_LOCALE: string = published.default;

/*
 * One row per published locale, in switcher order. `tools/check-i18n.mjs` fails
 * the build if a row here has no matching entry in `published.json` and no
 * dictionary, or the other way round.
 *
 * `label` is the endonym, rendered in its own script on every page and never
 * translated: a reader who cannot read the page they landed on has to be able to
 * find their own language in the list.
 *
 * `ogLocale` follows what the store listings use for the same language, so a
 * shared link previews consistently with the listing it came from.
 */
export const LOCALES: SiteLocale[] = [
  { code: "zh-Hans", path: "", label: "简体中文", hreflang: "zh-Hans", ogLocale: "zh_CN" },
  { code: "zh-Hant", path: "zh-hant", label: "繁體中文", hreflang: "zh-Hant", ogLocale: "zh_TW" },
  { code: "en", path: "en", label: "English", hreflang: "en", ogLocale: "en_US" },
  { code: "ja", path: "ja", label: "日本語", hreflang: "ja", ogLocale: "ja_JP" },
  { code: "ko", path: "ko", label: "한국어", hreflang: "ko", ogLocale: "ko_KR" },
  { code: "es", path: "es", label: "Español", hreflang: "es", ogLocale: "es_ES" },
  { code: "fr", path: "fr", label: "Français", hreflang: "fr", ogLocale: "fr_FR" },
  { code: "pt", path: "pt", label: "Português", hreflang: "pt", ogLocale: "pt_BR" },
  { code: "ru", path: "ru", label: "Русский", hreflang: "ru", ogLocale: "ru_RU" },
  { code: "vi", path: "vi", label: "Tiếng Việt", hreflang: "vi", ogLocale: "vi_VN" },
];

const PUBLISHED = new Set<string>(published.locales);

/** True when the locale has pages built, and so may be linked to or redirected to. */
export function isPublished(code: string): boolean {
  return PUBLISHED.has(code);
}

/**
 * The locales the site actually serves, in switcher order.
 *
 * This — not `LOCALES` — is what the switcher renders and what the middleware is
 * allowed to redirect to. The two are the same set while every row is published;
 * keeping the distinction is what lets a row be added ahead of its dictionary
 * without that language becoming reachable and 404ing in the meantime.
 */
export const PUBLISHED_LOCALES: SiteLocale[] = LOCALES.filter((locale) =>
  PUBLISHED.has(locale.code),
);

/**
 * Published locales that get a URL prefix — everything except the default.
 *
 * The `[lang]` routes enumerate this, so publishing a locale means adding it to
 * `published.json` and shipping its dictionary. There is no second list of pages
 * to keep in step.
 */
export const PREFIXED_LOCALES: SiteLocale[] = PUBLISHED_LOCALES.filter(
  (locale) => locale.code !== DEFAULT_LOCALE,
);

const BY_CODE = new Map(LOCALES.map((locale) => [locale.code, locale]));
const BY_PATH = new Map(
  LOCALES.filter((locale) => locale.path !== "").map((locale) => [locale.path, locale]),
);

export function getLocale(code: string): SiteLocale | undefined {
  return BY_CODE.get(code);
}

/** Resolve a URL path segment back to its locale, or `undefined` if unprefixed. */
export function getLocaleByPathSegment(segment: string): SiteLocale | undefined {
  return BY_PATH.get(segment.toLowerCase());
}

/**
 * Fold an arbitrary `Accept-Language` tag onto one of ours.
 *
 * Workers has no `Intl.Locale` matcher worth relying on and no locale negotiation
 * at all, so this is the whole algorithm: try the tag as written, then drop
 * subtags one at a time (`zh-Hant-TW` → `zh-Hant` → `zh`), then consult the
 * explicit alias table for the cases subtag-dropping cannot express.
 *
 * The aliases are where the real decisions live. `zh` alone is ambiguous between
 * the two Chinese locales we ship, and a bare-`zh` client is overwhelmingly
 * mainland, so it lands on `zh-Hans`; `zh-HK`/`zh-MO` are traditional-script
 * regions whatever the default-locale politics might suggest.
 */
const ACCEPT_LANGUAGE_ALIASES: Record<string, string> = {
  zh: DEFAULT_LOCALE,
  "zh-cn": DEFAULT_LOCALE,
  "zh-sg": DEFAULT_LOCALE,
  "zh-my": DEFAULT_LOCALE,
  "zh-hans": DEFAULT_LOCALE,
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  "zh-hant": "zh-Hant",
};

/**
 * @param tag A language tag, case-insensitive, e.g. `zh-Hant-TW`.
 * @returns A published locale code, or `undefined` when nothing we serve matches.
 *   Unpublished matches are deliberately not returned: a redirect to `/ja/` while
 *   `ja` has no pages is a 404, which is worse than staying on the default locale.
 */
export function matchLocaleTag(tag: string): string | undefined {
  let candidate = tag.trim().toLowerCase();
  if (!candidate) return undefined;

  while (candidate.length > 0) {
    const aliased = ACCEPT_LANGUAGE_ALIASES[candidate];
    if (aliased && PUBLISHED.has(aliased)) return aliased;
    if (PUBLISHED.has(candidate)) return candidate;
    const dash = candidate.lastIndexOf("-");
    if (dash < 0) break;
    candidate = candidate.slice(0, dash);
  }

  // A tag whose primary subtag we do not ship (`de`, `th`, `ar`) ends here, and
  // `undefined` is the correct answer — the caller then leaves the visitor on the
  // default locale rather than guessing.
  return undefined;
}
