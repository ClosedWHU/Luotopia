/** Shared GitHub Releases helpers for Pages Functions */

export type PlatformId = "android" | "ios" | "windows" | "macos" | "linux" | "other";

/** CPU / ABI key used for recommend + display. */
export type ArchId =
  | "arm64-v8a"
  | "armeabi-v7a"
  | "x86_64"
  | "x86"
  | "amd64"
  | "arm64"
  | "universal"
  | "unknown";

/** Package format (extension / kind) for display. */
export type FormatId =
  | "apk"
  | "aab"
  | "ipa"
  | "msix"
  | "msi"
  | "exe"
  | "zip"
  | "dmg"
  | "pkg"
  | "appimage"
  | "deb"
  | "rpm"
  | "flatpak"
  | "tar"
  | "scoop"
  | "winget"
  | "other";

export interface GhAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  content_type: string;
}

/** Per-platform preferred arch (first match wins when sorting). */
const RECOMMENDED_ARCH: Partial<Record<PlatformId, ArchId>> = {
  android: "arm64-v8a",
  windows: "amd64",
  macos: "arm64",
  linux: "amd64",
};

/** Preferred install format when multiple exist for the same arch. */
const RECOMMENDED_FORMAT: Partial<Record<PlatformId, FormatId>> = {
  android: "apk",
  windows: "zip",
  linux: "tar",
  macos: "dmg",
};

const ARCH_LABELS: Record<ArchId, string> = {
  "arm64-v8a": "arm64-v8a",
  "armeabi-v7a": "armeabi-v7a",
  x86_64: "x86_64",
  x86: "x86",
  amd64: "x64",
  arm64: "arm64",
  universal: "通用",
  unknown: "通用",
};

const FORMAT_LABELS: Record<FormatId, string> = {
  apk: "APK",
  aab: "AAB",
  ipa: "IPA",
  msix: "MSIX",
  msi: "MSI",
  exe: "EXE",
  zip: "zip",
  dmg: "DMG",
  pkg: "PKG",
  appimage: "AppImage",
  deb: "deb",
  rpm: "rpm",
  flatpak: "Flatpak",
  tar: "tar.gz",
  scoop: "Scoop",
  winget: "winget",
  other: "",
};

/** Manifests / non-installer assets — keep out of platform cards & default changelog chips. */
export function isMetaAsset(platform: PlatformId, format: FormatId): boolean {
  return platform === "other" || format === "scoop" || format === "winget";
}

export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  published_at: string | null;
  created_at: string;
  assets: GhAsset[];
}

/** Flutter pubspec `version: 1.0.0+2` → name 1.0.0, build 2 */
export function parseFlutterVersion(tagOrTitle: string) {
  const raw = (tagOrTitle || "").trim();
  const stripped = raw.replace(/^v/i, "");
  const plus = stripped.match(/^(\d+\.\d+\.\d+(?:[-.][\w.]+)?)\+(\S+)/);
  if (plus) {
    return {
      versionName: plus[1],
      buildNumber: plus[2],
      display: `${plus[1]}+${plus[2]}`,
      raw,
    };
  }
  const semver = stripped.match(/^(\d+\.\d+\.\d+(?:[-.][\w.]+)?)/);
  if (semver) {
    return {
      versionName: semver[1],
      buildNumber: null as string | null,
      display: semver[1],
      raw,
    };
  }
  return {
    versionName: stripped || raw,
    buildNumber: null as string | null,
    display: stripped || raw || "unknown",
    raw,
  };
}

export function detectFormat(filename: string): FormatId {
  const n = filename.toLowerCase();
  if (/scoop-.*\.json$/i.test(n)) return "scoop";
  if (/^winget-/i.test(n) || n.includes("winget-")) return "winget";
  if (/\.apk$/i.test(n)) return "apk";
  if (/\.aab$/i.test(n)) return "aab";
  if (/\.ipa$/i.test(n)) return "ipa";
  if (/\.msix$/i.test(n) || /\.appx$/i.test(n)) return "msix";
  if (/\.msi$/i.test(n)) return "msi";
  if (/\.exe$/i.test(n)) return "exe";
  if (/\.dmg$/i.test(n)) return "dmg";
  if (/\.pkg$/i.test(n)) return "pkg";
  if (/\.appimage$/i.test(n)) return "appimage";
  if (/\.deb$/i.test(n)) return "deb";
  if (/\.rpm$/i.test(n)) return "rpm";
  if (/\.flatpak$/i.test(n)) return "flatpak";
  if (/\.(tar\.gz|tgz)$/i.test(n)) return "tar";
  if (/\.zip$/i.test(n)) return "zip";
  return "other";
}

export function formatLabel(format: FormatId): string {
  return FORMAT_LABELS[format] ?? "";
}

