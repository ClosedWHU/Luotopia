// Legacy documentation URLs that remain resolvable on the public site after
// the 2026-10 split (user/client sections only). Keys/values are
// docs-root-relative; astro.config.mjs mounts them under /docs, and
// functions/lib/docs-redirects.ts uses them for docs.whu.sb 301s — where the
// removed server/ebike sections fall back to the /docs/ landing by prefix
// rule instead. The old Docusaurus-era numbered/underscore variants for
// client pages are preserved below.
export const redirects = {
  "/client/api_integration": "/client/api-integration",
  "/client/multi_platform": "/client/multi-platform",
  "/client/state_management": "/client/state-management"
};
