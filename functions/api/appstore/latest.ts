/**
 * GET /api/appstore/latest?country=cn
 *
 * 1) Optional App Store Connect (TestFlight builds) when APPSTORE_CONNECT=1
 *    + APPSTORE_CONNECT_ISSUER_ID + APPSTORE_CONNECT_PRIVATE_KEY
 *    (+ optional KEY_ID / APP_ID / BUNDLE_ID)
 * 2) Fallback: public iTunes Lookup (no JWT)
 *
 * Env:
 *   APPSTORE_CONNECT / APPSTORE_CONNECT_ENABLED = 1|true|on
 *   APPSTORE_CONNECT_KEY_ID (default R4CW927W99)
 *   APPSTORE_CONNECT_ISSUER_ID
 *   APPSTORE_CONNECT_PRIVATE_KEY  (AuthKey_*.p8 PEM; use \n for newlines)
 *   APPSTORE_CONNECT_APP_ID
 *   APPSTORE_BUNDLE_ID (default sb.whu.luotopia)
 *   APPSTORE_TRACK_ID
 *   APPSTORE_COUNTRY (default cn)
 */

import {
  appStoreCacheHeaders,
  DEFAULT_BUNDLE_ID,
  DEFAULT_COUNTRY,
  fetchAppStoreByBundleId,
  fetchAppStoreByTrackId,
  fetchAppStoreConnectLatest,
  isAppStoreConnectEnabled,
  type AppStoreEnv,
  type AppStoreInfo,
} from "../../lib/appstore";
import { json } from "../../lib/github-releases";

export async function onRequestGet(context: {
  request: Request;
  env: AppStoreEnv;
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const country =
    url.searchParams.get("country") || env.APPSTORE_COUNTRY || DEFAULT_COUNTRY;
  const trackId = url.searchParams.get("id") || env.APPSTORE_TRACK_ID || "";
  const bundleId =
    url.searchParams.get("bundleId") ||
    env.APPSTORE_BUNDLE_ID ||
    DEFAULT_BUNDLE_ID;
  const forceConnect =
    url.searchParams.get("connect") === "1" ||
    url.searchParams.get("source") === "connect";
  const forceItunes =
    url.searchParams.get("connect") === "0" ||
    url.searchParams.get("source") === "itunes";

  try {
    let connectTried = false;
    let connectError: { status: number; message: string } | null = null;

    if (!forceItunes && (forceConnect || isAppStoreConnectEnabled(env))) {
      connectTried = true;
      const connect = await fetchAppStoreConnectLatest(env, bundleId);
      if (connect.ok) {
        return json(connect.info, 200, appStoreCacheHeaders());
      }
      connectError = { status: connect.status, message: connect.message };
      // If explicitly ?connect=1, do not silently fall back
      if (forceConnect) {
        return json(
          {
            error: connect.status === 404 ? "not_found" : "connect_error",
            message: connect.message,
            bundleId,
            source: "appstoreconnect",
          },
          connect.status === 404 ? 404 : connect.status >= 500 ? 502 : connect.status,
          { "Cache-Control": "public, s-maxage=30" },
        );
      }
    }

    const itunes = trackId
      ? await fetchAppStoreByTrackId(trackId, country)
      : await fetchAppStoreByBundleId(bundleId, country);

    if (itunes.ok) {
      const info: AppStoreInfo = itunes.info;
      return json(
        connectTried && connectError
          ? { ...info, connectFallback: connectError.message }
          : info,
        200,
        appStoreCacheHeaders(),
      );
    }

    // Neither source worked
    if (connectError) {
      return json(
        {
          error: "not_found",
          message: connectError.message,
          itunesMessage: itunes.message,
          bundleId,
          country,
          source: "appstoreconnect",
        },
        404,
        {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      );
    }

    const status = itunes.status === 404 ? 404 : 502;
    return json(
      {
        error: itunes.status === 404 ? "not_found" : "upstream_error",
        message: itunes.message,
        bundleId,
        country,
        source: "itunes",
      },
      status,
      {
        "Cache-Control":
          itunes.status === 404
            ? "public, s-maxage=120, stale-while-revalidate=600"
            : "public, s-maxage=30",
      },
    );
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
