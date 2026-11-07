/** Published CLI builds and their own changelog; independent of App releases. */
import { apiCacheHeaders, ghFetch, json, type GhRelease } from "../../lib/github-releases";

const repo = "ClosedWHU/Luotopia-CLI";

export async function onRequestGet(context: {
  env: { GITHUB_TOKEN?: string };
}): Promise<Response> {
  const token = context.env.GITHUB_TOKEN;
  if (!token) return json({ error: "not_configured" }, 503, { "Cache-Control": "no-store" });
  try {
    const response = await ghFetch(`/repos/${repo}/releases?per_page=30`, token);
    if (!response.ok) {
      return json({ error: "github_error", status: response.status }, 502, { "Cache-Control": "no-store" });
    }
    const releases = (await response.json()) as GhRelease[];
    const items = releases.filter((release) => !release.draft).map((release) => ({
      tag: release.tag_name,
      version: release.tag_name.replace(/^v/, ""),
      name: release.name || release.tag_name,
      htmlUrl: release.html_url,
      body: release.body || "",
      publishedAt: release.published_at || release.created_at,
      prerelease: release.prerelease,
      assets: release.assets.filter((asset) => /^(?:luotopia(-cli)?-|SHA256SUMS-)(windows|linux|darwin)-/.test(asset.name)).map((asset) => ({
        name: asset.name,
        size: asset.size,
        url: `/api/cli/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}`,
      })),
    }));
    items.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    return json({ latest: items[0] || null, items }, 200, apiCacheHeaders());
  } catch {
    return json({ error: "fetch_failed" }, 502, { "Cache-Control": "no-store" });
  }
}
