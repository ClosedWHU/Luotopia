/**
 * Shared delegate for the EdgeOne Makers entries.
 *
 * Each file under `platform/edgeone/` mirrors one route of the file router and
 * does nothing but hand its context to [delegate]; all routing decisions live
 * in `functions/lib/dispatch.ts`, so the EdgeOne surface cannot drift from the
 * ESA routine or from Cloudflare's own file-routed handlers. This is the proxy
 * repo's entry pattern (both a named and a default `onRequest` export, because
 * the Makers docs show `export default function onRequest(context)` while the
 * Pages-era templates in the wild use the named form — exporting both costs
 * nothing and removes any doubt about which convention a build expects).
 *
 * These sources are bundled by `build.mjs` into
 * `platform-dist/edgeone/edge-functions/**`: Makers serves JavaScript and
 * does not resolve the cross-directory TypeScript imports, so the deployed
 * artifact is one self-contained file per route.
 */

import { apiNotFound, routeApiRequest, type ApiEnv } from "../../functions/lib/dispatch";

export type EdgeOneContext = {
  request: Request;
  env?: ApiEnv;
  waitUntil?(promise: Promise<unknown>): void;
  next?(): Promise<Response>;
};

export async function delegate(context: EdgeOneContext): Promise<Response> {
  const response = await routeApiRequest({
    request: context.request,
    env: context.env ?? {},
    waitUntil: context.waitUntil?.bind(context),
  });
  if (response) return response;
  // The file router matched this entry, so the pathname *should* be one the
  // dispatcher knows. If the two ever disagree (a renamed route, a platform
  // that hands the entry something else), prefer the platform's own pipeline
  // over guessing; without `next`, answer the miss plainly.
  return context.next
    ? context.next()
    : apiNotFound(new URL(context.request.url).pathname);
}
