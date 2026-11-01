/**
 * `/hot-update/*` on Cloudflare Pages — the origin's handler.
 *
 * Two files under this prefix are no longer committed static assets: the signed
 * `manifest.json` and the model-metadata catalog `.gz` live in R2 (bucket
 * `whu-sb-bucket`, binding `HOT_UPDATE_R2`), published there by the daily
 * `sync-model-metadata` workflow and by `hot-update:publish`. That keeps the
 * catalog — a ~137 KB gzip that never delta-compresses, rewritten whenever the
 * upstream model landscape moves — out of git history, where it was adding a
 * blob and a bot commit every single day. See public/hot-update/README.md.
 *
 * Everything else under `/hot-update/` (parser scripts, the rare manually
 * published data assets) is still a committed static file, passed straight
 * through to the asset server so its `_headers` caching is untouched.
 *
 * A catch-all rather than exact `manifest.json.ts` / `*.json.gz.ts` entries:
 * multi-extension file names are a file-router edge case not worth depending on,
 * and one prefix handler mirrors what the EdgeOne/ESA adapters do. The two
 * R2-backed keys are an explicit allow-list, so nothing else can reach the
 * bucket through here.
 */

type R2ObjectBody = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  httpMetadata?: { contentType?: string };
};

type R2Binding = {
  get(key: string): Promise<R2ObjectBody | null>;
};

type AssetsBinding = { fetch(request: Request): Promise<Response> };

type Context = {
  request: Request;
  params: { path?: string | string[] };
  env?: { HOT_UPDATE_R2?: R2Binding; ASSETS?: AssetsBinding };
};

/** Request sub-paths (under /hot-update/) served from R2. Everything else is static. */
const R2_BACKED: Record<string, string> = {
  "manifest.json": "application/json; charset=utf-8",
  "assets/model-metadata-catalog.json.gz": "application/gzip",
};

export async function onRequestGet(context: Context): Promise<Response> {
  const { request, env } = context;
  const raw = context.params.path;
  const sub = (Array.isArray(raw) ? raw.join("/") : (raw ?? "")).replace(/^\/+/, "");

  const contentType = R2_BACKED[sub];
  // Not an R2-backed key, or the binding is absent (a preview build): fall back
  // to the committed static file. Scripts and rare assets take this path always.
  if (!contentType || !env?.HOT_UPDATE_R2) {
    return env?.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const object = await env.HOT_UPDATE_R2.get(`hot-update/${sub}`);
  if (!object) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  /*
   * Revalidation, mirroring what Pages does for the static file this replaced:
   * `no-cache` (the client re-checks on its 12 h throttle) plus the R2 object's
   * ETag, so an unchanged file is a 304 and only a real change re-transfers.
   */
  const etag = object.httpEtag;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache" } });
  }

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType || contentType,
    "Cache-Control": "no-cache",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  });
  // HEAD gets the headers and no body; R2's size is the accurate Content-Length.
  if (request.method === "HEAD") {
    headers.set("Content-Length", String(object.size));
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
