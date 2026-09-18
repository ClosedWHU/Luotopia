const MAIN_DOMAIN = "www.whu.sb";

/**
 * Deep-link host registered by the app as Android App Links (autoVerify) and
 * iOS Universal Links (applinks:). When the app is installed and verified the
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

export async function onRequest(context: {
  request: Request;
  next: (request?: Request) => Promise<Response>;
  env?: { ASSETS?: AssetsBinding };
}): Promise<Response> {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const host = url.host;

  if (host === MAIN_DOMAIN) {
    return next(request);
  }

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

  const isBlacklisted = BLACKLIST.some((p) => matchDomain(p, host));
  if (isBlacklisted) {
    return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
  }

  const isWhitelisted = WHITELIST.some((p) => matchDomain(p, host));
  if (!isWhitelisted) {
    return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
  }

  return next(request);
}
