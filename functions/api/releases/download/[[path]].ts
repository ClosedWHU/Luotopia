/**
 * Reverse-proxy GitHub Release assets with long edge cache.
 *
 * GET /api/releases/download/:tag/:filename
 * Example: /api/releases/download/v1.0.0%2B3/app-arm64-v8a-release.apk
 *
 * Only serves assets that belong to REPO (default ClosedWHU/Luotopia).
 */

import {
  assetCacheHeaders,
  GH_API_CACHE_TTL,
  GH_ASSET_CACHE_TTL,
  ghFetch,
  json,
  type GhRelease,
} from "../../../lib/github-releases";

function parsePath(raw: string | string[] | undefined): { tag: string; name: string } | null {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split("/").filter(Boolean)
      : [];
  if (parts.length < 2) return null;
  const tag = decodeURIComponent(parts[0] || "");
  const name = decodeURIComponent(parts.slice(1).join("/"));
  if (!tag || !name) return null;
  // Basic traversal / abuse guards
  if (tag.includes("..") || name.includes("..") || name.includes("\\")) return null;
  if (name.length > 256 || tag.length > 128) return null;
  return { tag, name };
}

export async function onRequestGet(context: {
  request: Request;
  env: { REPO?: string; GITHUB_TOKEN?: string };
  params: { path?: string | string[] };
}): Promise<Response> {
  const { env, params } = context;
  const repo = env.REPO || "ClosedWHU/Luotopia";
  const token = env.GITHUB_TOKEN || "";

  const parsed = parsePath(params.path);
  if (!parsed) {
    return json({ error: "bad_request", message: "Usage: /api/releases/download/:tag/:filename" }, 400, {
      "Cache-Control": "no-store",
    });
  }
  const { tag, name } = parsed;

  try {
    // Resolve release by tag (cached at edge)
    const relRes = await ghFetch(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, token, {
      cacheTtl: GH_API_CACHE_TTL,
    });
    if (relRes.status === 404) {
      return json({ error: "not_found", message: `Release tag not found: ${tag}` }, 404, {
        "Cache-Control": "public, s-maxage=60",
      });
    }
    if (!relRes.ok) {
      const text = await relRes.text();
      return json(
        { error: "github_error", status: relRes.status, message: text.slice(0, 200) },
        502,
        { "Cache-Control": "public, s-maxage=30" },
      );
    }

    const release = (await relRes.json()) as GhRelease;
    if (release.draft) {
      return json({ error: "not_found", message: "Draft releases are not downloadable" }, 404, {
        "Cache-Control": "no-store",
      });
    }

    const asset = (release.assets || []).find((a) => a.name === name);
    if (!asset) {
      return json(
        { error: "not_found", message: `Asset not found on ${tag}: ${name}` },
        404,
        { "Cache-Control": "public, s-maxage=120" },
      );
    }

    // Prefer API asset endpoint (works with token; returns redirect or body)
    const assetApi = await ghFetch(`/repos/${repo}/releases/assets/${asset.id}`, token, {
      accept: "application/octet-stream",
      cacheTtl: GH_ASSET_CACHE_TTL,
      redirect: "follow",
    });

    let upstream = assetApi;
    // Fallback to browser_download_url if API asset path fails
    if (!upstream.ok && asset.browser_download_url) {
      upstream = await fetch(asset.browser_download_url, {
        headers: {
          "User-Agent": "Luotopia-Homepage-Pages",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        redirect: "follow",
        cf: {
          cacheTtl: GH_ASSET_CACHE_TTL,
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": GH_ASSET_CACHE_TTL, "404": 120, "500-599": 0 },
        },
      } as RequestInit);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return json(
        {
          error: "upstream_error",
          status: upstream.status,
          message: text.slice(0, 200) || "Failed to fetch asset from GitHub",
        },
        upstream.status === 404 ? 404 : 502,
        { "Cache-Control": "public, s-maxage=30" },
      );
    }

    const contentType =
      upstream.headers.get("Content-Type") ||
      asset.content_type ||
      "application/octet-stream";
    const contentLength = upstream.headers.get("Content-Length") || String(asset.size || "");

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "Access-Control-Allow-Origin": "*",
      ...assetCacheHeaders(),
      "X-Content-Type-Options": "nosniff",
      "X-Proxied-From": "github-releases",
      "X-Release-Tag": tag,
    });
    if (contentLength) headers.set("Content-Length", contentLength);

    // Stream body; do not buffer whole file in memory
    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (e) {
    return json(
      { error: "fetch_failed", message: e instanceof Error ? e.message : String(e) },
      502,
      { "Cache-Control": "no-store" },
    );
  }
}
