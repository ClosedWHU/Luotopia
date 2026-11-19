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

// Numeric accounts verified against repository commit/contributor metadata.
const AVATAR_IDS: Record<string, number> = {
  "i@0x535a.cn": 264958572,
  "ender0213@outlook.com": 67186192,
  "2221533105@qq.com": 44727214,
  "team@tsinbei.com": 79034142,
  "fqwqf@fqwqf.xyz": 69208179,
  "johnson-tang2019@outlook.com": 106751350,
  "guyues@outlook.com": 30401338,
  "jingyan-x": 95037758,
  "mornhussakuyo@gmail.com": 248266228,
  "hoyou06@qq.com": 184511944,
  "3624951962@qq.com": 190065939,
  "shz20071026@163.com": 166027578,
  "3621027213@qq.com": 243921773,
  "1029687661@qq.com": 172453170,
  "2024302072042@whu.edu.cn": 219803883,
  "git@superexercisebook.com": 6327311,
  "gdnesso@gmail.com": 233723091,
  "yinjiab@gmail.com": 83490374,
  "misa.subanxia@icloud.com": 45150398,
  "badges@fossa.io": 29791463,
  "noreply@anthropic.com": 81847,
  "3066474607@qq.com": 47223358,
  "yangqk12@whu.edu.cn": 219803883,
};

// Profile names verified by numeric account ID; Git author names remain in the report.
const PROFILES: Record<number, { username: string; nickname: string }> = {
  264958572: { username: "0x535a", nickname: "0x535A" },
  67186192: { username: "Enchograph", nickname: "陈广隰 / Chen Guangxi" },
  44727214: { username: "GuGuMur", nickname: "HevCateon" },
  79034142: { username: "HsukqiLee", nickname: "Hsukqi Lee" },
  69208179: { username: "fQwQf", nickname: "fQwQf" },
  106751350: { username: "Johnson-Tang2019", nickname: "Johnson-Tang2019" },
  30401338: { username: "Crescentm", nickname: "Crescentm" },
  95037758: { username: "jingyan-x", nickname: "Jingyan" },
  248266228: { username: "mornhussakuyo-hub", nickname: "MornHus" },
  184511944: { username: "Yinary", nickname: "Yinary" },
  190065939: { username: "QinXi-ai", nickname: "QinXi" },
  166027578: { username: "SuiYueMengHen", nickname: "SuiYueMengHen" },
  243921773: { username: "hao2530", nickname: "hao2530" },
  172453170: { username: "wofiporia", nickname: "wofiporia" },
  219803883: { username: "LaplaceYoung", nickname: "laplaceyoung" },
  6327311: { username: "ExerciseBook", nickname: "Eric_Lian" },
  233723091: { username: "LeixinSun", nickname: "Leixin Sun" },
  83490374: { username: "little-weakduck", nickname: "Little Weakduck" },
  45150398: { username: "misakayuuki", nickname: "小天使misa！" },
  29791463: { username: "fossabot", nickname: "fossabot" },
  47223358: { username: "answerend42", nickname: "answerend42" },
};

// GitHub App bot avatars use installation artwork (/in/), not user IDs (/u/).
const BOT_APP_AVATARS: Record<string, number> = {
  "dependabot[bot]": 29110,
  "github-actions[bot]": 15368,
};

async function avatarUrl(identity: string): Promise<string> {
  const appId = BOT_APP_AVATARS[identity];
  if (appId) return `/api/contributors/avatar/app-${appId}`;
  const id = AVATAR_IDS[identity];
  if (id) return `/api/contributors/avatar/${id}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `/api/contributors/avatar/identicon-${hash}`;
}

async function decorate(items: Contributor[] | undefined) {
  return Promise.all((items || []).map(async (item) => {
    const profile = PROFILES[AVATAR_IDS[item.id]];
    return {
      id: item.id,
      name: profile?.nickname || item.name,
      username: profile?.username || (BOT_APP_AVATARS[item.id] ? item.id : null),
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
      avatarUrl: await avatarUrl(item.id),
    };
  }));
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
        humanContributors: await decorate(report.human_contributors),
        botContributors: await decorate(report.bot_contributors),
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
