#!/usr/bin/env node
/**
 * Offline smoke for the bundled platform artifacts.
 *
 * The homepage's counterpart of `../proxy`'s `test/bundles.test.js`: actually
 * run `build.mjs`, then drive each artifact through its platform's entry
 * convention — ESA is `default.fetch(request)`, EdgeOne is `onRequest(context)`
 * — with a stubbed `fetch` and an injected environment. No network, no test
 * runner (homepage tools are plain node scripts); a non-zero exit is a FAIL.
 *
 * The build runs with every inlinable env name emptied, the same trick the
 * proxy test uses, so "no config → not_configured" cannot pass or fail based
 * on whatever happens to be exported in the caller's shell. The environment
 * the handlers see is injected here via `globalThis.__LUOTOPIA_HOMEPAGE_ENV__`
 * (ESA) and `context.env` (EdgeOne) — which is also the point: both adapters
 * must reach identical behaviour through their different config doors.
 *
 * Run: npm run build && npm run smoke:platforms
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SANITIZED_ENV_NAMES = [
  'UPTIMEROBOT_API_KEY', 'UPTIMEROBOT_API_URL', 'GITHUB_TOKEN', 'REPO',
  'APPSTORE_CONNECT', 'APPSTORE_CONNECT_ENABLED', 'APPSTORE_CONNECT_KEY_ID',
  'APPSTORE_CONNECT_ISSUER_ID', 'APPSTORE_CONNECT_PRIVATE_KEY', 'APPSTORE_CONNECT_APP_ID',
  'APPSTORE_BUNDLE_ID', 'APPSTORE_COUNTRY', 'APPSTORE_TRACK_ID',
  'STATUS_COUNT_DAYS', 'STATUS_SHOW_LINKS', 'STATUS_TIME_ZONE', 'STATUS_CACHE_TTL',
];

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Build the artifacts with a sanitized environment                            */
/* -------------------------------------------------------------------------- */

if (!existsSync(join(ROOT, 'dist'))) {
  console.error('dist/ is missing — run `npm run build` first (the edgeone target copies it).');
  process.exit(2);
}

const childEnv = { ...process.env };
for (const name of SANITIZED_ENV_NAMES) childEnv[name] = '';
const built = spawnSync(process.execPath, ['build.mjs'], {
  cwd: ROOT,
  env: childEnv,
  encoding: 'utf8',
});
if (built.status !== 0) {
  console.error(built.stdout, built.stderr);
  console.error('build.mjs failed');
  process.exit(2);
}

/* -------------------------------------------------------------------------- */
/* Stubbed upstreams                                                           */
/* -------------------------------------------------------------------------- */

const ITUNES_LOOKUP = {
  resultCount: 1,
  results: [{
    trackId: 6744408269,
    trackName: 'Luotopia',
    bundleId: 'sb.whu.luotopia',
    version: '1.1.1',
    trackViewUrl: 'https://apps.apple.com/cn/app/id6744408269',
    fileSizeBytes: '60000000',
  }],
};

const GH_RELEASE = {
  id: 1,
  tag_name: '1.0.0+7',
  name: '1.0.0+7',
  body: '',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/ClosedWHU/Luotopia/releases/tag/1.0.0%2B7',
  published_at: '2026-09-04T10:54:59Z',
  created_at: '2026-09-04T10:00:00Z',
  assets: [],
};

const FONT_HEX = 'a'.repeat(64);
let fetchCalls = [];

globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  fetchCalls.push(url);
  if (url.startsWith('https://itunes.apple.com/lookup')) {
    return Response.json(ITUNES_LOOKUP);
  }
  if (url.includes('api.github.com') && url.includes('/releases/latest')) {
    return Response.json(GH_RELEASE);
  }
  if (url.includes('api.github.com') && url.includes('/releases?')) {
    return Response.json([GH_RELEASE]);
  }
  if (url.startsWith(`https://fonts.gstatic.com/s/a/${FONT_HEX}.ttf`)) {
    return new Response(new Uint8Array([0, 1, 0, 1]), {
      headers: { 'Content-Type': 'font/ttf' },
    });
  }
  throw new Error(`smoke: unexpected upstream fetch ${url}`);
};

/* -------------------------------------------------------------------------- */
/* Shared expectations, driven through each platform's entry convention        */
/* -------------------------------------------------------------------------- */

const ORIGIN = 'https://mirror.invalid';

async function expectRoute(drive, label, path, init, assert) {
  const response = await drive(new Request(`${ORIGIN}${path}`, init));
  let detail = `status ${response.status}`;
  try {
    const body = response.headers.get('content-type')?.includes('json')
      ? await response.json()
      : (await response.text()).slice(0, 120);
    detail += ` body ${JSON.stringify(body).slice(0, 160)}`;
    assert(response, body);
    check(`${label} ${init?.method ?? 'GET'} ${path}`, true);
  } catch (error) {
    check(`${label} ${init?.method ?? 'GET'} ${path}`, false, `${detail} (${error.message})`);
  }
}

