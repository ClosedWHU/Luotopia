/** Serve the homepage screenshot gallery from the shared R2 bucket. */

type R2ObjectBody = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  httpMetadata?: { contentType?: string };
};

type R2Binding = { get(key: string): Promise<R2ObjectBody | null> };

type Context = {
  request: Request;
  params: { path?: string | string[] };
  env?: { HOT_UPDATE_R2?: R2Binding };
};

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const VALID_PATH = /^(?:en|es|fr|ja|ko|pt|ru|vi|zh-Hans|zh-Hant)\/(?:auto|light|dark)\/(?:phone|tablet|desktop)\/(?:ai|campus|bus|weather|schedule|home|list|theme)\.webp$/;

export async function onRequestGet(context: Context): Promise<Response> {
  const raw = context.params.path;
  const path = (Array.isArray(raw) ? raw.join("/") : (raw ?? "")).replace(/^\/+/, "");
  if (!VALID_PATH.test(path) || !context.env?.HOT_UPDATE_R2) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const object = await context.env.HOT_UPDATE_R2.get(`screenshots/${path}`);
  if (!object) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const etag = object.httpEtag;
  if (context.request.headers.get("If-None-Match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType || "image/webp",
    "Cache-Control": CACHE_CONTROL,
    ETag: etag,
    "Content-Length": String(object.size),
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  });
  if (context.request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

export const onRequestHead = onRequestGet;
