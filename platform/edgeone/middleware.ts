/**
 * EdgeOne Makers middleware — the only mechanism on this platform that can serve
 * the two R2-backed hot-update files.
 *
 * EdgeOne routes extension-bearing paths (.json, .gz, .js, .ttf) to static-file
 * handling and never to an edge function: verified empirically that a `[[path]]`
 * catch-all, a `[[default]]` catch-all, and exact `manifest.json` /
 * `model-metadata-catalog.json.gz` routes ALL return EdgeOne's bare 404, with the
 * static copy present or absent, while the extension-less `/api/status` routes
 * fine. So the dispatcher proxy that serves these on ESA cannot run as an
 * EdgeOne edge function.
 *
 * Middleware is different: it intercepts a request *before* static routing and
 * may return a Response directly. So this matches exactly the two R2-backed paths
 * and proxies them from the canonical origin, reusing the very handler ESA uses
 * (`functions/lib/hot-update-origin.ts`). Everything else — the committed parser
 * scripts and rare data assets — is not matched, so middleware never runs for it
 * and EdgeOne serves those from its static copy as usual. No static removal, no
 * shadowing fight: middleware wins for the two dynamic files, static wins for the
 * rest.
 *
 * (The same limitation is why the pre-existing `/fonts/gstatic/*` and
 * `/api/releases/download/*` catch-alls have never worked on EdgeOne; those would
 * need the same middleware treatment, tracked separately.)
 */

import { onRequestGet } from "../../functions/lib/hot-update-origin";

interface MiddlewareContext {
  request: Request;
}

export async function middleware(context: MiddlewareContext): Promise<Response> {
  // The matcher below restricts this to the two R2-backed files, so no path
  // check is needed here. `env` is not exposed to middleware; the handler's
  // origin defaults to https://www.whu.sb, which is what we want.
  return onRequestGet({ request: context.request, env: {} });
}

export const config = {
  matcher: [
    "/hot-update/manifest.json",
    "/hot-update/assets/model-metadata-catalog.json.gz",
  ],
};
