/**
 * Top-level route segments the app's GoRouter owns.
 *
 * Mirrors the *first* segment of every path in
 * `app/lib/app/router/app_route_paths.dart`. Segment granularity is deliberate:
 * the app has a couple of hundred nested routes and they churn, while the top
 * level has been stable since the first release. A deep link whose first
 * segment is unknown can never match, so that is the only judgement the web side
 * can make honestly — anything deeper is the app's own error screen to handle.
 *
 * Two consumers, and the wording matters for both:
 * - `open.astro` warns that an unrecognised link will still be handed to the
 *   app, because a stale allowlist must never block a launch that would work.
 * - `404.astro` offers to re-open an unknown *site* path on the deep-link host,
 *   where it might well be a valid app route.
 */
export const DEEPLINK_ROOT_SEGMENTS = [
  "ai",
  "campus",
  "forum",
  "item-detail",
  "item-editor",
  "list",
  "onboarding",
  "settings",
] as const;

/** First segment of a pathname, or "" for the app root. */
export function deeplinkRootSegment(pathname: string): string {
  const segment = String(pathname || "").split("/")[1];
  return segment === undefined ? "" : decodeURIComponent(segment);
}

/** True when the app could plausibly own `pathname`. */
export function isSupportedDeeplinkPath(pathname: string): boolean {
  const root = deeplinkRootSegment(pathname);
  if (root === "") return true;
  return (DEEPLINK_ROOT_SEGMENTS as readonly string[]).indexOf(root) !== -1;
}
