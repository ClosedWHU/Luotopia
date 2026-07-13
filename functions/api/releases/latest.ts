/**
 * GET /api/releases/latest?prerelease=1
 * Newest non-draft release. Default = GitHub "latest" (stable only).
 * prerelease=1 allows the newest release including pre-releases.
 */

import { ghFetch, json, mapRelease, type GhRelease } from "../../lib/github-releases";

export async function onRequestGet(context: {
  request: Request;
  env: { REPO?: string; GITHUB_TOKEN?: string };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const repo = env.REPO || "ClosedWHU/Luotopia";
  const token = env.GITHUB_TOKEN || "";
  const allowPre = url.searchParams.get("prerelease") === "1";

  try {
    if (!allowPre) {
      const res = await ghFetch(`/repos/${repo}/releases/latest`, token);
      if (res.ok) {
        const data = (await res.json()) as GhRelease;
        if (!data.draft) {
          return json(mapRelease(data), 200, {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          });
        }
      }
    }

    const listRes = await ghFetch(`/repos/${repo}/releases?per_page=15`, token);
    if (!listRes.ok) {
      const text = await listRes.text();
      return json(
        { error: "github_error", status: listRes.status, message: text.slice(0, 200) },
        502,
      );
    }
    const list = (await listRes.json()) as GhRelease[];
    const found = list.find((r) => !r.draft && (allowPre || !r.prerelease));
    if (!found) {
      return json({ error: "not_found", message: "No releases" }, 404);
    }
    return json(mapRelease(found), 200, {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    });
  } catch (e) {
    return json(
      { error: "fetch_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
}
