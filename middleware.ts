/**
 * EdgeOne Makers middleware — lives at the PROJECT ROOT (beside edgeone.json),
 * which is where EdgeOne's own pipeline compiles it from. (An earlier attempt put
 * a bundled middleware.js at the *output* root; EdgeOne served that as a plain
 * static asset at /middleware.js instead of running it.)
 *
 * Why middleware and not edge functions: EdgeOne routes extension-bearing paths
 * (.json, .gz, .js, .ttf, .apk, …) to static-file handling and NEVER to an edge
 * function — verified for [[path]] and [[default]] catch-alls and for exact
 * multi-dot routes, all of which 404, while extension-less /api/status works.
 * Several of this site's dynamic routes serve extension-bearing paths and have no
 * static copy, so on this mirror they can only be answered by something that runs
 * before static routing. Middleware does exactly that and may return a Response
 * directly, so it reverse-proxies those paths from the canonical origin
 * (www.whu.sb, Cloudflare), whose own functions do the real work:
 *
 *   /hot-update/manifest.json                     → R2 (signed manifest)
 *   /hot-update/assets/model-metadata-catalog…gz  → R2 (daily model catalog)
 *   /fonts/gstatic/*                              → fonts.gstatic.com proxy
 *   /api/releases/download/*                      → GitHub Release asset proxy
 *
 * The `matcher` keeps middleware off every other path, so the committed parser
 * scripts, rare data assets, pages and bundles fall through to EdgeOne's static
 * copy untouched. Self-contained on purpose (no imports): EdgeOne compiles it
 * from the project root with its own toolchain. The hot-update proxy mirrors
 * functions/lib/hot-update-origin.ts (the ESA path) — keep the cache intent in
 * sync; gstatic/releases keep the origin's own Cache-Control (immutable fonts,
 * long-lived assets).
 */

const ORIGIN = "https://www.whu.sb";

/** Mutable, revalidated often: a short edge TTL beats a cross-cloud hit per check. */
const HOT_UPDATE_EDGE_TTL = 120;

const HOT_UPDATE_PATHS = new Set([
  "/hot-update/manifest.json",
  "/hot-update/assets/model-metadata-catalog.json.gz",
]);

/** Path prefixes proxied from the origin (extension-bearing, no static copy). */
const PROXIED_PREFIXES = ["/fonts/gstatic/", "/api/releases/download/", "/api/cli/releases/download/"];

function classify(pathname) {
  if (HOT_UPDATE_PATHS.has(pathname)) return "hot-update";
  for (const prefix of PROXIED_PREFIXES) {
    if (pathname.startsWith(prefix)) return "proxy";
  }
  return null;
}

export async function middleware(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const kind = classify(url.pathname);
  // Defensive: the matcher should already restrict us, but never proxy a path we
  // did not claim — hand anything else straight back to EdgeOne's own routing.
  if (!kind) return next();

  try {
    const reqHeaders = { "User-Agent": "Luotopia-Homepage-Mirror" };
    // Forward conditional headers so an unchanged file is a cheap 304 end to end.
    for (const h of ["If-None-Match", "If-Modified-Since"]) {
      const v = request.headers.get(h);
      if (v) reqHeaders[h] = v;
    }

    const upstream = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: reqHeaders,
      redirect: "manual",
    });

    // Redirects (release assets can 302 to a CDN) and 304s pass through verbatim.
    if (upstream.status === 304 || (upstream.status >= 300 && upstream.status < 400)) {
      const h = new Headers();
      for (const k of ["Location", "ETag", "Last-Modified", "Cache-Control"]) {
        const v = upstream.headers.get(k);
        if (v) h.set(k, v);
      }
      if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
      return new Response(null, { status: upstream.status, headers: h });
    }

    if (!upstream.ok || (!upstream.body && request.method !== "HEAD")) {
      return new Response("Upstream error", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, s-maxage=30" },
      });
    }

    const out = new Headers();
    for (const k of [
      "Content-Type",
      "Content-Disposition",
      "ETag",
      "Last-Modified",
      "Accept-Ranges",
      "Content-Range",
      "Expires",
    ]) {
      const v = upstream.headers.get(k);
      if (v) out.set(k, v);
    }
    // Only forward Content-Length when the body was not transport-decoded, or it
    // would disagree with the (decompressed) bytes we stream.
    if (!upstream.headers.get("Content-Encoding")) {
      const cl = upstream.headers.get("Content-Length");
      if (cl) out.set("Content-Length", cl);
    }
    if (kind === "hot-update") {
      out.set("Cache-Control", `public, max-age=0, s-maxage=${HOT_UPDATE_EDGE_TTL}, must-revalidate`);
    } else {
      // gstatic is content-addressed/immutable and release assets are long-lived;
      // the origin already sets the right policy, so honour it.
      const cc = upstream.headers.get("Cache-Control");
      if (cc) out.set("Cache-Control", cc);
    }
    out.set("Access-Control-Allow-Origin", "*");
    out.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Fetch failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const config = {
  matcher: [
    "/hot-update/manifest.json",
    "/hot-update/assets/model-metadata-catalog.json.gz",
    "/fonts/gstatic/:path*",
    "/api/releases/download/:path*",
    "/api/cli/releases/download/:path*",
  ],
};