async function runSuite(label, drive) {
  // Unconfigured status endpoint fails closed without touching the network.
  await expectRoute(drive, label, '/api/status', undefined, (res, body) => {
    if (res.status !== 503 || body.error !== 'not_configured') throw new Error('expected 503 not_configured');
  });

  // iTunes fallback with the default bundle id.
  await expectRoute(drive, label, '/api/appstore/latest', undefined, (res, body) => {
    if (res.status !== 200 || body.bundleId !== 'sb.whu.luotopia') throw new Error('expected 200 + bundleId');
    if (body.source !== 'itunes') throw new Error('expected the itunes source');
  });

  await expectRoute(drive, label, '/api/releases/latest', undefined, (res, body) => {
    if (res.status !== 200 || body.tag !== '1.0.0+7') throw new Error('expected 200 + tag');
  });

  await expectRoute(drive, label, '/api/releases?page=1', undefined, (res, body) => {
    if (res.status !== 200 || !Array.isArray(body.items) || body.items.length !== 1) {
      throw new Error('expected 200 + one item');
    }
  });

  // Guard rails that must answer without any upstream call.
  await expectRoute(drive, label, '/api/releases/download/only-one-segment', undefined, (res, body) => {
    if (res.status !== 400 || body.error !== 'bad_request') throw new Error('expected 400 bad_request');
  });
  await expectRoute(drive, label, '/fonts/gstatic/not-a-font', undefined, (res) => {
    if (res.status !== 404) throw new Error('expected 404 from the path guard');
  });

  // The one path shape the font mirror proxies.
  await expectRoute(drive, label, `/fonts/gstatic/s/a/${FONT_HEX}.ttf`, undefined, (res) => {
    if (res.status !== 200 || res.headers.get('content-type') !== 'font/ttf') {
      throw new Error('expected 200 font/ttf');
    }
    if (res.headers.get('cache-control') !== 'public, max-age=31536000, immutable') {
      throw new Error('expected the immutable cache header');
    }
  });

  // Method gate.
  await expectRoute(drive, label, '/api/status', { method: 'POST' }, (res) => {
    if (res.status !== 405) throw new Error('expected 405');
  });
}

/* -------------------------------------------------------------------------- */
/* ESA: default.fetch, config through the injected global                      */
/* -------------------------------------------------------------------------- */

console.log('ESA routine (platform-dist/esa/edge-routine.js)');
globalThis.__LUOTOPIA_HOMEPAGE_ENV__ = {};
const esa = await import(pathToFileURL(join(ROOT, 'platform-dist/esa/edge-routine.js')).href);
check('esa: default.fetch exported', typeof esa.default?.fetch === 'function');
await runSuite('esa', (request) => esa.default.fetch(request));

// On ESA every miss reaches the routine; it must answer plainly, not hang.
{
  const response = await esa.default.fetch(new Request(`${ORIGIN}/some/page`));
  check('esa: non-API miss is a plain 404',
    response.status === 404 && response.headers.get('content-type').includes('text/plain'),
    `status ${response.status}`);
}

/* -------------------------------------------------------------------------- */
/* EdgeOne: onRequest(context), config through context.env                     */
/* -------------------------------------------------------------------------- */

console.log('EdgeOne Makers entries (platform-dist/edgeone/edge-functions/**)');
const EDGEONE_ENTRIES = [
  { file: 'api/status.js', path: '/api/status' },
  { file: 'api/appstore/latest.js', path: '/api/appstore/latest' },
  { file: 'api/releases/index.js', path: '/api/releases' },
  { file: 'api/releases/latest.js', path: '/api/releases/latest' },
  { file: 'api/releases/download/[[path]].js', path: '/api/releases/download/only-one-segment' },
  { file: 'fonts/gstatic/[[path]].js', path: `/fonts/gstatic/s/a/${FONT_HEX}.ttf` },
];

for (const { file, path } of EDGEONE_ENTRIES) {
  const entryPath = join(ROOT, 'platform-dist/edgeone/edge-functions', file);
  if (!existsSync(entryPath)) {
    check(`edgeone: ${file} exists`, false);
    continue;
  }
  const mod = await import(pathToFileURL(entryPath).href);
  const onRequest = mod.onRequest ?? mod.default;
  if (typeof onRequest !== 'function') {
    check(`edgeone: ${file} exports onRequest`, false);
    continue;
  }
  check(`edgeone: ${file} exports onRequest (named + default)`,
    typeof mod.onRequest === 'function' && typeof mod.default === 'function');
  const response = await onRequest({ request: new Request(`${ORIGIN}${path}`), env: {} });
  check(`edgeone: ${file} answers ${path}`, response instanceof Response, `got ${typeof response}`);
}

// The dispatch must be identical behind both doors: same path, same answer.
{
  const statusEntry = await import(
    pathToFileURL(join(ROOT, 'platform-dist/edgeone/edge-functions/api/status.js')).href
  );
  const viaEdgeone = await statusEntry.onRequest({ request: new Request(`${ORIGIN}/api/status`), env: {} });
  const viaEsa = await esa.default.fetch(new Request(`${ORIGIN}/api/status`));
  const [bodyEdgeone, bodyEsa] = [await viaEdgeone.json(), await viaEsa.json()];
  check('edgeone/esa agree on /api/status',
    viaEdgeone.status === viaEsa.status && bodyEdgeone.error === bodyEsa.error,
    `${viaEdgeone.status}/${bodyEdgeone.error} vs ${viaEsa.status}/${bodyEsa.error}`);
}

/* -------------------------------------------------------------------------- */
/* Static half of the EdgeOne output                                           */
/* -------------------------------------------------------------------------- */

for (const relative of ['public/index.html', 'public/404.html', 'package.json']) {
  check(`edgeone output contains ${relative}`,
    existsSync(join(ROOT, 'platform-dist/edgeone', relative)));
}

console.log('');
if (fetchCalls.length === 0) {
  console.error('FAIL: the stubbed fetch was never called — the suite did not exercise the handlers');
  process.exit(1);
}
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log(`smoke ok — ${fetchCalls.length} stubbed upstream call(s), all checks passed`);
