## Luotopia development skills

Before implementation, actually read [development skill](../skills/skills/luotopia-development/SKILL.md), [architecture](../skills/skills/luotopia-development/references/architecture.md), and [check entry points](../skills/skills/luotopia-development/references/checks.md). Before test changes, read [testing skill](../skills/skills/luotopia-testing/SKILL.md).

The single source is [ClosedWHU/Luotopia-Skills](https://github.com/ClosedWHU/Luotopia-Skills). For standalone checkouts, clone it into adjacent `skills/` or fetch and read the referenced files.

## Project documentation

Read these before changing anything non-trivial — they hold the constraints that are
not obvious from the code:

- `docs/development.md` — stack, the custom Vite plugins, the Chrome 66 syntax
  floor, the design-token system and the glass/backdrop-root rules, page conventions
  (`onPageSetup`, why `.lt-reveal` cannot be used on runtime-inserted DOM)
- `docs/deployment.md` — Cloudflare Pages setup, the full environment-variable list,
  why there is no `wrangler.jsonc`, the 404 mechanism, the deep-link host, `/status`
- `docs/docs-site.md` — the documentation site merged from ClosedWHU/Luotopia-Docs:
  first-class pages at `/docs` rendered by the site's own shell (no docs
  framework), the content collection + generated sidebar/redirect modules,
  the current search decision, and the docs.whu.sb cutover

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

`astro dev` does not run `functions/`. `/api/status` is served locally by the
`statusDevApi` middleware in `astro.config.mjs` (credentials from `.dev.vars`); the
other `/api/*` routes need `npm run build && npx wrangler pages dev dist`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
