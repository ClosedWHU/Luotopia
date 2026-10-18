/**
 * Alibaba Cloud ESA Pages adapter.
 *
 * ESA's entry convention is the ES-module `export default { fetch(request) }`
 * shape Cloudflare Workers uses — **not** the service-worker
 * `addEventListener('fetch', …)` form; pasting that into ESA silently never
 * runs (a trap `../proxy` documented the hard way).
 *
 * The difference that shapes this file: ESA exposes environment variables to
 * the **build** (`process.env` during `npm run build:esa`), not to the handler
 * at runtime — the signature is `fetch(request)`, there is no `env` argument.
 * `build.mjs` therefore inlines the configured names as a banner
 * (`globalThis.__LUOTOPIA_HOMEPAGE_ENV__`), and [resolveEnv] below walks the
 * same four sources the proxy adapter does, in decreasing explicitness.
 *
 * Platform limits worth remembering (all respected by the handlers):
 *   - at most 4 `fetch` subrequests per invocation, and Cache API reads/writes
 *     count against that. The heaviest route is App Store Connect at 3
 *     (apps → builds → appStoreVersions); release download hits 4 only when a
 *     configured `GITHUB_ASSET_MIRROR` fails and every fallback runs (mirror →
 *     release-by-tag → asset API → browser URL) — exactly at budget, which is
 *     why ESA deployments configure a single mirror prefix; a second one would
 *     exceed the cap on the deepest fallback (degrades to `fetch_failed`,
 *     never loops). Everything else is 1–2.
 *   - `Host`, `Connection`, `Upgrade`, `TE`, `Expect`, `Proxy-Connection` and
 *     `DNT` are forbidden request headers: reading, writing **or iterating a
 *     collection that contains them** can throw. No handler here touches
 *     request headers — they read `request.url` and `request.method` only —
 *     so there is nothing to defend yet. Keep it that way when adding routes.
 *   - static assets win over the function: a path only reaches this routine
 *     when no file matched, so page stubs and real files never come through.
 */

import { apiNotFound, routeApiRequest, type ApiEnv } from "../functions/lib/dispatch";

/** Build-time-inlinable configuration. Mirrors docs/deployment.md's table. */
const ENV_NAMES = [
  "UPTIMEROBOT_API_KEY",
  "UPTIMEROBOT_API_URL",
  "GITHUB_TOKEN",
  "REPO",
  "APPSTORE_CONNECT",
  "APPSTORE_CONNECT_ENABLED",
  "APPSTORE_CONNECT_KEY_ID",
  "APPSTORE_CONNECT_ISSUER_ID",
  "APPSTORE_CONNECT_PRIVATE_KEY",
  "APPSTORE_CONNECT_APP_ID",
  "APPSTORE_BUNDLE_ID",
  "APPSTORE_COUNTRY",
  "APPSTORE_TRACK_ID",
  "STATUS_COUNT_DAYS",
  "STATUS_SHOW_LINKS",
  "STATUS_TIME_ZONE",
  "STATUS_CACHE_TTL",
] as const;

/** Memoised: an EdgeKV-backed loader must not run per request. */
let cached: Promise<ApiEnv> | null = null;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fromProcessEnv(): ApiEnv {
  const out: ApiEnv = {};
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const env = proc?.env;
    if (!env) return out;
    for (const name of ENV_NAMES) {
      const value = asString(env[name]);
      if (value !== undefined) out[name] = value;
    }
  } catch {
    // No `process` in this runtime. Not an error: the other sources still apply.
  }
  return out;
}

/**
 * Resolve the deployment configuration, in decreasing order of explicitness:
 *
 * 1. `globalThis.__LUOTOPIA_HOMEPAGE_ENV__` — the banner `build.mjs` writes
 *    when the ESA console's build env vars are set. The documented ESA path.
 * 2. `globalThis.__LUOTOPIA_HOMEPAGE_ENV_LOADER__` — async hook, for keeping
 *    secrets out of the artifact entirely by reading them from EdgeKV instead.
 * 3. `process.env.*` — if a runtime ever exposes them directly.
 * 4. Bare globals — `globalThis.UPTIMEROBOT_API_KEY` and friends.
 */
function resolveEnv(): Promise<ApiEnv> {
  if (cached) return cached;
  cached = (async () => {
    const scope = globalThis as unknown as Record<string, unknown>;

    const injected = scope.__LUOTOPIA_HOMEPAGE_ENV__;
    if (injected && typeof injected === "object") return injected as ApiEnv;

    const loader = scope.__LUOTOPIA_HOMEPAGE_ENV_LOADER__;
    if (typeof loader === "function") {
      const loaded = await (loader as () => Promise<ApiEnv>)();
      if (loaded && typeof loaded === "object") return loaded;
    }

    const collected: ApiEnv = { ...fromProcessEnv() };
    for (const name of ENV_NAMES) {
      if (collected[name] !== undefined) continue;
      const value = asString(scope[name]);
      if (value !== undefined) collected[name] = value;
    }
    return collected;
  })();
  return cached;
}

/** Test seam: forget a memoised environment. */
export function resetResolvedEnv(): void {
  cached = null;
}

/** Handle one request. Exported so a test can drive the adapter directly. */
export async function handle(request: Request): Promise<Response> {
  const env = await resolveEnv();
  const response = await routeApiRequest({ request, env });
  // On ESA the routine only runs when no static file matched, so a path
  // outside the API surface is a genuine miss — answer it plainly instead of
  // returning nothing.
  return response ?? apiNotFound(new URL(request.url).pathname);
}

export default { fetch: handle };
