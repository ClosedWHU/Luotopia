import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Dev-only stand-ins for the release / store APIs.
 *
 * `astro dev` never runs `functions/`, so on localhost the download page's
 * `/api/releases*`, `/api/appstore/latest` and `/api/msstore/latest` calls all
 * fail and the page shows only its error fallback. This serves snapshots of the
 * production responses from `tools/dev-fixtures/` instead, so the real layout
 * (asset lists, store versions, paged changelog) can be seen locally.
 *
 * `apply: 'serve'` keeps it out of `astro build`. Refresh a snapshot by
 * re-downloading the matching URL from www.whu.sb into the same file name:
 *   releases-latest.json   /api/releases/latest?prerelease=1
 *   releases-page-N.json   /api/releases?page=N&per_page=2
 *   appstore-latest.json   /api/appstore/latest?connect=1
 *   msstore-latest.json    /api/msstore/latest
 * Set LT_DEV_FIXTURES=0 to turn it off (e.g. to see the failure state).
 */
export function devFixtures() {
  let dir = '';
  return {
    name: 'luotopia-dev-fixtures',
    apply: 'serve',
    configResolved(config) {
      dir = path.join(config.root, 'tools', 'dev-fixtures');
    },
    configureServer(server) {
      if (process.env.LT_DEV_FIXTURES === '0') return;
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const url = new URL(req.url || '/', 'http://localhost');
        let file = null;
        if (url.pathname === '/api/releases/latest') file = 'releases-latest.json';
        else if (url.pathname === '/api/releases') {
          file = `releases-page-${Number(url.searchParams.get('page')) || 1}.json`;
        } else if (url.pathname === '/api/appstore/latest') file = 'appstore-latest.json';
        else if (url.pathname === '/api/msstore/latest') file = 'msstore-latest.json';
        if (!file) return next();

        const full = path.join(dir, file);
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        if (!existsSync(full)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'no_fixture', file }));
        }
        res.end(req.method === 'HEAD' ? undefined : readFileSync(full));
      });
    },
  };
}
