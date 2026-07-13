import type { APIRoute } from "astro";
import { friendLinkCatalog } from "../../data/friend-links";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(friendLinkCatalog, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