export function detectPlatform(filename: string): PlatformId {
  const n = filename.toLowerCase();
  const format = detectFormat(filename);
  // Package-manager manifests (not installers)
  if (format === "scoop" || format === "winget") return "other";
  if (format === "apk" || format === "aab" || n.includes("android")) return "android";
  if (format === "ipa" || n.includes("ios") || n.includes("iphone")) return "ios";
  if (
    format === "msix" ||
    format === "msi" ||
    format === "exe" ||
    (format === "zip" &&
      (n.includes("windows") || n.includes("win-") || n.includes("win32") || n.includes("win64"))) ||
    n.includes("windows") ||
    n.includes("win32") ||
    n.includes("win-x64")
  )
    return "windows";
  if (
    format === "dmg" ||
    format === "pkg" ||
    n.includes("macos") ||
    n.includes("darwin") ||
    n.includes("osx")
  )
    return "macos";
  if (
    format === "appimage" ||
    format === "deb" ||
    format === "rpm" ||
    format === "flatpak" ||
    format === "tar" ||
    n.includes("linux") ||
    n.includes("appimage")
  )
    return "linux";
  return "other";
}

/**
 * Detect CPU/ABI from Flutter split APK names and common desktop conventions.
 * Examples: app-arm64-v8a-release.apk, app-armeabi-v7a-release.apk, *-win-x64.msix
 */
export function detectArch(filename: string, platform: PlatformId): ArchId {
  const n = filename.toLowerCase();

  // Android ABI (Flutter --split-per-abi): app-arm64-v8a-release.apk
  if (n.includes("arm64-v8a") || n.includes("arm64_v8a")) return "arm64-v8a";
  if (n.includes("armeabi-v7a") || n.includes("armeabi_v7a")) return "armeabi-v7a";
  if (n.includes("x86_64") || n.includes("x86-64")) return "x86_64";
  // bare x86 after x86_64 check
  if (/(^|[^a-z0-9])x86([^_0-9]|$)/.test(n) || n.includes("x86-")) return "x86";

  // Desktop / general
  if (
    n.includes("amd64") ||
    n.includes("x86_64") ||
    n.includes("x64") ||
    n.includes("win-x64") ||
    n.includes("win64") ||
    n.includes("windows-x64")
  ) {
    return platform === "android" ? "x86_64" : "amd64";
  }
  if (
    n.includes("arm64") ||
    n.includes("aarch64") ||
    n.includes("apple-silicon") ||
    n.includes("darwin-arm64")
  ) {
    return platform === "android" ? "arm64-v8a" : "arm64";
  }
  if (n.includes("armv7") || n.includes("armeabi")) return "armeabi-v7a";
  if (n.includes("universal") || n.includes("fat") || n.includes("anycpu")) return "universal";

  // Fat / universal APK (no ABI in name)
  if (platform === "android" && /\.apk$/i.test(n)) return "universal";

  return "unknown";
}

export function isRecommendedArch(platform: PlatformId, arch: ArchId): boolean {
  const pref = RECOMMENDED_ARCH[platform];
  if (!pref) return false;
  if (arch === pref) return true;
  return false;
}

/** Preferred arch + preferred format only (one “推荐” per platform). */
export function isRecommendedAsset(
  platform: PlatformId,
  arch: ArchId,
  format: FormatId,
): boolean {
  if (isMetaAsset(platform, format)) return false;
  if (!isRecommendedArch(platform, arch)) return false;
  const prefFmt = RECOMMENDED_FORMAT[platform];
  if (!prefFmt) return true;
  return format === prefFmt;
}

export function archLabel(arch: ArchId): string {
  return ARCH_LABELS[arch] ?? arch;
}

/** Short chip label: "linux · x64 · tar.gz" / "windows · x64 · zip" */
export function assetDisplayLabel(
  platform: PlatformId,
  arch: ArchId,
  format: FormatId,
  filename: string,
): string {
  if (format === "scoop") return "Scoop 清单";
  if (format === "winget") return "winget 清单";
  const parts: string[] = [];
  if (platform && platform !== "other") parts.push(platform);
  const al = archLabel(arch);
  if (al && arch !== "unknown") parts.push(al);
  const fl = formatLabel(format);
  if (fl) parts.push(fl);
  if (parts.length === 0) return filename;
  return parts.join(" · ");
}

function archSortKey(platform: PlatformId, arch: ArchId): number {
  const pref = RECOMMENDED_ARCH[platform];
  if (pref && arch === pref) return 0;
  const order: ArchId[] =
    platform === "android"
      ? ["arm64-v8a", "armeabi-v7a", "x86_64", "x86", "universal", "unknown"]
      : platform === "macos"
        ? ["arm64", "amd64", "universal", "unknown"]
        : ["amd64", "arm64", "universal", "unknown"];
  const i = order.indexOf(arch);
  return i === -1 ? 50 : i + 1;
}

