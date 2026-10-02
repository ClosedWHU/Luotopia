/**
 * GET /api/status
 *
 * One snapshot of every UptimeRobot monitor, shaped for the status page:
 * per-day availability columns, incident counts and downtime already summed,
 * monitors already split into the groups the page renders.
 *
 * GET /api/status?fresh=1 asks for an upstream call instead of the cached
 * snapshot. It is still throttled — see MIN_FRESH_AGE_MS.
 *
 * Env (Cloudflare Pages → Settings → Environment variables):
 *   UPTIMEROBOT_API_KEY   required; a Read-Only API key is enough
 *   UPTIMEROBOT_API_URL   optional, default https://api.uptimerobot.com/v2/
 *   STATUS_COUNT_DAYS     optional, default 90
 *   STATUS_SHOW_LINKS     optional, default 1
 *   STATUS_TIME_ZONE      optional, default Asia/Shanghai
 *   STATUS_CACHE_TTL      optional, default 300
 */

import {
  buildStatusSnapshot,
  resolveStatusOptions,
  statusCacheHeaders,
  statusJson,
  StatusUpstreamError,
  type StatusEnv,
} from "../lib/uptimerobot";

/*
 * `caches` is a Workers global and does not exist in Node, where this file is
 * never loaded — but the lookup stays defensive anyway so that a runtime
 * without the Cache API degrades to "always ask upstream" rather than throwing
 * on the first request.
 */
type CacheLike = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
const cacheStorage = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;

/**
 * Minimum age before `?fresh=1` is allowed to reach UptimeRobot.
 *
 * The page already throttles its own refresh button, but a throttle that lives
 * only in the browser is a suggestion. Without this, one client looping
 * `?fresh=1` would spend the account's API quota and take the status page down
 * for everyone — the exact thing the page exists to report on.
 */
const MIN_FRESH_AGE_MS = 60_000;

const GENERATED_AT = "X-Status-Generated-At";
const SOURCE = "X-Status-Source";

interface StatusContext {
  request: Request;
  env?: StatusEnv;
  waitUntil?(promise: Promise<unknown>): void;
}

function withSource(response: Response, source: string): Response {
  const headers = new Headers(response.headers);
  headers.set(SOURCE, source);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function ageOf(response: Response, nowMs: number): number {
  const generated = Number(response.headers.get(GENERATED_AT));
  return Number.isFinite(generated) && generated > 0 ? nowMs - generated : Number.POSITIVE_INFINITY;
}

export async function onRequestGet(context: StatusContext): Promise<Response> {
  const { request, env } = context;
  const options = resolveStatusOptions(env ?? {});
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const cache = cacheStorage?.default;
  // Same-origin and query-free: the snapshot does not vary by request, so one
  // key serves every caller and `?fresh=1` cannot fragment the cache.
  const cacheKey = new Request(`${url.origin}/__status-snapshot`, { method: "GET" });
  const nowMs = Date.now();

  if (!options.apiKey) {
    return statusJson(
      {
        error: "not_configured",
        message: "UPTIMEROBOT_API_KEY is not set on this deployment",
      },
      503,
      { "Cache-Control": "no-store" },
    );
  }

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        if (!fresh) return withSource(hit, "cache");
        // Younger than the throttle window: hand back the snapshot we already
        // have. The page treats this exactly like a normal refresh.
        if (ageOf(hit, nowMs) < MIN_FRESH_AGE_MS) return withSource(hit, "throttled");
      }
    } catch {
      /* A Cache API failure must not take the endpoint down. */
    }
  }

  try {
    const snapshot = await buildStatusSnapshot(options, nowMs);
    const body = JSON.stringify(snapshot);
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      [GENERATED_AT]: String(snapshot.generatedAt),
      ...statusCacheHeaders(options.cacheTtl),
    };

    const stored = new Response(body, { status: 200, headers: baseHeaders });
    if (cache) {
      // Clone before returning: a Response body can only be consumed once, and
      // waitUntil outlives this handler.
      const toStore = stored.clone();
      context.waitUntil?.(cache.put(cacheKey, toStore).catch(() => undefined));
    }

    const headers = new Headers(baseHeaders);
    headers.set(SOURCE, "api");
    if (fresh) {
      // The point of ?fresh=1 is that the caller wants *now*; letting the edge
      // park the answer for five minutes would defeat it.
      headers.set("Cache-Control", "no-store");
      headers.set("CDN-Cache-Control", "no-store");
    }
    return new Response(body, { status: 200, headers });
  } catch (e) {
    if (e instanceof StatusUpstreamError) {
      return statusJson(
        { error: e.code, message: e.message },
        e.status,
        // Short, not zero: when UptimeRobot is having a moment, a burst of
        // retries should not each become an upstream call.
        { "Cache-Control": "public, max-age=0, s-maxage=30" },
      );
    }
    return statusJson(
      { error: "fetch_failed", message: e instanceof Error ? e.message : String(e) },
      500,
      { "Cache-Control": "no-store" },
    );
  }
}
