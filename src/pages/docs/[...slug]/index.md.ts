import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { pathOf, urlOfSlug } from "../../../config/docs/navigation";

export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection("docs");
  return entries.map((entry) => ({
    params: { slug: pathOf(entry).replace(/^docs\/?/, "") },
    props: { entry },
  }));
};

export const GET: APIRoute = ({ props, site }) => {
  const { entry } = props;
  const source = new URL(urlOfSlug(pathOf(entry)), site);
  return new Response(`# ${entry.data.title}\n\nSource: ${source}\n\n${entry.body ?? ""}\n`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
