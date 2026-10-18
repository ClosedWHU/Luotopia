import { execSync } from "node:child_process";

/**
 * Build metadata shown in the footer ("Commit <hash> built at <time>").
 *
 * Build-time only: this module is imported from `Footer.astro`'s frontmatter,
 * which runs in Node during `astro build`, never in the client bundle. The
 * Chrome 66 floor elsewhere does not apply here.
 *
 * The commit is read from Cloudflare Pages' environment when present and from
 * the local git checkout otherwise, so the same footer works on the primary
 * deployment, the EdgeOne/ESA mirrors and local builds. `REPO` follows the
 * convention already documented in `docs/deployment.md`.
 */

const REPO = process.env.REPO ?? "ClosedWHU/Luotopia";

function run(command: string): string | undefined {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface BuildInfo {
  /** 8-character short hash, or `"unknown"` when no commit is available. */
  shortHash: string;
  /** GitHub URL for the commit, using the full hash. */
  commitUrl: string;
  /** Local wall-clock time in Asia/Shanghai, like `2026/10/18 15:22:51`. */
  builtAt: string;
}

/**
 * Format `date` as Asia/Shanghai (UTC+8, no DST). Build hosts run in UTC, but
 * the audience is in China, so a raw UTC stamp would read eight hours early.
 */
function formatBuiltAt(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
  );
}

let cached: BuildInfo | null = null;

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;

  const fullHash = process.env.CF_PAGES_COMMIT_SHA || run("git rev-parse HEAD") || "unknown";
  const shortHash = fullHash === "unknown" ? "unknown" : fullHash.slice(0, 8);
  const commitUrl = `https://github.com/${REPO}/commit/${fullHash}`;

  cached = { shortHash, commitUrl, builtAt: formatBuiltAt(new Date()) };
  return cached;
}
