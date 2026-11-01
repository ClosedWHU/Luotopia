/**
 * EdgeOne Makers middleware — lives at the PROJECT ROOT (beside edgeone.json),
 * which is where EdgeOne's own pipeline compiles it from. (An earlier attempt put
 * a bundled middleware.js at the *output* root; EdgeOne served that as a plain
 * static asset at /middleware.js instead of running it — the output dir is not
 * where middleware is discovered.)
 *
 * Why middleware and not an edge function: EdgeOne routes extension-bearing paths
 * (.json, .gz, .js, .ttf) to static-file handling and never to an edge function —
 * verified for [[path]] and [[default]] catch-alls and for exact manifest.json /
 * catalog.gz routes, all of which 404, while extension-less /api/status works.
 * The signed manifest and the model-metadata catalog live in R2 with no static
 * copy, so on this mirror they can only be served by something that runs before
 * static routing. Middleware does exactly that, and may return a Response
 * directly — so it proxies the two R2-backed paths from the canonical origin
 * (which reads R2). The `matcher` keeps it off every other path, so the committed
 * parser scripts and rare data assets fall through to EdgeOne's static copy.
 *
 * Self-contained on purpose: EdgeOne compiles this from the project root with its
 * own toolchain, so it must not depend on cross-directory import resolution. It
 * mirrors functions/lib/hot-update-origin.ts (the ESA/dispatch proxy) — keep the
 * two in sync.
 */

const ORIGIN = "https://www.whu.sb";
const EDGE_TTL = 120;

export async function middleware(context) {
  const request = context.request;
  const url = new URL(request.url);

  try {
    const headers = { "User-Agent": "Luotopia-Homepage-Mirror" };
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

    const upstream = await fetch(ORIGIN + url.pathname, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
    });

    if (upstream.status === 304) {
      const notModified = new Headers();
      const etag = upstream.headers.get("ETag");
      if (etag) notModified.set("ETag", etag);
      notModified.set("Cache-Control", `public, max-age=0, s-maxage=${EDGE_TTL}, must-revalidate`);
      return new Response(null, { status: 304, headers: notModified });
    }

    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, s-maxage=30" },
      });
    }

    const out = new Headers();
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) out.set("Content-Type", contentType);
    const etag = upstream.headers.get("ETag");
    if (etag) out.set("ETag", etag);
    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) out.set("Content-Length", contentLength);
    out.set("Cache-Control", `public, max-age=0, s-maxage=${EDGE_TTL}, must-revalidate`);
    out.set("Access-Control-Allow-Origin", "*");
    out.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, { status: 200, headers: out });
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
  ],
};
