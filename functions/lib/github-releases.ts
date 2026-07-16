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

const ARCH_LABELS: Record<ArchId, string> = {
  "arm64-v8a": "arm64-v8a",
  "armeabi-v7a": "armeabi-v7a",
  x86_64: "x86_64",
  x86: "x86",
  amd64: "x64 / amd64",
  arm64: "arm64",
  universal: "通用",
  unknown: "通用包",
};

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

export function detectPlatform(filename: string): PlatformId {
  const n = filename.toLowerCase();
  if (/\.apk$/i.test(n) || n.includes("android") || n.includes("aab")) return "android";
  if (/\.ipa$/i.test(n) || n.includes("ios") || n.includes("iphone")) return "ios";
  if (
    /\.(msix|msi|exe|appx)$/i.test(n) ||
    (/\.zip$/i.test(n) && (n.includes("windows") || n.includes("win-") || n.includes("win32") || n.includes("win64"))) ||
    n.includes("windows") ||
    n.includes("win32") ||
    n.includes("win-x64")
  )
    return "windows";
  if (/\.(dmg|pkg)$/i.test(n) || n.includes("macos") || n.includes("darwin") || n.includes("osx")) return "macos";
  if (/\.(appimage|deb|rpm|tar\.gz|tgz)$/i.test(n) || n.includes("linux")) return "linux";
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
  // Treat unknown universal desktop packages as non-recommended (user should pick arch)
  return false;
}

export function archLabel(arch: ArchId): string {
  return ARCH_LABELS[arch] ?? arch;
}

function archSortKey(platform: PlatformId, arch: ArchId): number {
  const pref = RECOMMENDED_ARCH[platform];
  if (pref && arch === pref) return 0;
  // Preferred secondary order per platform
  const order: ArchId[] =
    platform === "android"
      ? ["arm64-v8a", "armeabi-v7a", "x86_64", "x86", "universal", "unknown"]
      : platform === "macos"
        ? ["arm64", "amd64", "universal", "unknown"]
        : ["amd64", "arm64", "universal", "unknown"];
  const i = order.indexOf(arch);
  return i === -1 ? 50 : i + 1;
}

export function mapRelease(r: GhRelease) {
  const parsed = parseFlutterVersion(r.tag_name || r.name || "");
  const titleParsed = r.name ? parseFlutterVersion(r.name) : null;
  const version =
    titleParsed && titleParsed.buildNumber && !parsed.buildNumber ? titleParsed : parsed;

  const assets = (r.assets || []).map((a) => {
    const platform = detectPlatform(a.name);
    const arch = detectArch(a.name, platform);
    return {
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      url: a.browser_download_url,
      contentType: a.content_type,
      platform,
      arch,
      archLabel: archLabel(arch),
      recommended: isRecommendedArch(platform, arch),
    };
  });

  assets.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    const ka = archSortKey(a.platform, a.arch);
    const kb = archSortKey(b.platform, b.arch);
    if (ka !== kb) return ka - kb;
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

export async function ghFetch(path: string, token: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Luotopia-Homepage-Pages",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`https://api.github.com${path}`, { headers });
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}
