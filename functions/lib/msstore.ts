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
 * 2. `displaycatalog.mp.microsoft.com/v7.0/products/{id}` — the catalog behind
 *    the Store client. Carries the real package version (in each SKU's
 *    `PackageFullName`) and the market's `OriginalReleaseDate`.
 *
 * The version half used to be scraped off the `apps.microsoft.com/detail/<id>`
 * markup instead. That page embeds no product version at all: its only
 * dotted-quad `"version"` belongs to `window.pageConfig`, the storefront's own
 * build number, so the badge reported `2026.10.21.305` for a `1.2.0.0` app and
 * looked plausible enough to ship. A miss still degrades to `null` fields
 * rather than failing the request, because the catalog half alone answers "is
 * it published in this market".
 *
 * Both are reverse-engineered surfaces (the first via the badge tool, the
 * second via the Store client's own traffic), so every consumer must treat
 * them as breakable:
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

export interface MsStoreVersionState {
  version: string | null;
  releaseDateUtc: string | null;
}

export interface MsStoreInfo extends MsStoreCatalog, MsStoreVersionState {
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

// `HsukqiLee.14123401AC9F8_1.2.0.0_arm64__0rs1mmxqjy20y` — the package version
// is the only dotted quad in the full name. Its sibling `Version` field carries
// the same number packed into a uint64 (`1<<48 | 2<<32` == `281483566645248`),
// so reading the name avoids re-implementing that decode.
const PACKAGE_VERSION_RE = /_(\d+(?:\.\d+){3})_/;

type DisplayCatalog = {
  Product?: {
    MarketProperties?: { OriginalReleaseDate?: string }[];
    DisplaySkuAvailabilities?: {
      Sku?: { Properties?: { Packages?: { PackageFullName?: string }[] } };
    }[];
  };
};

/**
 * Version half: DisplayCatalog. Never fatal — the caller merges whatever this
 * finds (possibly nothing) onto the catalog entry.
 */
export async function fetchMsStoreVersionState(
  productId: string,
  market = DEFAULT_MARKET,
): Promise<MsStoreVersionState> {
  const empty: MsStoreVersionState = { version: null, releaseDateUtc: null };
  try {
    const params = new URLSearchParams({ market, languages: marketLocale(market) });
    const res = await fetch(
      `https://displaycatalog.mp.microsoft.com/v7.0/products/${productId}?${params.toString()}`,
      {
        headers: { Accept: "application/json", "User-Agent": "Luotopia-Homepage-Pages" },
        cf: {
          cacheTtl: MSSTORE_API_CACHE_TTL,
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": MSSTORE_API_CACHE_TTL, "404": 60, "500-599": 0 },
        },
      } as RequestInit,
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as DisplayCatalog;
    const skus = data.Product?.DisplaySkuAvailabilities ?? [];
    // Every SKU and architecture carries the same version; one match is enough.
    const version =
      skus
        .flatMap((sku) => sku.Sku?.Properties?.Packages ?? [])
        .map((pkg) => PACKAGE_VERSION_RE.exec(pkg.PackageFullName ?? "")?.[1])
        .find((v) => v) ?? null;
    // DisplayCatalog stamps 100 ns ticks (`.8584000Z`); trim to the three-digit
    // ISO-8601 form every `Date` parser accepts, including the old ones the
    // site's Chrome 66 floor still has to run on.
    const releaseDateUtc =
      data.Product?.MarketProperties?.[0]?.OriginalReleaseDate?.replace(/(\.\d{3})\d+/, "$1") ??
      null;
    return { version, releaseDateUtc };
  } catch {
    return empty;
  }
}
