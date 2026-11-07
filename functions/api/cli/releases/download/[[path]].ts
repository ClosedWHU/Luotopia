/** Authenticated download proxy for published CLI assets in the private repo. */
import { onRequestGet as download } from "../../../releases/download/[[path]]";
import { json } from "../../../../lib/github-releases";

export async function onRequestGet(context: {
  request: Request;
  env: { GITHUB_TOKEN?: string };
  params: { path?: string | string[] };
}): Promise<Response> {
  if (!context.env.GITHUB_TOKEN) return json({ error: "not_configured" }, 503, { "Cache-Control": "no-store" });
  const path = context.params.path;
  const name = Array.isArray(path) ? path[path.length - 1] : path?.split("/").pop();
  if (!name || !/^(?:luotopia(-cli)?-|SHA256SUMS-)(windows|linux|darwin)-[A-Za-z0-9._-]+$/.test(name)) {
    return json({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
  }
  return download({ ...context, env: { GITHUB_TOKEN: context.env.GITHUB_TOKEN, REPO: "ClosedWHU/Luotopia-CLI", GITHUB_ASSET_MIRROR: "" } });
}
