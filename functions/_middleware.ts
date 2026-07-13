const MAIN_DOMAIN = "www.whu.sb";

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

export async function onRequest(context: {
  request: Request;
  next: (request?: Request) => Promise<Response>;
}): Promise<Response> {
  const { request, next } = context;
  const url = new URL(request.url);
  const host = url.host;

  if (host === MAIN_DOMAIN) {
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
