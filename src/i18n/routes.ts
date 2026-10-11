/**
 * The site's route table, and which locales translate which routes.
 *
 * Split out of `ui.ts` for two reasons.
 *
 * The first is runtime: `functions/_middleware.ts` needs this table to decide
 * whether an auto-detected locale actually has the requested page, and that file
 * runs in the Cloudflare Workers runtime where `astro:i18n` — which `ui.ts`
 * imports for URL generation — does not exist.
 *
 * The second is a redirect loop. Without it, `Accept-Language: en` on `/status`
 * sends the visitor to `/en/status`, which does not exist, which the same
 * middleware then falls back to `/status`, which detects English again — forever.
 * Gating detection on this table is what breaks the cycle: a locale is only ever
 * redirected *to* a page it really has.
 *
 * ASCII only, including in comments. `pruneFontSubsets()` in `astro.config.mjs`
 * derives the site charset by scanning source text under `src/`, so a non-ASCII
 * character anywhere in this file retains a MiSans `@font-face` subset for a glyph
 * no page renders.
 */
import { DEFAULT_LOCALE, getLocale, getLocaleByPathSegment } from "./locales";

/**
 * Every route the navbar and footer link to, plus the ones only reachable by
 * direct URL. Keyed by a stable name so a translated page can be recorded without
 * repeating its path once per locale.
 *
 * Deeper paths (`/legal/terms`, `/legal/privacy`, `/legal/cross-border`) are not
 * listed: they are generated from `src/config/legal.ts`, which is Chinese-only,
 * and no locale other than the default has them. They fall through
 * `hasLocalizedPage()` as "not translated", which is the correct answer.
 */
export const ROUTES = {
  home: "/",
  features: "/features",
  download: "/download",
  community: "/community",
  status: "/status",
  brand: "/brand",
  legal: "/legal",
  open: "/open",
} as const;

export type RouteKey = keyof typeof ROUTES;

export const ALL_ROUTES = Object.keys(ROUTES) as RouteKey[];

/**
 * Which routes genuinely have a translated page, per locale.
 *
 * Explicit rather than derived, and that is the point: this is the one place that
 * records "this locale is only partly translated". Everything downstream reads it
 * — nav hrefs, the switcher's target for the current page, `hreflang`, and the
 * middleware's decision whether to redirect at all — so a half-translated locale
 * links its translated pages locally and sends the rest to the default-locale URL
 * *directly*, with no redirect hop and no 404.
 *
 * `tools/check-i18n.mjs` asserts this table against `dist/` in both directions:
 * a claimed route that was not built fails, and a built `/<locale>/<page>/` that
 * the table does not claim fails too. Publishing a page without recording it here
 * would leave the switcher unable to link back from it.
 */
export const TRANSLATED_ROUTES: Record<string, readonly RouteKey[]> = {
  "zh-Hans": ALL_ROUTES,
  "en": ["home", "features"],
};

/** Strip a trailing slash, mapping the empty result back to `/`. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** The `RouteKey` a path corresponds to, or `undefined` for anything deeper. */
export function routeKeyForPath(pathname: string): RouteKey | undefined {
  const normalized = normalizePath(pathname);
  return ALL_ROUTES.find((key) => ROUTES[key] === normalized);
}

export function isRouteTranslated(locale: string, route: RouteKey): boolean {
  const routes = TRANSLATED_ROUTES[locale];
  return routes !== undefined && routes.indexOf(route) !== -1;
}

/**
 * True when `locale` has a real page at `pathname`.
 *
 * This is the guard the middleware needs before redirecting anyone: sending a
 * visitor to a path their locale does not have produces a 404 at best and a
 * redirect loop at worst.
 */
export function hasLocalizedPage(locale: string, pathname: string): boolean {
  const key = routeKeyForPath(pathname);
  return key !== undefined && isRouteTranslated(locale, key);
}

/**
 * Split a pathname into its locale prefix (if any) and the route underneath.
 *
 * The default locale has no prefix, so `splitLocalePrefix("/features")` returns
 * `/features` unchanged.
 */
export function splitLocalePrefix(pathname: string): { locale: string; rest: string } {
  const normalized = normalizePath(pathname);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length > 0) {
    const match = getLocaleByPathSegment(segments[0]);
    if (match) {
      const rest = segments.slice(1).join("/");
      return { locale: match.code, rest: rest === "" ? "/" : `/${rest}` };
    }
  }
  return { locale: DEFAULT_LOCALE, rest: normalized };
}

/**
 * Where the content at `pathname` — in whatever locale it is currently served —
 * lives in `locale`.
 *
 * Falls back to the default locale's URL when `locale` has no translation, which
 * is what keeps both the switcher and the middleware honest: on `/status`,
 * choosing English lands on the Chinese status page rather than on a 404 or a
 * loop, and the visitor's cookie still records the choice for the pages that do
 * have one.
 */
export function pathInLocale(pathname: string, locale: string): string {
  const { rest } = splitLocalePrefix(pathname);
  const target = hasLocalizedPage(locale, rest) ? locale : DEFAULT_LOCALE;
  const prefix = getLocale(target)?.path ?? "";
  if (!prefix) return rest;
  return `/${prefix}${rest === "/" ? "/" : rest}`;
}
