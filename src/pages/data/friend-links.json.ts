import type { APIRoute } from "astro";
import { friendLinkCatalog } from "../../config/friendLinks";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(friendLinkCatalog, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
