const MAIN_DOMAIN = 'www.whu.sb';

const WHITELIST: string[] = [
  'localhost',
  'localhost:4321',
  '127.0.0.1',
  '127.0.0.1:4321',
  '*.whu.sb',
  '*.luotopia.cc',
  '*.pages.dev',
  '*.vercel.app',
];

const BLACKLIST: string[] = [];

function matchDomain(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix);
  }
  return false;
}

export async function onRequest(context: { request: Request; next: (request?: Request) => Promise<Response> }): Promise<Response> {
  const { request, next } = context;
  const url = new URL(request.url);
  const host = url.host;

  const isBlacklisted = BLACKLIST.some((p) => matchDomain(p, host));
  if (isBlacklisted) {
    return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
  }

  const isWhitelisted = WHITELIST.some((p) => matchDomain(p, host));
  if (!isWhitelisted && host !== MAIN_DOMAIN) {
    return Response.redirect(`https://${MAIN_DOMAIN}${url.pathname}${url.search}`, 302);
  }

  return next(request);
}
