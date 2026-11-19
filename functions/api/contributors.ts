import {
  GH_API_CACHE_TTL,
  apiCacheHeaders,
  ghFetch,
  json,
  type GhRelease,
} from "../lib/github-releases";

type Contributor = {
  id: string;
  name: string;
  type: "human" | "bot";
  repositories: string[];
  commits: number;
  added_lines?: number;
  deleted_lines?: number;
  net_lines?: number;
  added_ksloc: number;
  deleted_ksloc: number;
  net_ksloc: number;
  rank_score_ksloc: number;
  matched_cancellations: number;
  canceled_added_lines?: number;
  canceled_deleted_lines?: number;
  first_commit?: string | null;
  last_commit?: string | null;
};

type ContributorsReport = {
  contributors?: Contributor[];
  human_contributors?: Contributor[];
  bot_contributors?: Contributor[];
  identity_aliases?: unknown[];
  repo_summary?: unknown[];
  repositories?: string[];
};

const AVATAR_LOGINS: Record<string, string> = {
  "0x535A": "0x535a",
  Enchograph: "Enchograph",
  GuGuMur: "GuGuMur",
  "Hsukqi Lee": "HsukqiLee",
};

function avatarUrl(login: string | undefined): string | null {
  if (!login) return null;
  return `/api/contributors/avatar/${encodeURIComponent(login)}`;
}

function decorate(items: Contributor[] | undefined) {
  return (items || []).map((item) => {
    const login = AVATAR_LOGINS[item.name];
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      repositories: item.repositories,
      commits: item.commits,
      addedLines: item.added_lines || 0,
      deletedLines: item.deleted_lines || 0,
      netLines: item.net_lines || 0,
      addedKsloc: item.added_ksloc,
      deletedKsloc: item.deleted_ksloc,
      netKsloc: item.net_ksloc,
      rankScoreKsloc: item.rank_score_ksloc,
      matchedCancellations: item.matched_cancellations,
      canceledAddedLines: item.canceled_added_lines || 0,
      canceledDeletedLines: item.canceled_deleted_lines || 0,
      firstCommit: item.first_commit || null,
      lastCommit: item.last_commit || null,
      avatarUrl: avatarUrl(login),
    };
  });
}

export async function onRequestGet(context: {
  env: { CONTRIBUTORS_REPO?: string; GITHUB_TOKEN?: string };
}): Promise<Response> {
  const repo = context.env.CONTRIBUTORS_REPO || "ClosedWHU/Luotopia-Contributors";
  const token = context.env.GITHUB_TOKEN || "";

  try {
    const releaseResponse = await ghFetch(
      `/repos/${repo}/releases/latest`,
      token,
      { cacheTtl: GH_API_CACHE_TTL },
    );
    if (!releaseResponse.ok) {
      return json(
        { error: "github_error", status: releaseResponse.status },
        502,
        { "Cache-Control": "public, s-maxage=60" },
      );
    }

    const release = (await releaseResponse.json()) as GhRelease;
    const asset = release.assets.find((candidate) => candidate.name === "contributor-sloc.json");
    if (!asset) {
      return json({ error: "contributors_asset_missing" }, 502, {
        "Cache-Control": "public, s-maxage=60",
      });
    }

    const assetResponse = await ghFetch(
      `/repos/${repo}/releases/assets/${asset.id}`,
      token,
      {
        accept: "application/octet-stream",
        cacheTtl: GH_API_CACHE_TTL,
        redirect: "follow",
      },
    );
    if (!assetResponse.ok) {
      return json({ error: "contributors_asset_fetch_failed" }, 502, {
        "Cache-Control": "public, s-maxage=60",
      });
    }

    const report = (await assetResponse.json()) as ContributorsReport;
    return new Response(
      JSON.stringify({
        generatedAt: release.published_at || release.created_at,
        releaseTag: release.tag_name,
        repositories: report.repositories || [],
        identityAliases: report.identity_aliases || [],
        humanContributors: decorate(report.human_contributors),
        botContributors: decorate(report.bot_contributors),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          ...apiCacheHeaders(),
        },
      },
    );
  } catch (error) {
    return json(
      {
        error: "contributors_fetch_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
      { "Cache-Control": "no-store" },
    );
  }
}
