import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * The documentation collection (merged from ClosedWHU/Luotopia-Docs; see
 * docs/docs-site.md). Rendered by src/pages/docs/[...slug].astro through the
 * marketing site's own shell — there is no docs framework underneath.
 *
 * `slug` carries the full site path (`docs/server/api/error-codes`) on every
 * entry: Astro's relative-markdown-link resolution and the route params both
 * read it, so the two can never disagree about where a page lives.
 */
const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    slug: z.string().optional(),
    sidebar: z
      .object({
        order: z.number().optional(),
        label: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = { docs };
