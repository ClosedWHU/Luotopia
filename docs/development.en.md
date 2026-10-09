# Homepage Development

[简体中文](./development.md)

This repository is the source of [www.whu.sb](https://www.whu.sb): a static Astro
site deployed on Cloudflare Pages, with a handful of Pages Functions under
`functions/`.

Deployment, environment variables and domain setup live in
[deployment.md](./deployment.md).

## Environment

Node >= 22.12 (see `engines` in `package.json`). The package manager is npm and
`package-lock.json` is committed.

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # output in dist/
npm run preview    # preview the build locally
```

### Background dev server

`astro dev` can run detached, which is the easier way to keep one around:

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

## Stack

| Part | Choice |
|------|--------|
| Framework | Astro 7, static output only (no SSR, no UI-framework islands) |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + hand-written design tokens |
| Fonts | Plus Jakarta Sans (Latin) + MiSans (CJK), both self-hosted |
| Backdrop | `@paper-design/shaders` + three.js aurora shader |
| Scrolling | Lenis (smooth scroll; instance exposed as `window.ltLenis`) |
| Icons | `@material-symbols/svg-400`, inlined as SVG at build time |
| Routing | Astro Client Router (`<ClientRouter fallback="swap" />`) |

All interaction is plain TypeScript mounted through `onPageSetup()` — there is no
React or Vue here. Read [Page conventions](#page-conventions) before adding any.

## Layout

```
src/
  components/     # Reusable Astro components (Navbar / Footer / PageHeader / …)
  config/         # Content as data: features / downloads / friendLinks / legal / deeplinkRoutes
  layouts/        # BaseLayout.astro — the site-wide shell
  pages/          # Routes. legal/ holds the [slug].astro dynamic route
  scripts/        # Client runtime: page-lifecycle, icon-svg, icon-source.server
  styles/         # global.css — the single source of design tokens
functions/        # Cloudflare Pages Functions
  api/            # /api/releases, /api/appstore, /api/status
  lib/            # Runtime-agnostic cores (importable from plain Node)
  _middleware.ts  # Host allowlist, deep-link rewrite, 404 representation
public/           # Static assets, .well-known, hot-update, scales
tools/            # Build scripts (hot-update manifest, scale manifest, AASA validation)
```

Prefer changing content in `src/config/` over editing pages: features, download
platforms, friend links and legal documents are all data-driven.

## The three things in astro.config.mjs

Beyond Tailwind the config carries three custom Vite plugins, each guarding a trap
that looks like dead weight to anyone who did not hit it:

**`misansWeights()`** — MiSans ships `@font-face` rules declaring the weights
Xiaomi used when cutting the family (Regular 330 / Medium 380 / Bold 630), not the
ones this site asks for. Left alone, both `font-weight: 400` and `500` resolve to
Medium 380 and the MD3 type scale loses the body/label distinction it is built on.
The plugin rewrites each face's descriptor to a standard weight at import time;
glyph data and unicode-range subsets are untouched.

**`flattenCssLayers()`** — Tailwind v4 emits everything into
`@layer properties/theme/base/utilities`, and cascade layers are Chromium 99+.
Older Android WebViews (out-of-support devices without Play services, which never
update) discard an entire `@layer` block they cannot parse, so every utility
vanishes and the page collapses to unstyled HTML. The plugin unwraps the layers in
`generateBundle`, preserving the emitted order — which *is* the layer precedence
order. Build-time only: `astro dev` still serves layered CSS, so old-kernel
behaviour has to be verified with `npm run build && npm run preview`.

**`statusDevApi()`** — `astro dev` does **not** run `functions/` (Pages Functions
are a Cloudflare runtime concern), so `/api/status` would 404 locally. This
middleware serves the same endpoint from the *same*
`functions/lib/uptimerobot.ts`, swapping `caches.default` for an in-memory Map.
Credentials are read the way wrangler reads them: `.dev.vars` → `.env.local` →
`.env` → the real environment. With no key it answers 503 `not_configured`, exactly
as production does.

The other `/api/*` routes (releases, appstore) have no local stand-in, so
`/download` falls back to its static labels — verifying those needs
`npm run build && npx wrangler pages dev dist`.

## Build target: Chrome 66

```js
target: ['chrome66', 'safari12', 'firefox68', 'edge88']
```

Vite's default `baseline-widely-available` (~Chrome 107) ships `?.` / `??`
verbatim, which is a *parse* error below Chrome 80 — the module dies before a
single line runs. 66 is the floor this code can actually serve:
`AbortController` (66, the core of page-lifecycle), dynamic `import()` (63, the
shader chunk) and `import.meta` (64) all exist, and esbuild lowers the rest.

Below that the page degrades to the no-JS path: readable static HTML (the flattened
CSS needs no JS) plus the reveal failsafe and `<noscript>` in `<head>`.

**Hard constraints when writing client code:**

- No `replaceAll` (85+), `Array.prototype.flat`/`flatMap` (69+),
  `Object.hasOwn` (93+), `AbortSignal.any` (116+), `AbortSignal.timeout` (103+),
  `structuredClone` (98+)
- No `inset` shorthand (87+) — write `top/right/bottom/left`
- `@property` (85+) and `color-mix()` (111+) are allowed but need an acceptable
  fallback
- Always pass `{ signal }` to listeners; `page-lifecycle.ts` patches the option in
  for kernels that ignore it

## Design system

`src/styles/global.css` is the single source of tokens, in two layers:

1. Raw `--lt-*` values in `:root` / `:root.dark` — always emitted, never
   tree-shaken, and the only place dark mode switches
2. `@theme` aliases that teach Tailwind to generate utilities
   (`text-title-medium`, `bg-surface`, `rounded-card`, `backdrop-blur-glass`)

Palette and type scale come from MD3 (seed `#005BAC`, the same seed as the app's
`AppDesignLanguage`), but the **surface model is not MD3's**: opaque tonal surfaces
are replaced by a translucency ladder — glass. The geometry is not invented for the
web either: radii come from the app's `AppDesignLayout.glass()` (control 14 /
nested 18 / card 28 / group 32), blur from `kAppGlassBlurSigma` (10) and
`appGlassStyle(blur:)` (8).

### Three glass rules that bite

Read the comments in `global.css` before restyling anything; these are the parts
that cause damage:

**backdrop-filter needs something behind it.** With no live content to sample, the
blur resolves to a flat translucent fill and reads as dirty plastic. That is why
`BaseLayout` paints a page-fixed aurora on every route rather than decorating the
hero alone.

**opacity < 1 turns an element into a backdrop root.** Its own `backdrop-filter`
then stops sampling the page and the glass visibly flattens. So:
- entrance animations on anything containing glass may only touch `transform`
  (`.lt-reveal-lift`)
- `.lt-reveal`, which fades, is for pure-text elements
- floating layers that do fade (tooltip, snackbar) use the opaque inverse surface,
  not glass

**Nested glass is pointless.** The parent panel already blurred the aurora; a child
blurring again samples the parent's own fill — no visual change, one extra
compositor layer per element. Rows inside a panel use `.lt-inset` /
`.lt-inset-raised` (both `FriendLinks` and `/status` follow this).

`/status` once had twelve cards each carrying their own `backdrop-filter`. On a
fast scroll the compositor could not keep re-sampling a fixed WebGL canvas and
painted each card's own translucent white fill instead — the white blocks visible
mid-fling. One glass panel per group with inset rows inside removed them.

### The other animation rule: fill-mode

Use `backwards` for entrance animations, never `both`. The end keyframe is the
element's natural state, so a forwards fill exists only to keep a composited layer
alive for the rest of the page's life — and every one of those is re-rastered on
each scroll frame.

## Page conventions

**Shell**: every page goes through `BaseLayout` (`title` required, `description`
optional, `bare` drops nav/footer, `noindex` adds the robots tag). Interior pages
open with `PageHeader`, which carries a weaker hero wash than the home page —
interior pages are documents, not landing pages.

**Client scripts must use `onPageSetup()`** (`src/scripts/page-lifecycle.ts`):

```ts
import { onPageSetup } from "../scripts/page-lifecycle";

onPageSetup((signal) => {
  // pass { signal } to every addEventListener
  // tear down timers / observers in the returned cleanup
  return () => clearInterval(timer);
});
```

Astro deduplicates bundled scripts by URL/content: visiting the same page a second
time does **not** re-execute the script, while the DOM it previously bound has been
replaced. `astro:page-load` is the only reliable per-navigation entry point, and the
`AbortSignal` unbinds everything before the next swap. Binding at module top level
leaks.

**Scroll reveals**: `.lt-reveal` / `.lt-reveal-lift` are claimed once per page load
by the IntersectionObserver in `BaseLayout`. **DOM inserted at runtime is never
observed**, so elements carrying those classes stay at `opacity: 0` forever. Give
async-rendered content its own entrance animation (transform only) — see `lt-st-rise`
on `/status`.

**Icons**: use `<Icon name="material_symbol_name" />` in Astro templates (inlined at
build time). When building HTML in a client script, follow `download.astro`:

```ts
import { normalizeIconSvg } from "../scripts/icon-svg";
import raw from "@material-symbols/svg-400/outlined/open_in_new.svg?raw";
const icon = normalizeIconSvg(raw, "text-base");
```

**Tailwind class scanning**: v4 scans source text, so utilities inside JS template
strings are detected too (`download.astro` and `status.astro` both rely on this).
Conversely, class-shaped strings in `scripts/`, `tools/`, `functions/` and `docs/`
are excluded with `@source not`, otherwise commented examples would compile into
utilities nothing uses.

**Escaping**: anything that interpolates API data into `innerHTML` goes through
`escapeHtml()`. Monitor names and release notes both come from outside.

## Hot-update manifest

The app's parser hot-update scripts live in `public/hot-update/scripts/`, with the
manifest at `public/hot-update/manifest.json`. The app **only accepts a manifest
carrying a valid Ed25519 signature** — a correct checksum with a bad signature is
still rejected.

Initialize a signing key once for local development:

```sh
npm run hot-update:init-key
```

The private key goes to the ignored `.env.hot-update`; only the public key is
installed into the adjacent App workspace. Then:

```sh
npm run hot-update:generate
npm run hot-update:verify
```

`npm run build` generates the manifest through `prebuild` and **fails** when the
signing key is unavailable. Production must provide
`HOT_UPDATE_ED25519_PRIVATE_KEY` as a secret (base64-encoded PKCS#8 private key).

`prebuild` also runs `check:aasa` (`tools/verify-aasa.mjs`), which validates the
`apple-app-site-association` file.

## Scale library manifest

The app's psychological scale data lives in `public/scales/data/`, with the manifest
at `public/scales/manifest.json`. Unlike hot-update, **this manifest is unsigned and
needs no key material at all** — scales are data rather than executable code, so
integrity comes from HTTPS plus a per-file sha256 that the client verifies after each
download. It therefore generates identically on a laptop, in a PR preview and in
production; there is no "preview cannot see the secret" problem here.

```sh
npm run scales:generate   # Re-scan data/ and rewrite manifest.json
npm run scales:check      # Verify the committed manifest is current, write nothing (CI)
```

The generator (`tools/generate-scale-manifest.mjs`) fails outright when a file is not
valid JSON, when a file's internal `id` does not match its filename, when `name` or
`abbreviation` is missing, when a file exceeds 4 MB, or when the resulting manifest
would be empty. `updatedAt` and both `version` fields only move when the content
actually changed, so repeated runs are idempotent — which is exactly what lets
`scales:check` catch "edited the data, forgot to regenerate the manifest".

Field meanings, the client's cache-and-verify flow, and **the copyright and licensing
of the scale data** (MMPI-2's upstream is GPLv3 and needs separate assessment) are in
[public/scales/README.md](../public/scales/README.md).

## Before committing

There is no test suite and no lint script. The minimum bar is that the build passes:

```sh
npm run build
```

`onBrokenLinks: 'throw'` belongs to the docs site; there is no equivalent here, so
after touching routes click through the navbar and footer by hand. Anything
affecting old WebViews (CSS layers, syntax lowering) must be verified with
`build && preview` — the dev server cannot show it.
