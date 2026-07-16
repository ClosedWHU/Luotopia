/**
 * GET /api/releases?page=1&per_page=10
 *
 * Env: REPO (default ClosedWHU/Luotopia), GITHUB_TOKEN (optional)
 */

import { apiCacheHeaders, ghFetch, json, mapRelease, type GhRelease } from "../../lib/github-releases";

export async function onRequestGet(context: {
  request: Request;
  env: { REPO?: string; GITHUB_TOKEN?: string };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const repo = env.REPO || "ClosedWHU/Luotopia";
  const token = env.GITHUB_TOKEN || "";

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(
    30,
    Math.max(1, parseInt(url.searchParams.get("per_page") || "10", 10) || 10),
  );
  const includePrerelease = url.searchParams.get("prerelease") !== "0";

  try {
    const res = await ghFetch(`/repos/${repo}/releases?page=${page}&per_page=${perPage}`, token);

    if (!res.ok) {
      const text = await res.text();
      return json(
        { error: "github_error", status: res.status, message: text.slice(0, 200) },
        res.status === 403 ? 502 : res.status,
        { "Cache-Control": "public, s-maxage=30" },
      );
    }

    const data = (await res.json()) as GhRelease[];
    let items = data.filter((r) => !r.draft);
    if (!includePrerelease) items = items.filter((r) => !r.prerelease);

    const link = res.headers.get("Link") || "";
    const hasNext = link.includes('rel="next"');
    const hasPrev = link.includes('rel="prev"');

    return json(
      {
        page,
        perPage,
        hasNext,
        hasPrev,
        items: items.map(mapRelease),
      },
      200,
      apiCacheHeaders(),
    );
  } catch (e) {
    return json(
      { error: "fetch_failed", message: e instanceof Error ? e.message : String(e) },
      502,
      { "Cache-Control": "no-store" },
    );
  }
}
