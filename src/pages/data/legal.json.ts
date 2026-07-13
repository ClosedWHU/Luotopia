import type { APIRoute } from "astro";
import { getLegalCatalog } from "../../config/legal";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(getLegalCatalog(), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
