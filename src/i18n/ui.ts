/**
 * Translation lookup for the site's UI copy.
 *
 * Build-time only. Nothing here may be imported from a `<script>` block: the
 * dictionaries are megabytes-scale JSON in aggregate and the client bundle has a
 * Chrome 66 syntax floor (see `docs/development.md`). Client-side code that needs
 * a string reads it back out of the DOM instead — the pattern
 * `ScreenshotCarousel.astro` already uses for its slide labels, and the one the
 * language switcher follows for its announcement templates.
 */
import zhHans from "./zh-Hans.json";
import zhHant from "./zh-Hant.json";
import en from "./en.json";
import ja from "./ja.json";
import ko from "./ko.json";
import es from "./es.json";
import fr from "./fr.json";
import pt from "./pt.json";
import ru from "./ru.json";
import vi from "./vi.json";
import { DEFAULT_LOCALE, PUBLISHED_LOCALES, getLocale, type SiteLocale } from "./locales";
import {
  ROUTES,
  isRouteTranslated,
  pathInLocale,
  routeKeyForPath,
  splitLocalePrefix,
  type RouteKey,
} from "./routes";

/*
 * Re-exported so components have one import site. The table itself lives in
 * `./routes` because `functions/_middleware.ts` needs it too, and that file runs
 * where `astro:i18n` does not exist.
 */
export {
  ALL_ROUTES,
  ROUTES,
  TRANSLATED_ROUTES,
  hasLocalizedPage,
  isRouteTranslated,
  normalizePath,
  pathInLocale,
  routeKeyForPath,
  splitLocalePrefix,
} from "./routes";
export type { RouteKey } from "./routes";

/**
 * The key set is defined by the default locale's dictionary, and every other
 * dictionary is checked against it below *and* by `tools/check-i18n.mjs`.
 *
 * `satisfies Record<TranslationKey, …>` on each entry is what fails the build when
 * a key is added to `zh-Hans.json` and forgotten elsewhere. That is the common
 * direction of drift, and catching it here rather than at runtime is the whole
 * point of typing the dictionaries at all. The script covers the other direction
 * (stale keys, placeholder mismatches, array lengths), which the type system
 * cannot express.
 *
 * A JSON module cannot be enumerated at build time, so this map is written out by
 * hand and is the one step of "add a locale" that the file system cannot do for
 * you. Forgetting it is silent and total — every page in that locale renders in
 * Chinese, because `resolveLocale()` falls back when `hasDictionary()` says no —
 * so `tools/check-i18n.mjs` asserts that every published locale is registered
 * here.
 */
export type TranslationKey = keyof typeof zhHans;
type TranslationValue = string | string[];
type Dictionary = Record<TranslationKey, TranslationValue>;

const DICTIONARIES: Record<string, Dictionary> = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant satisfies Dictionary,
  en: en satisfies Dictionary,
  ja: ja satisfies Dictionary,
  ko: ko satisfies Dictionary,
  es: es satisfies Dictionary,
  fr: fr satisfies Dictionary,
  pt: pt satisfies Dictionary,
  ru: ru satisfies Dictionary,
  vi: vi satisfies Dictionary,
};

/** The locale codes this module can actually serve, in `published.json` order. */
export const REGISTERED_LOCALES: string[] = Object.keys(DICTIONARIES);

function hasDictionary(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES, code);
}

/** `{from}`-style placeholders. Kept deliberately dumb — no plurals, no genders. */
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

export type TranslationVars = Record<string, string | number>;

export interface Translator {
  /** Interpolated string lookup. Falls back to the default locale, then to the key. */
  (key: TranslationKey, vars?: TranslationVars): string;
  /** Array-valued lookup, for the hero rotator's word list. */
  list(key: TranslationKey): string[];
  /** The locale this translator resolves to (may differ from what was asked for). */
  readonly locale: string;
}

/**
 * @param code A locale code from `locales.ts`. Unknown codes and codes without a
 *   dictionary both resolve to the default locale rather than throwing: a
 *   half-finished locale must never take a page down.
 */
export function useTranslations(code: string): Translator {
  const locale = hasDictionary(code) ? code : DEFAULT_LOCALE;
  const primary = DICTIONARIES[locale];
  const fallback = DICTIONARIES[DEFAULT_LOCALE];

  const raw = (key: TranslationKey): TranslationValue | undefined =>
    primary[key] ?? fallback[key];

  const t = ((key: TranslationKey, vars?: TranslationVars): string => {
    const value = raw(key);
    if (typeof value !== "string") {
      // A missing key renders as itself rather than as a blank. Ugly on purpose:
      // a gap in a dictionary should be visible in the page, not silent.
      return key;
    }
    if (!vars) return value;
    return value.replace(PLACEHOLDER, (match, name: string) => {
      const replacement = vars[name];
      return replacement === undefined ? match : String(replacement);
    });
  }) as Translator;

  t.list = (key: TranslationKey): string[] => {
    const value = raw(key);
    return Array.isArray(value) ? value : [];
  };

  Object.defineProperty(t, "locale", { value: locale, enumerable: false });
  return t;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The URL a given route should be linked to from a page in `locale`.
 *
 * Returns the locale-prefixed URL when that locale really has the page, and the
 * default-locale URL otherwise — so no link on the site ever points at a page
 * that does not exist, and none of them cost a redirect hop.
 */
export function routeUrl(locale: string, route: RouteKey): string {
  return pathInLocale(ROUTES[route], locale);
}

/** The locale a rendered page is in, defaulting rather than throwing. */
export function resolveLocale(code: string | undefined): string {
  return code && hasDictionary(code) ? code : DEFAULT_LOCALE;
}

export function localeMeta(code: string): SiteLocale {
  return getLocale(code) ?? getLocale(DEFAULT_LOCALE)!;
}

/* -------------------------------------------------------------------------- */
/* <head>                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Canonical origin for absolute URLs in `<head>`.
 *
 * Not read from Astro's `site` config, which is the apex `https://whu.sb`.
 * `functions/_middleware.ts` 302s the apex to `www.whu.sb`, so an `hreflang`
 * pointing at it would hand crawlers a URL that answers with a redirect — and a
 * redirect inside an alternate-locale cluster is treated as a broken alternate.
 */
export const SITE_ORIGIN = "https://www.whu.sb";

export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

/**
 * The `<link rel="alternate" hreflang>` set for a rendered page.
 *
 * Only locales that genuinely have this page are listed. Claiming an alternate
 * that 404s — or that redirects to a different language — is worse than claiming
 * none: crawlers validate the cluster and drop the whole set when a member does
 * not reciprocate.
 *
 * `x-default` points at the default locale's copy, which is the honest answer to
 * "which one should you show if you cannot tell". For a path no locale has
 * translated (a legal document, `/status`), that is the only entry emitted.
 */
export function hreflangAlternates(pathname: string): HreflangAlternate[] {
  const { rest } = splitLocalePrefix(pathname);
  const routeKey = routeKeyForPath(rest);
  const alternates: HreflangAlternate[] = [];

  for (const locale of PUBLISHED_LOCALES) {
    if (routeKey && !isRouteTranslated(locale.code, routeKey)) continue;
    const path = routeKey ? routeUrl(locale.code, routeKey) : rest;
    alternates.push({ hreflang: locale.hreflang, href: `${SITE_ORIGIN}${path}` });
  }

  const defaultPath = routeKey ? routeUrl(DEFAULT_LOCALE, routeKey) : rest;
  alternates.push({ hreflang: "x-default", href: `${SITE_ORIGIN}${defaultPath}` });
  return alternates;
}