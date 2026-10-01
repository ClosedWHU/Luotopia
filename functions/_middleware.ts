const MAIN_DOMAIN = "www.whu.sb";

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
      return env.ASSETS.fetch(
        new Request(new URL("/open/", url), {
          method: "GET",
          headers: { accept: "text/html" },
        }),
      );
    }
    return next(request);
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
