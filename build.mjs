#!/usr/bin/env node
/**
 * Bundles the platform adapters into deployable artifacts.
 *
 * The function surface is written once, in `functions/`, against the WinterCG
 * API surface every vendor's edge runtime implements (`Request`/`Response`/
 * `Headers`/`fetch`/`crypto.subtle`); `functions/lib/dispatch.ts` is the shared
 * route table. What differs per platform is only the entry convention and
 * whether the platform's own builder resolves TypeScript and cross-directory
 * imports. This script removes the second variable: each target is a set of
 * self-contained files, so no deployment depends on a vendor bundler.
 *
 *   node build.mjs              # every target (needs `dist/` from astro build)
 *   node build.mjs esa          # platform-dist/esa/edge-routine.js
 *   node build.mjs edgeone      # platform-dist/edgeone/{<site at the root>,edge-functions,package.json}
 *
 * Cloudflare needs none of this: Pages bundles `functions/` itself and runs
 * the file router natively. Use the npm scripts (`build:esa`, `build:edgeone`)
 * rather than this file directly — they run `astro build` first, which the
 * edgeone target copies into place as the static half of the deployment.
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'platform-dist');

/** Shared esbuild options. `neutral` because none of these run on Node. */
/** @type {import('esbuild').BuildOptions} */
const COMMON = {
  bundle: true,
  target: 'es2023',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['worker', 'browser'],
  logLevel: 'warning',
  absWorkingDir: ROOT,
};

/**
 * EdgeOne's file router derives routes from file names, so the bundled output
 * has to keep both the directory shape and the literal `[[path]].js` names.
 * One entry per served route — no root catch-all: a function that matched
 * every path would sit in front of the static assets, and EdgeOne does not let
 * a function fetch (or otherwise reach) its own origin to serve them back.
 */
const EDGEONE_ENTRIES = [
  { entry: 'platform/edgeone/api/status.ts', out: 'edge-functions/api/status.js' },
  { entry: 'platform/edgeone/api/appstore/latest.ts', out: 'edge-functions/api/appstore/latest.js' },
  { entry: 'platform/edgeone/api/releases/index.ts', out: 'edge-functions/api/releases/index.js' },
  { entry: 'platform/edgeone/api/releases/latest.ts', out: 'edge-functions/api/releases/latest.js' },
  {
    entry: 'platform/edgeone/api/releases/download/[[path]].ts',
    out: 'edge-functions/api/releases/download/[[path]].js',
  },
  {
    entry: 'platform/edgeone/fonts/gstatic/[[path]].ts',
    out: 'edge-functions/fonts/gstatic/[[path]].js',
  },
];

/**
 * Environment names inlined into the ESA artifact. ESA hands environment
 * variables to the *build* (`process.env` during `npm run build:esa`), not to
 * the handler at runtime, so there is no `env` binding to read a secret from;
 * the documented path is inlining, which is what the banner below does. Values
 * come from the build environment — the ESA console's env vars, or a local
 * export — and never from the repository: `platform-dist/` is gitignored, and
 * the secret values are not echoed.
 */
const ESA_ENV_NAMES = [
  'UPTIMEROBOT_API_KEY',
  'UPTIMEROBOT_API_URL',
  'GITHUB_TOKEN',
  'GITHUB_ASSET_MIRROR',
  'REPO',
  'APPSTORE_CONNECT',
  'APPSTORE_CONNECT_ENABLED',
  'APPSTORE_CONNECT_KEY_ID',
  'APPSTORE_CONNECT_ISSUER_ID',
  'APPSTORE_CONNECT_PRIVATE_KEY',
  'APPSTORE_CONNECT_APP_ID',
  'APPSTORE_BUNDLE_ID',
  'APPSTORE_COUNTRY',
  'APPSTORE_TRACK_ID',
  'STATUS_COUNT_DAYS',
  'STATUS_SHOW_LINKS',
  'STATUS_TIME_ZONE',
  'STATUS_CACHE_TTL',
];

async function bundleEsa() {
  /** @type {Record<string, string>} */
  const inlined = {};
  for (const name of ESA_ENV_NAMES) {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) inlined[name] = value;
  }
  const banner =
    Object.keys(inlined).length > 0
      ? { js: `globalThis.__LUOTOPIA_HOMEPAGE_ENV__ = ${JSON.stringify(inlined)};` }
      : undefined;

  // ESM: ESA's entry convention is `export default { fetch }`.
  await build({
    ...COMMON,
    entryPoints: ['platform/esa-routine.ts'],
    outfile: 'platform-dist/esa/edge-routine.js',
    format: 'esm',
    banner,
  });
  console.log(
    banner
      ? `built platform-dist/esa/edge-routine.js (config inlined from the build environment: ${Object.keys(inlined).join(', ')})`
      : 'built platform-dist/esa/edge-routine.js (NO config inlined — set the env vars in the ESA console; /api/status will report not_configured until then)',
  );
}

async function bundleEdgeone() {
  const target = join(OUT, 'edgeone');
  /*
   * Layout, settled empirically by a real deployment: EdgeOne serves the
   * output directory itself as the static root and picks `edge-functions/`
   * up beside it. (The proxy repo's fallback nests the site under `public/`
   * — that layout serves everything at `/public/...` and 404s the root,
   * which is exactly the bug this order avoids.) So the site goes in first,
   * at the root, while `target` does not exist yet and `cp` is unambiguous;
   * the function bundles then merge in beside it.
   */
  await cp(join(ROOT, 'dist'), target, { recursive: true });
  for (const { entry, out } of EDGEONE_ENTRIES) {
    const outfile = join(target, out);
    await mkdir(dirname(outfile), { recursive: true });
    await build({ ...COMMON, entryPoints: [entry], outfile, format: 'esm' });
  }
  // The Makers CLI expects a package.json next to the function folders in the
  // output directory; a minimal one is enough, and it must not carry the
  // devDependencies or the build would try to install them at the edge.
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify({ name: 'luotopia-homepage', type: 'module', private: true }, null, 2)}\n`,
  );
  console.log(
    `built ${EDGEONE_ENTRIES.length} edge functions + static site into platform-dist/edgeone`,
  );
}

/** @type {Record<string, () => Promise<void>>} */
const TARGETS = {
  esa: bundleEsa,
  edgeone: bundleEdgeone,
};

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = requested.length > 0 ? requested : Object.keys(TARGETS);

for (const name of selected) {
  if (!TARGETS[name]) {
    console.error(`unknown target "${name}" (expected one of: ${Object.keys(TARGETS).join(', ')})`);
    process.exit(2);
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const name of selected) {
  await TARGETS[name]();
}
