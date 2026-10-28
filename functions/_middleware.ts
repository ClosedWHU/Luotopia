import {
  DEFAULT_LOCALE,
  getLocale,
  getLocaleByPathSegment,
  isPublished,
  matchLocaleTag,
} from "../src/i18n/locales";
import { normalizePath, pathInLocale } from "../src/i18n/routes";
import { resolveDocsRedirect } from "./lib/docs-redirects";

const MAIN_DOMAIN = "www.whu.sb";

/* -------------------------------------------------------------------------- */
/* Language negotiation                                                        */
/* -------------------------------------------------------------------------- */

/*
 * Why this lives here and not in the Astro config: the site is a static build
 * with no adapter, so there is no server to read request headers on.
 * `Astro.preferredLocale` is `undefined` in a static output and Astro's own i18n
 * middleware runs at build time. This Pages Function is the only thing in the
 * deployment that executes per request, which makes it the only place that can
 * see `Accept-Language`.
 *
 * The locale table is imported from `src/i18n/locales` rather than restated: one
 * list, and the build config, the switcher and this negotiation cannot disagree
 * about which languages exist.
 */

/**
 * Records an explicit choice, so detection stops overriding it.
 *
 * Only the switcher's `?lang=` link ever writes this. Deriving it from "the path
 * had a locale prefix" would be wrong in the direction that matters: on `/en/`,
 * the nav link to an untranslated page points at the Chinese original, and
 * following it would silently flip the visitor's recorded preference to `zh-Hans`
 * and bounce them back to Chinese on every later visit.
 */
const LANG_COOKIE = "luotopia_lang";
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Path prefixes that are endpoints or asset namespaces, never site pages.
 *
 * Needed because `prefersHtml()` alone is not enough: typing
 * `/api/releases/latest` into an address bar *is* an HTML navigation as far as
 * the headers are concerned, and redirecting it to `/en/api/releases/latest`
 * would turn a working endpoint into a 404.
 */
const NON_PAGE_PREFIXES = [
  "/api/",
  "/_astro/",
  "/scales/",
  "/hot-update/",
  "/.well-known/",
  "/fonts/",
  "/img/",
  // The documentation site (Starlight subproject under /docs) is zh-Hans
  // only; locale negotiation must never prefix it (/en/docs does not exist).
  "/docs",
];

/** True for anything that is a file or an endpoint rather than a routable page. */
function looksLikeAsset(pathname: string): boolean {
  if (NON_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // A dot in the last segment means an extension: `/favicon.svg`,
  // `/img/app-icon.png`, `/brand/logo.svg`. No page route on this site has one.
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.indexOf(".") !== -1;
}

/** True when the first path segment already names a locale we serve. */
function hasLocalePrefix(pathname: string): boolean {
  const first = pathname.split("/")[1] ?? "";
  return first !== "" && getLocaleByPathSegment(first) !== undefined;
}

interface LanguageRange {
  tag: string;
  q: number;
}

/**
 * Parse `en-GB,en;q=0.9,zh-CN;q=0.8,*;q=0.1` into ranges, best first.
 *
 * Deliberately a hand-rolled parser: Workers has no `Intl.Locale` matcher worth
 * depending on here, and the grammar is four lines. A malformed range is skipped
 * rather than throwing — a broken header must cost the visitor their preference,
 * not the request.
 */
function parseAcceptLanguage(header: string): LanguageRange[] {
  const ranges: LanguageRange[] = [];
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let tag = trimmed;
    let q = 1;
    const params = trimmed.split(";");
    tag = params[0].trim();
    for (let i = 1; i < params.length; i += 1) {
      const param = params[i].trim();
      if (!param.toLowerCase().startsWith("q=")) continue;
      const parsed = Number.parseFloat(param.slice(2));
      // `q=0` is an explicit refusal, and NaN means the parameter was junk —
      // both are kept (as 0 and as the default 1 respectively) rather than
      // dropped, so the ordering below stays faithful to what was sent.
      q = Number.isNaN(parsed) ? 1 : parsed;
    }
    if (!tag || tag === "*") continue;
    ranges.push({ tag, q });
  }
  // Stable by construction in every runtime that matters, and `sort` is
  // guaranteed stable since ES2019 — equal-q tags keep their sent order, which
  // is the tie-break the spec asks for.
  return ranges.sort((a, b) => b.q - a.q);
}

