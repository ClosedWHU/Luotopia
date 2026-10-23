/*
 * Legacy docs.whu.sb URL resolution, shared with the build.
 *
 * src/config/docs/redirects.mjs is the generated single source of truth for
 * the documentation site's historical URLs (old Docusaurus slugs, numbered
 * section prefixes, underscore variants, category URLs). Its keys and values
 * are docs-root-relative ("/server/cli_reference" -> "/server/cli-reference");
 * astro.config.mjs mounts them (prefixed with /docs) as the on-site redirect
 * table, and this module does the same for requests arriving on the old
 * docs.whu.sb hostname — so a legacy bookmark lands on its final canonical
 * URL in exactly one hop.
 */
// @ts-expect-error -- untyped generated ESM shared with astro.config.mjs
import { redirects } from "../../src/config/docs/redirects.mjs";

const LEGACY = redirects as Record<string, string>;

/**
 * Sections that moved to the private Luotopia-Docs repo in the 2026-10
 * split. Their old docs.whu.sb URLs have no public target; they land on the
 * docs home, which explains where the developer documentation went.
 */
const PRIVATE_SECTIONS = ["server", "ebike"];

/** Map a docs.whu.sb pathname onto its canonical `https://www.whu.sb/docs…` path. */
export function resolveDocsRedirect(pathname: string): string {
  const direct = LEGACY[pathname];
  if (direct) return `/docs${direct}`;
  // Old category indexes were served with a trailing slash; the generated map
  // keys never carry one.
  const trimmed = pathname.replace(/\/+$/, "");
  const mapped = LEGACY[trimmed];
  if (mapped) return `/docs${mapped}`;
  const section = trimmed.split("/")[1] ?? "";
  if (PRIVATE_SECTIONS.includes(section)) return "/docs/";
  return trimmed ? `/docs${trimmed}` : "/docs/";
}
