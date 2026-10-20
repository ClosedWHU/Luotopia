/**
 * GET /api/msstore/latest?market=CN&productId=9P29527S1H0H
 *
 * Microsoft Store parity for /api/appstore/latest: catalog metadata from the
 * badge-tool endpoint (availability, title, publisher, package family name,
 * logo) merged with the version and release date parsed off the product page's
 * embedded state. See functions/lib/msstore.ts for why those two sources and
 * why every field but `available` may legitimately be null.
 *
 * Env:
 *   MSSTORE_PRODUCT_ID (default 9P29527S1H0H)
 *   MSSTORE_MARKET     (default CN)
 */

import { json } from "../../lib/github-releases";
import {
  DEFAULT_MARKET,
  DEFAULT_PRODUCT_ID,
  fetchMsStoreCatalog,
  fetchMsStorePageState,
  msStoreCacheHeaders,
  msStoreUrl,
  type MsStoreEnv,
  type MsStoreInfo,
} from "../../lib/msstore";

export async function onRequestGet(context: {
  request: Request;
  env: MsStoreEnv;
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const market = (
    url.searchParams.get("market") ||
    env.MSSTORE_MARKET ||
    DEFAULT_MARKET
  ).toUpperCase();
  const productId = (
    url.searchParams.get("productId") ||
    env.MSSTORE_PRODUCT_ID ||
    DEFAULT_PRODUCT_ID
  ).trim();

  try {
    const catalog = await fetchMsStoreCatalog(productId, market);
    if (!catalog.ok) {
      const status = catalog.status === 404 ? 404 : 502;
      return json(
        {
          error: catalog.status === 404 ? "not_found" : "upstream_error",
          message: catalog.message,
          productId,
          market,
          source: "msstore",
        },
        status,
        {
          "Cache-Control":
            status === 404
              ? "public, s-maxage=120, stale-while-revalidate=600"
              : "public, s-maxage=30",
        },
      );
    }

    // A page-state miss degrades to null version fields, not to an error: the
    // catalog half alone still proves the listing exists in this market.
    const page = await fetchMsStorePageState(productId, market);

    const info: MsStoreInfo = {
      source: "msstore",
      productId,
      market,
      available: true,
      title: catalog.catalog.title,
      publisher: catalog.catalog.publisher,
      packageFamilyName: catalog.catalog.packageFamilyName,
      logoUrl: catalog.catalog.logoUrl,
      version: page.version,
      releaseDateUtc: page.releaseDateUtc,
      storeUrl: msStoreUrl(productId),
    };
    return json(info, 200, msStoreCacheHeaders());
  } catch (e) {
    return json(
      {
        error: "fetch_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      502,
      { "Cache-Control": "no-store" },
    );
  }
}