/**
 * The best locale we actually serve for this header.
 *
 * `q=0` ranges are skipped: they are a refusal, and honouring one by falling
 * through to a *lower*-q match would be the opposite of what the client asked
 * for. `matchLocaleTag` already refuses unpublished locales, so a Japanese
 * browser is left on the default rather than redirected to a `/ja/` that 404s.
 */
function negotiateLocale(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const range of parseAcceptLanguage(header)) {
    if (range.q <= 0) continue;
    const matched = matchLocaleTag(range.tag);
    if (matched) return matched;
  }
  return undefined;
}

/** The recorded explicit choice, if it still names a locale we serve. */
function readLangCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== LANG_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    // A stale value (a locale we later unpublished) counts as no preference, so
    // detection gets another chance instead of the visitor being pinned to a
    // language the site no longer builds.
    return isPublished(value) ? value : undefined;
  }
  return undefined;
}

/**
 * Deep-link host registered by the app as Android App Links (autoVerify) and
 * iOS Universal Links (applinks). When the app is installed and verified the
 * OS opens it and never reaches this worker; every request that *does* land
 * here (missing install, failed verification, in-app browsers, address-bar
 * entry) is an HTML navigation for a route the app owns, so it is served the
 * /open/ launch page — with the original URL preserved, because that URL *is*
 * the deep link the page's script maps back onto luotopia://app/<path>.
 */
const DEEPLINK_DOMAIN = "luotopia.whu.sb";

/**
 * Former home of the standalone documentation site (ClosedWHU/Luotopia-Docs,
 * first Docusaurus then Starlight on its own Worker). The docs are now
 * first-class pages of this site under /docs; once the domain is attached to
 * this Pages project, every path 301s to its canonical main-domain URL in a
 * single hop — legacy URLs included, resolved through the same generated map
 * that powers the on-site redirect table (src/config/docs/redirects.mjs), so
 * the two lists can never disagree.
 */
const DOCS_DOMAIN = "docs.whu.sb";

/** Allowed hosts (local dev + production family). */
const WHITELIST: string[] = [
  "localhost",
  "localhost:4321",
  "127.0.0.1",
  "127.0.0.1:4321",
  "www.whu.sb",
  "whu.sb",
  "*.whu.sb",
];

/** Force redirect to MAIN_DOMAIN (e.g. CF default hostnames). */
const BLACKLIST: string[] = [
  "*.workers.dev",
  "*.pages.dev",
];

function matchDomain(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return host === pattern.slice(2) || host.endsWith(suffix);
  }
  return false;
}

type AssetsBinding = { fetch(request: Request | string): Promise<Response> };

type Context = {
  request: Request;
  next: (request?: Request) => Promise<Response>;
  env?: { ASSETS?: AssetsBinding };
};

/**
 * Does this client want a document?
 *
 * Browsers navigating always name `text/html` in `Accept`; curl, wget, httpie
 * and most HTTP libraries send a bare wildcard instead, which is a claim to
 * accept anything rather than a request for a page. `Sec-Fetch-Dest` is the
 * tie-breaker for the rare client that negotiates generically — it is set by
 * the platform, not by the caller, so it cannot be spoofed by accident the way
 * `Accept` can.
 *
 * The distinction earns its keep on 404s: the real page is a full document
 * (fonts, a WebGL aurora, a shader chunk) whose entire purpose is a pointer
 * nobody on a terminal is going to move. Printing that into a shell is 34 KB of
 * noise where one line would do.
 */
function prefersHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html") || accept.includes("application/xhtml+xml")) return true;
  const dest = request.headers.get("sec-fetch-dest");
  return dest === "document" || dest === "iframe" || dest === "frame";
}

/**
 * One line, no ANSI art, no trailing blank.
 *
 * Deliberately terse: this lands in a terminal, a CI log or a `curl -i` someone
 * is debugging with. The path is included because that is the only part of the
 * request the caller cannot already see, and the site root because a shell has
 * no breadcrumb trail to follow back.
 */
function plainTextNotFound(pathname: string, method: string): Response {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    // A 404 is the one response that must not stick: the path may exist after
    // the next deploy.
    "cache-control": "public, max-age=0, must-revalidate",
    "x-content-type-options": "nosniff",
  });
  return new Response(
    // HEAD gets the headers and no body, per RFC 9110 — the status line is the
    // entire answer to a HEAD.
    method === "HEAD" ? null : `404 Not Found: ${pathname}\nSite home: https://${MAIN_DOMAIN}/\n`,
    { status: 404, headers },
  );
}

