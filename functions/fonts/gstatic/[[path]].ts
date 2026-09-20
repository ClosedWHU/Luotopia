/**
 * Mirror of the content-addressed font files `google_fonts` fetches at runtime.
 *
 * GET /fonts/gstatic/s/a/<sha256>.ttf -> https://fonts.gstatic.com/s/a/<sha256>.ttf
 *
 * The Flutter client cannot reach fonts.gstatic.com from most mainland-China
 * networks; this origin can. Only that one path shape is proxied, and it is
 * self-validating: the file name *is* the SHA-256 of the body, and the client
 * re-checks both the hash and the byte length before it will load a face
 * (google_fonts does this itself). A poisoned cache or a wrong upstream body
 * therefore cannot become a rendered glyph, and anything outside the pattern
 * 404s instead of turning this into an open proxy.
 */

const UPSTREAM_ORIGIN = "https://fonts.gstatic.com";

/** `/s/a/<64 hex>.ttf|otf` — the only URLs google_fonts ever requests. */
const ASSET_PATH = /^s\/a\/[0-9a-f]{64}\.(?:ttf|otf)$/;

/** Faces are ~0.5 MB; the cap only exists to refuse nonsense responses. */
const MAX_BYTES = 32 * 1024 * 1024;

/** Edge cache for immutable, content-addressed bodies. */
const CACHE_TTL = 60 * 60 * 24 * 30;

function parsePath(raw: string | string[] | undefined): string | null {
  const joined = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  const normalized = joined.replace(/^\/+/, "");
  // Traversal and abuse guards: the pattern above already rejects anything
  // that is not one flat, hex-named font file.
  if (normalized.includes("..") || normalized.includes("\\")) return null;
  if (!ASSET_PATH.test(normalized)) return null;
  return normalized;
}

export async function onRequestGet(context: {
  request: Request;
  params: { path?: string | string[] };
}): Promise<Response> {
  const path = parsePath(context.params.path);
  if (!path) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const upstream = await fetch(`${UPSTREAM_ORIGIN}/${path}`, {
      headers: { "User-Agent": "Luotopia-Homepage-Pages" },
      cf: {
        cacheTtl: CACHE_TTL,
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": CACHE_TTL, "404": 60, "500-599": 0 },
      },
    } as RequestInit);

    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, s-maxage=30" },
      });
    }

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return new Response("Upstream response too large", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const headers = new Headers({
      "Content-Type": path.endsWith(".otf") ? "font/otf" : "font/ttf",
      // Content-addressed: the name is the body hash, so the bytes never change.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "X-Proxied-From": "fonts.gstatic.com",
    });
    if (contentLength) headers.set("Content-Length", contentLength);

    // Stream the body; do not buffer a whole face in memory.
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Fetch failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
