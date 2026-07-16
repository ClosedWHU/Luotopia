/** App Store / App Store Connect helpers for Pages Functions */

export const APPSTORE_API_CACHE_TTL = 600; // 10 min edge fetch cache
export const APPSTORE_API_S_MAXAGE = 600;
export const APPSTORE_API_SWR = 3600;

/** Default: iOS bundle id from app/ios PRODUCT_BUNDLE_IDENTIFIER */
export const DEFAULT_BUNDLE_ID = "sb.whu.luotopia";
export const DEFAULT_COUNTRY = "cn";
/** Key ID is public metadata; private key stays in env secret. */
export const DEFAULT_CONNECT_KEY_ID = "R4CW927W99";

export type AppStoreSource = "itunes" | "appstoreconnect";
export type AppStoreChannel = "appstore" | "testflight";

export interface ItunesResult {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  version?: string;
  currentVersionReleaseDate?: string;
  releaseDate?: string;
  trackViewUrl?: string;
  minimumOsVersion?: string;
  fileSizeBytes?: string;
  releaseNotes?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  artistName?: string;
  sellerName?: string;
  primaryGenreName?: string;
}

export interface ItunesLookupResponse {
  resultCount: number;
  results: ItunesResult[];
}

export interface AppStoreInfo {
  source: AppStoreSource;
  channel: AppStoreChannel;
  trackId: number | null;
  name: string;
  bundleId: string;
  version: string;
  buildNumber: string | null;
  publishedAt: string | null;
  storeUrl: string | null;
  minOsVersion: string | null;
  fileSizeBytes: number | null;
  releaseNotes: string;
  averageRating: number | null;
  ratingCount: number | null;
  /** App Store Connect app resource id (when available). */
  appId: string | null;
  processingState: string | null;
}

export type AppStoreEnv = {
  APPSTORE_BUNDLE_ID?: string;
  APPSTORE_TRACK_ID?: string;
  APPSTORE_COUNTRY?: string;
  /** Set to 1/true/on to prefer App Store Connect API. */
  APPSTORE_CONNECT?: string;
  APPSTORE_CONNECT_ENABLED?: string;
  APPSTORE_CONNECT_KEY_ID?: string;
  APPSTORE_CONNECT_ISSUER_ID?: string;
  /** PEM contents of AuthKey_*.p8 (newlines as \n ok). */
  APPSTORE_CONNECT_PRIVATE_KEY?: string;
  /** Optional ASC app id; otherwise looked up by bundleId. */
  APPSTORE_CONNECT_APP_ID?: string;
};

