/**
 * Microsoft Store helpers for Pages Functions.
 *
 * Microsoft publishes no documented lookup API comparable to Apple's iTunes
 * Lookup, so the Apple-side parity is assembled from two undocumented-but-public
 * sources, both probed against our own listing before being wired in:
 *
 * 1. `storeedgefd.dsx.mp.microsoft.com/v8.0/sdk/products` — the endpoint behind
 *    the official "Get it from Microsoft" product badge. POSTing a product id
 *    yields the market's catalog entry: title, publisher, package family name,
 *    logos. It carries *no* package version and no release date.
 * 2. The server-rendered state embedded in the `apps.microsoft.com/detail/<id>`
 *    page, which is where the storefront itself reads `"version"` and
 *    `"releaseDateUtc"` from. Parsed with two narrow regexes; a miss degrades
 *    to `null` fields rather than failing the request, because the catalog
 *    half alone still answers "is it published in this market".
 *
 * Both are reverse-engineered surfaces (the first via the badge tool, the
 * second via the page markup), so every consumer must treat them as breakable:
 * the download page falls back to its static Store link when this API answers
 * nothing useful, exactly as it keeps the static TestFlight label when App
 * Store Connect is unavailable.
 */

export const MSSTORE_API_CACHE_TTL = 600; // 10 min edge fetch cache
export const MSSTORE_API_S_MAXAGE = 600;
export const MSSTORE_API_SWR = 3600;

/** Product id from https://apps.microsoft.com/detail/9P29527S1H0H */
export const DEFAULT_PRODUCT_ID = "9P29527S1H0H";
export const DEFAULT_MARKET = "CN";

export interface MsStoreCatalog {
  title: string;
  publisher: string;
  packageFamilyName: string | null;
  logoUrl: string | null;
}

export interface MsStorePageState {
  version: string | null;
  releaseDateUtc: string | null;
}

export interface MsStoreInfo extends MsStoreCatalog, MsStorePageState {
  source: "msstore";
  productId: string;
  market: string;
  available: boolean;
  storeUrl: string;
}

export type MsStoreEnv = {
  MSSTORE_PRODUCT_ID?: string;
  MSSTORE_MARKET?: string;
};

export function msStoreCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, s-maxage=${MSSTORE_API_S_MAXAGE}, stale-while-revalidate=${MSSTORE_API_SWR}`,
    "CDN-Cache-Control": `public, max-age=${MSSTORE_API_S_MAXAGE}, stale-while-revalidate=${MSSTORE_API_SWR}`,
  };
}

/** The storefront renders each market in one language; the badge endpoint wants both. */
export function marketLocale(market: string): string {
  return market === "CN" ? "zh-CN" : "en-US";
}

export function msStoreUrl(productId: string): string {
  return `https://apps.microsoft.com/detail/${productId}`;
}

type SdkProduct = {
  ProductId?: string;
  Properties?: { PackageFamilyName?: string };
  LocalizedProperties?: {
    ProductTitle?: string;
    PublisherName?: string;
    Images?: { ImagePurpose?: string; Uri?: string; Height?: number }[];
  }[];
};

type SdkProductsResponse = { Products?: SdkProduct[] };

/**
 * Catalog half: the badge-tool endpoint. An empty `Products` array is how the
 * edge answers "not published in this market", which the caller maps to 404.
 */
export async function fetchMsStoreCatalog(
  productId: string,
  market = DEFAULT_MARKET,
): Promise<{ ok: true; catalog: MsStoreCatalog } | { ok: false; status: number; message: string }> {
  const params = new URLSearchParams({
    market,
    locale: marketLocale(market),
    deviceFamily: "Windows.Desktop",
  });
  const url = `https://storeedgefd.dsx.mp.microsoft.com/v8.0/sdk/products?${params.toString()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Luotopia-Homepage-Pages",
    },
    body: JSON.stringify({ productIds: productId }),
    cf: {
      cacheTtl: MSSTORE_API_CACHE_TTL,
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": MSSTORE_API_CACHE_TTL, "404": 60, "500-599": 0 },
    },
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  }

  const data = (await res.json()) as SdkProductsResponse;
  const product = data.Products?.[0];
  if (!product || product.ProductId !== productId) {
    return {
      ok: false,
      status: 404,
      message: `Product ${productId} not found in market ${market}`,
    };
  }

  const localized = product.LocalizedProperties?.[0];
  const images = localized?.Images ?? [];
  // Largest logo: the picker list runs small to large, so the last Logo wins.
  const logos = images.filter((i) => i.ImagePurpose === "Logo" && i.Uri);
  const logo = logos[logos.length - 1];

  return {
    ok: true,
    catalog: {
      title: localized?.ProductTitle || "",
      publisher: localized?.PublisherName || "",
      packageFamilyName: product.Properties?.PackageFamilyName || null,
      logoUrl: logo?.Uri ? `https:${logo.Uri}` : null,
    },
  };
}

// Store versions are four dotted numeric components (`2026.10.14.366`); the
// character class keeps the match from swallowing a neighbouring string field.
const PAGE_VERSION_RE = /"version"\s*:\s*"(\d+(?:\.\d+)+)"/;
const PAGE_RELEASE_RE = /"releaseDateUtc"\s*:\s*"([^"]+)"/;

/**
 * Version half: the product page's embedded state. Never fatal — the caller
 * merges whatever this finds (possibly nothing) onto the catalog entry.
 */
export async function fetchMsStorePageState(
  productId: string,
  market = DEFAULT_MARKET,
): Promise<MsStorePageState> {
  const empty: MsStorePageState = { version: null, releaseDateUtc: null };
  try {
    const params = new URLSearchParams({
      hl: marketLocale(market).toLowerCase(),
      gl: market,
    });
    const res = await fetch(`${msStoreUrl(productId)}?${params.toString()}`, {
      headers: {
        // The storefront serves the embedded-state HTML to browsers; a bare
        // fetch UA risks a bot challenge instead of the rendered document.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cf: {
        cacheTtl: MSSTORE_API_CACHE_TTL,
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": MSSTORE_API_CACHE_TTL, "404": 60, "500-599": 0 },
      },
    } as RequestInit);
    if (!res.ok) return empty;
    const html = await res.text();
    const version = PAGE_VERSION_RE.exec(html)?.[1] ?? null;
    const releaseDateUtc = PAGE_RELEASE_RE.exec(html)?.[1] ?? null;
    return { version, releaseDateUtc };
  } catch {
    return empty;
  }
}
