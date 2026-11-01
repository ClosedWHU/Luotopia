/**
 * Mirror-side `/hot-update/*` proxy, shared by the EdgeOne and ESA adapters
 * through `dispatch.ts`.
 *
 * The signed `manifest.json` and the model-metadata catalog `.gz` no longer
 * live in the repository: they are published to R2 and served on Cloudflare by
 * `functions/hot-update/[[path]].ts` (see that file and the hot-update README
 * for why — a ~137 KB gzip that never delta-compresses was landing in git every
 * day). The non-Cloudflare mirrors are static-only replicas with no R2 binding,
 * so they cannot read the bucket. They proxy the whole prefix from the canonical
 * origin instead and cache it at their own edge — the same shape as the gstatic
 * font proxy, and the same reason it is acceptable: a mirror's *edge* can reach
 * the origin even where its end clients cannot, and clients re-check on a 12 h
 * throttle, so a short edge TTL keeps cross-cloud fetches rare without letting
 * the catalog go stale.
 *
 * Parser scripts and the rare data assets are still committed static files. On
 * ESA the platform serves those before the routine runs, so only the two
 * R2-backed paths ever reach this proxy; on EdgeOne the catch-all entry cannot
 * fall through to static at all, so scripts arrive here too and are proxied from
 * the origin, which serves them statically. One handler covers both.
 *
 * Portable by construction (WinterCG `fetch`/`Response` only), so it runs
 * unchanged on the EdgeOne and ESA runtimes.
 */

import type { ApiEnv } from "./dispatch";

/** Canonical origin: the Cloudflare Pages deployment that reads R2. */
const DEFAULT_ORIGIN = "https://www.whu.sb";

/**
 * Edge cache lifetime, in seconds. The catalog changes at most daily and clients
 * re-check every 12 h, so two minutes is far below anything a user could notice
 * while cutting a chatty mirror's origin fetches to roughly one per edge per TTL.
 * Kept short so a manifest/catalog pair published seconds apart cannot sit long
 * enough to be served mismatched (a mismatch fails the client's sha256 check and
 * is simply retried on the next check — fail-closed, never corrupt).
 */
const EDGE_TTL = 120;

export interface HotUpdateProxyContext {
  request: Request;
  env?: ApiEnv;
}

export async function onRequestGet(context: HotUpdateProxyContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = (env && env.HOT_UPDATE_ORIGIN) || DEFAULT_ORIGIN;

  try {
    // Forward the client's conditional header so an unchanged file costs a 304
    // end to end rather than a full re-transfer from the origin.
    const headers: Record<string, string> = {
      "User-Agent": "Luotopia-Homepage-Mirror",
    };
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

    const upstream = await fetch(`${origin}${url.pathname}`, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
    });

    // A 304 has no body; pass it straight through so the client keeps its cache.
    if (upstream.status === 304) {
      const notModified = new Headers();
      const etag = upstream.headers.get("ETag");
      if (etag) notModified.set("ETag", etag);
      notModified.set("Cache-Control", `public, max-age=0, s-maxage=${EDGE_TTL}, must-revalidate`);
      return new Response(null, { status: 304, headers: notModified });
    }

    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, s-maxage=30" },
      });
    }

    /*
     * Copy only the headers that describe the body; the origin's own
     * `Cache-Control` (no-cache, aimed at the client's 12 h revalidation) is
     * replaced with the mirror's edge TTL, and the ETag rides along so the next
     * conditional request can 304.
     */
    const out = new Headers();
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) out.set("Content-Type", contentType);
    const etag = upstream.headers.get("ETag");
    if (etag) out.set("ETag", etag);
    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) out.set("Content-Length", contentLength);
    out.set("Cache-Control", `public, max-age=0, s-maxage=${EDGE_TTL}, must-revalidate`);
    out.set("Access-Control-Allow-Origin", "*");
    out.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, { status: 200, headers: out });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Fetch failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
