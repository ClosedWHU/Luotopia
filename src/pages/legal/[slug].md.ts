import type { APIRoute } from "astro";
import { legalDocuments, getLegalBySlug, renderLegalMarkdown } from "../../config/legal";

export function getStaticPaths() {
  return legalDocuments.map((doc) => ({ params: { slug: doc.slug } }));
}

export const GET: APIRoute = async ({ params }) => {
  const doc = getLegalBySlug(params.slug!);
  if (!doc) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(renderLegalMarkdown(doc), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