export async function onRequest(context: Context): Promise<Response> {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const host = url.host;

  if (host === DEEPLINK_DOMAIN) {
    const path = url.pathname;
    // Association files must be served byte-exact at their canonical path:
    // Apple's CDN and Android's verifier treat a redirect (or the launch
    // page's HTML in their place) as a failed verification.
    if (path.startsWith("/.well-known/")) {
      return next(request);
    }
    if (path === "/open" || path.startsWith("/open/")) {
      return next(request);
    }
    // Only top-level navigations negotiate text/html; _astro bundles, icons,
    // /api and favicons ask for something else and fall through to the normal
    // static/function pipeline.
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/html") && env?.ASSETS) {
      /*
       * Serve the launch page in the visitor's language.
       *
       * A rewrite, not a redirect, exactly as before: the page's script reads
       * `location.pathname` to work out which `luotopia://app/<path>` to hand the
       * OS, so the browser must never leave the original deep-link URL. Only the
       * document behind it changes.
       *
       * `?lang=` wins outright here, and it is the parameter the *app* is expected
       * to pass: the app knows its own locale, which beats inferring one from the
       * OS. That matters because the two disagree often enough to be a support
       * issue — an English system running an app the user deliberately set to
       * Chinese. No cookie is written: this is a different host from
       * `www.whu.sb`, so a cookie set here would not be sent there and would only
       * look like a preference that never applies.
       *
       * Falls back to the default locale's page rather than 404ing, so an
       * unpublished or bogus `lang` cannot break a deep link.
       */
      const requested = url.searchParams.get("lang");
      const wanted =
        (requested ? matchLocaleTag(requested) : undefined) ??
        readLangCookie(request) ??
        // `accept` above is the Accept header, which is what gates this branch;
        // negotiation needs Accept-Language. Easy to conflate, and the failure is
        // silent: every deep link would serve the default locale.
        negotiateLocale(request.headers.get("accept-language"));
      const target = wanted && wanted !== DEFAULT_LOCALE ? getLocale(wanted) : undefined;
      const landing = target?.path ? `/${target.path}/open/` : "/open/";
      return env.ASSETS.fetch(
        new Request(new URL(landing, url), {
          method: "GET",
          headers: { accept: "text/html" },
        }),
      );
    }
    return next(request);
  }

  if (host === DOCS_DOMAIN) {
    // One hop to the canonical URL; the query survives, and the browser
    // re-attaches the fragment across the redirect.
    return Response.redirect(
      `https://${MAIN_DOMAIN}${resolveDocsRedirect(url.pathname)}${url.search}`,
      301,
    );
  }

  if (host !== MAIN_DOMAIN) {
    const isBlacklisted = BLACKLIST.some((p) => matchDomain(p, host));
    if (isBlacklisted) {
      return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
    }

    const isWhitelisted = WHITELIST.some((p) => matchDomain(p, host));
    if (!isWhitelisted) {
      return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
    }
  }

  /*
   * Language negotiation, in two halves: an explicit choice, then detection.
   *
   * Both run only after the host canonicalisation above, so they never fire on a
   * request that is about to be 302'd to `www.whu.sb` anyway, and never on the
   * deep-link host — which returned earlier, because `luotopia.whu.sb/*` is
   * claimed wholesale by the app and its `/open/` landing page is not a place to
   * be bouncing visitors through a second redirect.
   */
  const requestedLang = url.searchParams.get("lang");
  if (requestedLang) {
    const chosen = matchLocaleTag(requestedLang);
    if (chosen) {
      /*
       * Land on that locale's copy of *this* page, not merely on the same path
       * with the parameter removed. `pathInLocale` already falls back to the
       * default locale's URL when the chosen language has no translation, so
       * switching to English from `/status` records the preference and leaves the
       * visitor on the only status page there is — instead of stranding them on a
       * `/en/status` that does not exist.
       *
       * `lang` is stripped, other query parameters survive: the parameter marks
       * the click as deliberate, and leaving it in the address bar would put it
       * into every link the visitor subsequently shares.
       */
      url.searchParams.delete("lang");
      const query = url.searchParams.toString();
      return new Response(null, {
        status: 302,
        headers: {
          location: `${pathInLocale(url.pathname, chosen)}${query ? `?${query}` : ""}`,
          "set-cookie": `${LANG_COOKIE}=${chosen}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax; Secure`,
          // A redirect that depends on a cookie we just set must not be cached.
          "cache-control": "no-store",
          vary: "Accept-Language, Cookie",
        },
      });
    }
  }

  /*
   * First-visit detection.
   *
   * Four guards, each covering a way this could go wrong:
   *
   * - `prefersHtml()` — only real navigations. This is what keeps `_astro`
   *   bundles, fonts and prefetches out; a prefetched link carries
   *   `sec-fetch-dest: empty`, so `prefetchAll: true` in the Astro config does
   *   not turn every hover into a redirect storm.
   * - `looksLikeAsset()` — because an address-bar visit to `/api/releases/latest`
   *   *does* look like an HTML navigation, and redirecting it would break it.
   * - `hasLocalePrefix()` — the visitor is already on a language's copy.
   * - `readLangCookie()` — they have chosen one before, and detection must not
   *   overrule a choice.
   *
   * Detection writes no cookie. Only the explicit `?lang=` above does. A
   * detection that persisted itself would freeze a guess made from the OS locale
   * into a preference the visitor never expressed, and there would be no way to
   * get back to auto-detection short of clearing site data.
   */
  if (
    prefersHtml(request) &&
    !looksLikeAsset(url.pathname) &&
    !hasLocalePrefix(url.pathname) &&
    readLangCookie(request) === undefined
  ) {
    const detected = negotiateLocale(request.headers.get("accept-language"));
    if (detected) {
      /*
       * `pathInLocale` is both the guard and the target.
       *
       * It returns the requested path unchanged when that locale has no
       * translation of it, so comparing against the normalised pathname is what
       * stops the loop this would otherwise create: `/status` with
       * `Accept-Language: en` used to redirect to `/en/status`, which does not
       * exist, which the 404 fallback below sent back to `/status`, which
       * detected English again. Redirecting only to a page the locale really has
       * means `/status` simply stays put.
       *
       * It also subsumes the "is this the default locale" check — for `zh-Hans`
       * the target always equals the input, so nothing is emitted.
       */
      const target = pathInLocale(url.pathname, detected);
      // Both sides normalised: `pathInLocale` now returns trailing-slashed paths
      // (that is the form Pages serves), so comparing raw strings would redirect
      // every correctly-located request to itself, forever.
      if (normalizePath(target) !== normalizePath(url.pathname)) {
        return new Response(null, {
          status: 302,
          headers: {
            location: `${target}${url.search}`,
            // 302, never 301: a permanent redirect would be cached against the
            // URL and would keep sending this visitor to English after they
            // changed their browser language.
            "cache-control": "no-store",
            vary: "Accept-Language, Cookie",
          },
        });
      }
    }
  }

  /*
   * 404s are the platform's job, and shipping `src/pages/404.astro` is what
   * hands it back to the platform.
   *
   * Pages decides between "custom 404" and "single-page application" purely on
   * whether the build output contains a top-level `404.html`: with one, a miss
   * is answered by that file at status 404; without one, Pages assumes an SPA
   * and rewrites *every* unmatched path to `/` at 200. This site had no
   * `404.html`, which is why `/typo` — and even `/missing.png` — used to come
   * back as the homepage. There is no dashboard toggle and no `wrangler.jsonc`
   * key for it on Pages (`assets.not_found_handling` belongs to Workers static
   * assets, a different product); the file *is* the configuration.
   *
   * All that is left here is the part the platform cannot do: pick the body's
   * format for the client that asked. `next()` has already produced the right
   * status and the right document, so this only ever swaps the representation.
   */
  const response = await next(request);

  /*
   * Localised-path fallback.
   *
   * A locale translates only part of the site — see `TRANSLATED_ROUTES` in
   * `src/i18n/routes.ts` — so `/en/status` has no document. Site navigation never
   * links there (`routeUrl()` sends those links straight to `/status`), but a
   * hand-typed URL, a stale bookmark or a crawler that spotted the `/en/` pattern
   * lands here anyway, and a 404 is a dead end when the same content is one hop
   * away.
   *
   * This is what `i18n.fallback` in the Astro config is nominally for, and why it
   * is not used: it emits 2-second meta-refresh stubs at build time, canonicalises
   * them to the apex domain, and cannot tell its own stubs apart from the real
   * `/en/*` routes. A 302 here costs one hop on a path that was already a miss.
   *
   * Redirect rather than serve the default-locale document under the prefixed
   * URL: that document's `<html lang>` and `hreflang` describe the default
   * locale, so answering 200 at `/en/status` would put a mislabelled duplicate in
   * the index.
   *
   * No loop: the target has no locale prefix, so this branch cannot fire on it.
   * If the unprefixed path is *also* a miss, the visitor gets the real 404 page.
   */
  if (response.status === 404 && prefersHtml(request) && env?.ASSETS) {
    const segments = url.pathname.split("/").filter(Boolean);
    const prefixed = segments.length > 0 ? getLocaleByPathSegment(segments[0]) : undefined;

    /*
     * A miss on a locale-prefixed path has two possible causes, and they need
     * different answers.
     *
     * The path might exist in the default locale but not in this one — the state
     * a partly-translated site is in. Then the right answer is a 302 to the
     * unprefixed URL, because the content the visitor wanted does exist.
     *
     * Or it might not exist anywhere, in which case a 302 would just move the
     * miss and the visitor gets the default locale's 404 page in a language they
     * may not read. So probe first, and only redirect on a hit.
     */
    if (prefixed) {
      const rest = segments.slice(1).join("/");
      const probe = await env.ASSETS.fetch(
        new Request(new URL(`/${rest}${url.search}`, url), {
          method: "GET",
          headers: { accept: "text/html" },
        }),
      );
      await probe.body?.cancel();
      if (probe.status !== 404) {
        await response.body?.cancel();
        return new Response(null, {
          status: 302,
          headers: {
            location: `/${rest}${url.search}`,
            "cache-control": "no-store",
            vary: "Accept-Language",
          },
        });
      }
    }

    /*
     * Serve this visitor's own 404 document, still at status 404.
     *
     * `dist/404.html` is the file that tells Pages this project has a custom 404
     * rather than being an SPA, and there can only be one — so the nine
     * translations are ordinary routes at `/<locale>/404/` (built by
     * `src/pages/[lang]/404.astro`) and get substituted in here. That is the same
     * job the plain-text branch below does, choosing language instead of
     * representation, and it belongs in the same place for the same reason: the
     * platform decides that a path missed, and only a Function can decide what the
     * visitor is shown for it.
     *
     * Locale comes from the URL prefix if there is one, else the recorded choice,
     * else detection — the same precedence as everywhere else, so a 404 does not
     * suddenly speak a different language from the page the visitor came from.
     *
     * `ASSETS.fetch` goes straight to the asset store and does not re-enter
     * Functions, so this cannot recurse.
     */
    const wanted =
      prefixed?.code ??
      readLangCookie(request) ??
      negotiateLocale(request.headers.get("accept-language"));
    const target = wanted && wanted !== DEFAULT_LOCALE ? getLocale(wanted) : undefined;
    if (target?.path) {
      const localized = await env.ASSETS.fetch(
        new Request(new URL(`/${target.path}/404/`, url), {
          method: "GET",
          headers: { accept: "text/html" },
        }),
      );
      if (localized.status === 200) {
        await response.body?.cancel();
        const headers = new Headers(localized.headers);
        // A 404 must not stick: the path may exist after the next deploy.
        headers.set("cache-control", "public, max-age=0, must-revalidate");
        headers.append("vary", "Accept-Language, Cookie");
        return new Response(localized.body, { status: 404, headers });
      }
      await localized.body?.cancel();
    }
  }

  /*
   * The `text/html` guard matters. Pages answers a miss with `404.html`, but a
   * Function answering its own route — `/api/*` returning a JSON 404, the font
   * proxy returning "Not found" — has already chosen a representation that fits
   * its caller. Rewriting those into prose would break clients that parse them,
   * so only the document Pages substituted is ever replaced.
   */
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 404 && contentType.includes("text/html") && !prefersHtml(request)) {
    // Drain before replacing, so the discarded document is not left hanging on
    // the runtime side of the stream.
    await response.body?.cancel();
    return plainTextNotFound(url.pathname, request.method);
  }

  return response;
}
