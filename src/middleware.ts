import { defineMiddleware } from 'astro/middleware';
import { domainProtection } from './config/domain-protection';

function matchDomain(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host !== suffix.slice(1);
  }
  return false;
}

export const onRequest = defineMiddleware((context, next) => {
  const host = context.request.headers.get('host') || '';
  const mainDomain = domainProtection.mainDomain;

  const isBlacklisted = domainProtection.blacklist.some((p) => matchDomain(p, host));
  if (isBlacklisted) {
    return context.redirect(`https://${mainDomain}`, 302);
  }

  const isWhitelisted = domainProtection.whitelist.some((p) => matchDomain(p, host));
  if (!isWhitelisted && host && host !== mainDomain) {
    return context.redirect(`https://${mainDomain}`, 302);
  }

  return next();
});
