import type { APIRoute } from "astro";
import { DEFAULT_LOCALE, PREFIXED_LOCALES } from "../../../i18n/locales";
import { legalDocuments, getLegalBySlug, renderLegalMarkdown } from "../../../config/legal";

/**
 * Localized Markdown for native in-app viewing.
 *
 * Sibling of `src/pages/legal/[slug].md.ts`, which serves the authoritative
 * Simplified Chinese at the unprefixed URL the app already fetches. This one adds
 * `/<locale>/legal/<slug>.md` so a client that grows a locale parameter can cache
 * a translation instead — the app does not request these yet, and nothing about
 * the existing endpoint changes.
 *
 * `renderLegalMarkdown` adds the governing-language notice for every non-default
 * locale, so a translated document states on its face that the Chinese version
 * governs. The notice is exactly why the default-locale file cannot be reused:
 * adding it there would change a document the app caches and versions by
 * `lastUpdated`.
 */
export function getStaticPaths() {
  return PREFIXED_LOCALES.flatMap((locale) =>
    legalDocuments.map((doc) => ({ params: { lang: locale.path, slug: doc.slug } })),
  );
}

export const GET: APIRoute = async ({ params }) => {
  const entry = PREFIXED_LOCALES.find((locale) => locale.path === params.lang);
  const doc = getLegalBySlug(params.slug!, entry?.code ?? DEFAULT_LOCALE);
  if (!doc) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(renderLegalMarkdown(doc), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};