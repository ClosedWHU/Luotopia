/**
 * Platform-independent routing for the site's function surface.
 *
 * Cloudflare Pages dispatches by file name (`functions/api/status.ts` answers
 * `/api/status`) and needs none of this. Every other target — the EdgeOne
 * Makers entries under `platform/edgeone/`, the Alibaba ESA routine under
 * `platform/esa-routine.ts` — is a thin adapter that calls [routeApiRequest],
 * which matches on the pathname instead of on which file was hit. One route
 * table, so the endpoints cannot drift between platforms; a new platform is a
 * ~20-line adapter (the pattern `../proxy` established for the relay).
 *
 * Deliberately *not* routed here: `functions/_middleware.ts`. Its jobs — host
 * canonicalisation, language negotiation, deep-link rewrites, localised 404s —
 * are website concerns that need Cloudflare's `env.ASSETS` binding, and the
 * non-Cloudflare deployments are file/API mirrors whose page URLs are redirect
 * stubs (see `MIRROR_ASSETS_ONLY` in astro.config.mjs). Running the host
 * canonicalisation there would 302 the mirror's own domain away and defeat the
 * deployment.
 *
 * Portable by construction: the handlers it dispatches to use only WinterCG
 * surface (Request/Response/Headers/fetch/crypto.subtle). Cloudflare-only
 * extras degrade where absent — `cf: {}` fetch hints are ignored by other
 * runtimes (a lost edge cache, never an error), `caches.default` in
 * api/status.ts is feature-detected, and `waitUntil` is optional-called.
 */

import { onRequestGet as appstoreLatestGet } from "../api/appstore/latest";
import { onRequestGet as releaseDownloadGet } from "../api/releases/download/[[path]]";
import { onRequestGet as releasesIndexGet } from "../api/releases/index";
import { onRequestGet as releasesLatestGet } from "../api/releases/latest";
import { onRequestGet as statusGet } from "../api/status";
import { onRequestGet as gstaticFontGet } from "../fonts/gstatic/[[path]]";

/** Every handler reads its config from this bag; each narrows it as needed. */
export type ApiEnv = Record<string, string | undefined>;

export interface ApiRequestContext {
  request: Request;
  env?: ApiEnv;
  waitUntil?(promise: Promise<unknown>): void;
}

/**
 * Dispatch one request to the API surface.
 *
 * Returns `null` for paths outside `/api/*` and `/fonts/gstatic/*`: those are
 * the platform's business (a static file, a redirect stub, its own 404). The
 * adapters decide what a `null` means where the function *was* invoked anyway
 * — ESA answers with [apiNotFound], EdgeOne entries fall through to `next()`.
 */
export async function routeApiRequest(
  context: ApiRequestContext,
): Promise<Response | null> {
  const { request, env = {}, waitUntil } = context;
  const url = new URL(request.url);
  // Trailing-slash tolerance matches the file router's: `/api/releases/` and
  // `/api/releases` are the same route. The root itself is never an API path.
  const pathname =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  if (!pathname.startsWith("/api/") && !pathname.startsWith("/fonts/gstatic/")) {
    return null;
  }
  // Cloudflare's router only ever calls `onRequestGet` for these two methods;
  // other platforms invoke the adapter for any method, so the gate lives here.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }

  if (pathname === "/api/status") {
    return statusGet({ request, env, waitUntil });
  }
  if (pathname === "/api/appstore/latest") {
    return appstoreLatestGet({ request, env });
  }
  if (pathname === "/api/releases") {
    return releasesIndexGet({ request, env });
  }
  if (pathname === "/api/releases/latest") {
    return releasesLatestGet({ request, env });
  }
  if (
    pathname === "/api/releases/download" ||
    pathname.startsWith("/api/releases/download/")
  ) {
    // The handlers' `parsePath` accepts the still-percent-encoded remainder
    // (it decodes per segment), which is exactly what `pathname` gives us —
    // and what Cloudflare's `params.path` gives them on that platform. The
    // bare prefix yields an empty param and the same 400 the file router's
    // optional catch-all produces.
    const rest = pathname.slice("/api/releases/download".length).replace(/^\//, "");
    return releaseDownloadGet({ request, env, params: { path: rest } });
  }
  if (pathname === "/fonts/gstatic" || pathname.startsWith("/fonts/gstatic/")) {
    const rest = pathname.slice("/fonts/gstatic".length).replace(/^\//, "");
    return gstaticFontGet({ request, params: { path: rest } });
  }
  // An unmatched /api/* or /fonts/gstatic/* path: no route, no asset — 404
  // rather than `null`, because the platform already proved it has nothing
  // (that is why the function was invoked at all).
  return apiNotFound(url.pathname);
}

/**
 * The plain-text miss, in the spirit of `_middleware.ts`'s `plainTextNotFound`:
 * one line for a terminal or a CI log, no 34 KB branded document nobody on a
 * non-Cloudflare mirror is going to look at.
 */
export function apiNotFound(pathname: string): Response {
  return new Response(`404 Not Found: ${pathname}\n`, {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // A 404 must not stick: the path may exist after the next deploy.
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