function formatSortKey(platform: PlatformId, format: FormatId): number {
  const pref = RECOMMENDED_FORMAT[platform];
  if (pref && format === pref) return 0;
  const order: FormatId[] =
    platform === "linux"
      ? ["tar", "appimage", "deb", "flatpak", "rpm", "other"]
      : platform === "windows"
        ? ["zip", "msix", "msi", "exe", "other"]
        : platform === "android"
          ? ["apk", "aab", "other"]
          : ["other"];
  const i = order.indexOf(format);
  return i === -1 ? 50 : i + 1;
}

export function mapRelease(r: GhRelease) {
  const parsed = parseFlutterVersion(r.tag_name || r.name || "");
  const titleParsed = r.name ? parseFlutterVersion(r.name) : null;
  const version =
    titleParsed && titleParsed.buildNumber && !parsed.buildNumber ? titleParsed : parsed;

  const tag = r.tag_name;
  const assets = (r.assets || []).map((a) => {
    const platform = detectPlatform(a.name);
    const arch = detectArch(a.name, platform);
    const format = detectFormat(a.name);
    const fl = formatLabel(format);
    return {
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      // Prefer same-origin proxy (CDN-cached); keep GitHub URL as fallback field
      url: proxyAssetUrl(tag, a.name),
      githubUrl: a.browser_download_url,
      contentType: a.content_type,
      platform,
      arch,
      archLabel: archLabel(arch),
      format,
      formatLabel: fl,
      label: assetDisplayLabel(platform, arch, format, a.name),
      meta: isMetaAsset(platform, format),
      recommended: isRecommendedAsset(platform, arch, format),
    };
  });

  assets.sort((a, b) => {
    // Installers first, then scoop/winget manifests
    if (a.meta !== b.meta) return a.meta ? 1 : -1;
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    const ka = archSortKey(a.platform, a.arch);
    const kb = archSortKey(b.platform, b.arch);
    if (ka !== kb) return ka - kb;
    const fa = formatSortKey(a.platform, a.format);
    const fb = formatSortKey(b.platform, b.format);
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });

  return {
    id: r.id,
    tag: r.tag_name,
    title: r.name || r.tag_name,
    version: version.display,
    versionName: version.versionName,
    buildNumber: version.buildNumber,
    body: r.body || "",
    prerelease: r.prerelease,
    draft: r.draft,
    htmlUrl: r.html_url,
    publishedAt: r.published_at || r.created_at,
    assets,
  };
}

/** Edge cache for GitHub JSON API (minutes). */
export const GH_API_CACHE_TTL = 300; // 5 min origin/edge fetch cache
export const GH_API_S_MAXAGE = 300; // 5 min CDN for /api/releases*
export const GH_API_SWR = 1800; // 30 min stale-while-revalidate

/** Edge cache for immutable release binaries (seconds). */
export const GH_ASSET_CACHE_TTL = 7 * 24 * 3600; // 7 days
export const GH_ASSET_S_MAXAGE = 7 * 24 * 3600;
export const GH_ASSET_BROWSER_MAXAGE = 24 * 3600; // 1 day browser

export function apiCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, s-maxage=${GH_API_S_MAXAGE}, stale-while-revalidate=${GH_API_SWR}`,
    "CDN-Cache-Control": `public, max-age=${GH_API_S_MAXAGE}, stale-while-revalidate=${GH_API_SWR}`,
  };
}

export function assetCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, max-age=${GH_ASSET_BROWSER_MAXAGE}, s-maxage=${GH_ASSET_S_MAXAGE}, immutable`,
    "CDN-Cache-Control": `public, max-age=${GH_ASSET_S_MAXAGE}, immutable`,
  };
}

type GhFetchOptions = {
  /** Override Accept (asset download uses application/octet-stream). */
  accept?: string;
  /** Cloudflare edge cache TTL for this upstream fetch. */
  cacheTtl?: number;
  /** Follow redirects (default true). */
  redirect?: RequestRedirect;
};

export async function ghFetch(path: string, token: string, opts: GhFetchOptions = {}) {
  const headers: Record<string, string> = {
    Accept: opts.accept || "application/vnd.github+json",
    "User-Agent": "Luotopia-Homepage-Pages",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const cacheTtl = opts.cacheTtl ?? GH_API_CACHE_TTL;
  // Pages Functions run on CF; `cf` is honored on the edge
  return fetch(`https://api.github.com${path}`, {
    headers,
    redirect: opts.redirect ?? "follow",
    cf: {
      cacheTtl,
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": cacheTtl, "404": 60, "500-599": 0 },
    },
  } as RequestInit);
}

/** Build same-origin proxy URL so downloads go through our CDN cache. */
export function proxyAssetUrl(tag: string, filename: string): string {
  const t = encodeURIComponent(tag);
  const n = encodeURIComponent(filename);
  return `/api/releases/download/${t}/${n}`;
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...apiCacheHeaders(),
      ...extraHeaders,
    },
  });
}