export function isTruthyEnv(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function isAppStoreConnectEnabled(env: AppStoreEnv): boolean {
  return (
    isTruthyEnv(env.APPSTORE_CONNECT) || isTruthyEnv(env.APPSTORE_CONNECT_ENABLED)
  );
}

export function appStoreCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, s-maxage=${APPSTORE_API_S_MAXAGE}, stale-while-revalidate=${APPSTORE_API_SWR}`,
    "CDN-Cache-Control": `public, max-age=${APPSTORE_API_S_MAXAGE}, stale-while-revalidate=${APPSTORE_API_SWR}`,
  };
}

function emptyInfo(partial: Partial<AppStoreInfo> = {}): AppStoreInfo {
  return {
    source: "itunes",
    channel: "appstore",
    trackId: null,
    name: "",
    bundleId: "",
    version: "",
    buildNumber: null,
    publishedAt: null,
    storeUrl: null,
    minOsVersion: null,
    fileSizeBytes: null,
    releaseNotes: "",
    averageRating: null,
    ratingCount: null,
    appId: null,
    processingState: null,
    ...partial,
  };
}

export function mapItunesResult(r: ItunesResult): AppStoreInfo {
  const sizeRaw = r.fileSizeBytes;
  const size =
    sizeRaw != null && sizeRaw !== ""
      ? Number.parseInt(String(sizeRaw), 10)
      : null;

  return emptyInfo({
    source: "itunes",
    channel: "appstore",
    trackId: r.trackId ?? null,
    name: r.trackName || "",
    bundleId: r.bundleId || "",
    version: r.version || "",
    publishedAt: r.currentVersionReleaseDate || r.releaseDate || null,
    storeUrl: r.trackViewUrl || null,
    minOsVersion: r.minimumOsVersion || null,
    fileSizeBytes: Number.isFinite(size) ? size : null,
    releaseNotes: r.releaseNotes || "",
    averageRating:
      typeof r.averageUserRating === "number" ? r.averageUserRating : null,
    ratingCount:
      typeof r.userRatingCount === "number" ? r.userRatingCount : null,
  });
}

export async function fetchAppStoreByBundleId(
  bundleId: string,
  country = DEFAULT_COUNTRY,
): Promise<{ ok: true; info: AppStoreInfo } | { ok: false; status: number; message: string }> {
  const params = new URLSearchParams({
    bundleId,
    country,
    entity: "software",
  });
  const url = `https://itunes.apple.com/lookup?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Luotopia-Homepage-Pages",
    },
    cf: {
      cacheTtl: APPSTORE_API_CACHE_TTL,
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": APPSTORE_API_CACHE_TTL, "404": 60, "500-599": 0 },
    },
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  }

  const data = (await res.json()) as ItunesLookupResponse;
  if (!data.resultCount || !data.results?.length) {
    return {
      ok: false,
      status: 404,
      message: "App not found on App Store (may still be TestFlight-only)",
    };
  }

  return { ok: true, info: mapItunesResult(data.results[0]) };
}

