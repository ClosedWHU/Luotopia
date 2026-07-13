/** Shared GitHub Releases helpers for Pages Functions */

export type PlatformId = "android" | "ios" | "windows" | "macos" | "linux" | "other";

export interface GhAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  content_type: string;
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

export function detectPlatform(filename: string): PlatformId {
  const n = filename.toLowerCase();
  if (/\.apk$/i.test(n) || n.includes("android") || n.includes("aab")) return "android";
  if (/\.ipa$/i.test(n) || n.includes("ios") || n.includes("iphone")) return "ios";
  if (/\.(msix|msi|exe|appx)$/i.test(n) || n.includes("windows") || n.includes("win32") || n.includes("win-x64"))
    return "windows";
  if (/\.(dmg|pkg)$/i.test(n) || n.includes("macos") || n.includes("darwin") || n.includes("osx")) return "macos";
  if (/\.(appimage|deb|rpm|tar\.gz|tgz)$/i.test(n) || n.includes("linux")) return "linux";
  return "other";
}

export function mapRelease(r: GhRelease) {
  const parsed = parseFlutterVersion(r.tag_name || r.name || "");
  const titleParsed = r.name ? parseFlutterVersion(r.name) : null;
  const version =
    titleParsed && titleParsed.buildNumber && !parsed.buildNumber ? titleParsed : parsed;

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
    assets: (r.assets || []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      url: a.browser_download_url,
      contentType: a.content_type,
      platform: detectPlatform(a.name),
    })),
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