export async function fetchAppStoreByTrackId(
  trackId: string | number,
  country = DEFAULT_COUNTRY,
): Promise<{ ok: true; info: AppStoreInfo } | { ok: false; status: number; message: string }> {
  const params = new URLSearchParams({
    id: String(trackId),
    country,
    entity: "software",
  });
  const url = `https://itunes.apple.com/lookup?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Luotopia-Homepage-Pages",
    },
    cf: {
      cacheTtl: APPSTORE_API_CACHE_TTL,
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": APPSTORE_API_CACHE_TTL, "404": 60, "500-599": 0 },
    },
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  }

  const data = (await res.json()) as ItunesLookupResponse;
  if (!data.resultCount || !data.results?.length) {
    return { ok: false, status: 404, message: "App not found on App Store" };
  }

  return { ok: true, info: mapItunesResult(data.results[0]) };
}

// ── App Store Connect (optional) ────────────────────────────────────────────

function normalizePem(pem: string): string {
  let s = pem.trim();
  // CF / dotenv often store newlines as literal \n
  if (s.includes("\\n")) s = s.replace(/\\n/g, "\n");
  // base64-only body without headers
  if (!s.includes("BEGIN")) {
    s = `-----BEGIN PRIVATE KEY-----\n${s.replace(/\s+/g, "")}\n-----END PRIVATE KEY-----`;
  }
  return s;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importEcPrivateKey(pem: string): Promise<CryptoKey> {
  const body = normalizePem(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Create short-lived ES256 JWT for App Store Connect. */
export async function createAppStoreConnectJwt(
  keyId: string,
  issuerId: string,
  privateKeyPem: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  // Apple docs: aud must be exactly "appstoreconnect-v1"
  // https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
  };
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const key = await importEcPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
};

type JsonApiList = {
  data?: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  errors?: { detail?: string; title?: string; status?: string }[];
};

async function ascFetch(
  path: string,
  token: string,
): Promise<{ ok: true; json: JsonApiList } | { ok: false; status: number; message: string }> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Luotopia-Homepage-Pages",
    },
    // Do not edge-cache authenticated ASC responses with secrets in flight;
    // our /api response still has CDN cache headers.
  });
  const text = await res.text();
  let json: JsonApiList = {};
  try {
    json = text ? (JSON.parse(text) as JsonApiList) : {};
  } catch {
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = json.errors?.[0];
    const msg = err?.detail || err?.title || text.slice(0, 200) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }
  return { ok: true, json };
}

function firstResource(data: JsonApiList["data"]): JsonApiResource | null {
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

/**
 * Latest TestFlight (or processing) build via App Store Connect API.
 * Requires APPSTORE_CONNECT=1 + KEY_ID + ISSUER_ID + PRIVATE_KEY.
 */
export async function fetchAppStoreConnectLatest(
  env: AppStoreEnv,
  bundleId = DEFAULT_BUNDLE_ID,
): Promise<{ ok: true; info: AppStoreInfo } | { ok: false; status: number; message: string }> {
  const keyId = (env.APPSTORE_CONNECT_KEY_ID || DEFAULT_CONNECT_KEY_ID).trim();
  const issuerId = (env.APPSTORE_CONNECT_ISSUER_ID || "").trim();
  const privateKey = (env.APPSTORE_CONNECT_PRIVATE_KEY || "").trim();
  if (!issuerId || !privateKey) {
    return {
      ok: false,
      status: 503,
      message:
        "App Store Connect credentials incomplete (need APPSTORE_CONNECT_ISSUER_ID + APPSTORE_CONNECT_PRIVATE_KEY)",
    };
  }

  let token: string;
  try {
    token = await createAppStoreConnectJwt(keyId, issuerId, privateKey);
  } catch (e) {
    return {
      ok: false,
      status: 500,
      message: `JWT sign failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let appId = (env.APPSTORE_CONNECT_APP_ID || "").trim();
  let appName = "";

  if (!appId) {
    const apps = await ascFetch(
      `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`,
      token,
    );
    if (!apps.ok) return apps;
    const app = firstResource(apps.json.data);
    if (!app) {
      return {
        ok: false,
        status: 404,
        message: `No App Store Connect app for bundleId=${bundleId}`,
      };
    }
    appId = app.id;
    appName = String(app.attributes?.name || "");
  }

  // Newest build by upload date; include preReleaseVersion for marketing version string
  const builds = await ascFetch(
    `/v1/builds?filter[app]=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=5&include=preReleaseVersion`,
    token,
  );
  if (!builds.ok) return builds;

  const list = Array.isArray(builds.json.data)
    ? builds.json.data
    : builds.json.data
      ? [builds.json.data]
      : [];
  if (list.length === 0) {
    return { ok: false, status: 404, message: "No builds found in App Store Connect" };
  }

  const included = builds.json.included || [];
  // Prefer VALID / processing complete; else first
  const preferred =
    list.find((b) => {
      const st = String(b.attributes?.processingState || "");
      return st === "VALID" || st === "PROCESSING" || st === "";
    }) || list[0]!;

  const attrs = preferred.attributes || {};
  const buildNumber = attrs.version != null ? String(attrs.version) : null;
  const uploaded = attrs.uploadedDate != null ? String(attrs.uploadedDate) : null;
  const processingState =
    attrs.processingState != null ? String(attrs.processingState) : null;

  let marketingVersion = "";
  const preRel =
    preferred.relationships?.preReleaseVersion?.data ??
    null;
  if (preRel?.id) {
    const pre = included.find((i) => i.id === preRel.id && i.type === "preReleaseVersions");
    if (pre?.attributes?.version != null) {
      marketingVersion = String(pre.attributes.version);
    }
  }

  // Fallback: latest App Store version marketing string if no prerelease version
  if (!marketingVersion) {
    const versions = await ascFetch(
      `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions?limit=1&sort=-createdDate`,
      token,
    );
    if (versions.ok) {
      const ver = firstResource(versions.json.data);
      if (ver?.attributes?.versionString != null) {
        marketingVersion = String(ver.attributes.versionString);
      }
    }
  }

  const versionDisplay =
    marketingVersion && buildNumber
      ? `${marketingVersion}+${buildNumber}`
      : marketingVersion || buildNumber || "unknown";

  return {
    ok: true,
    info: emptyInfo({
      source: "appstoreconnect",
      channel: "testflight",
      name: appName,
      bundleId,
      version: versionDisplay,
      buildNumber,
      publishedAt: uploaded,
      storeUrl: null,
      appId,
      processingState,
    }),
  };
}
