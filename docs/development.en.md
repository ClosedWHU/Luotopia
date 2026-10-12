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
    pages/        # Whole-page bodies (HomePage / FeaturesPage), shared by every locale's route
  config/         # Content as data: features / downloads / friendLinks / legal / deeplinkRoutes
  i18n/           # Localisation: locale table, published set, dictionaries, lookup, route table
  layouts/        # BaseLayout.astro — the site-wide shell
  pages/          # Routes. legal/ holds [slug].astro; [lang]/ holds one copy per locale
  scripts/        # Client runtime: page-lifecycle, icon-svg, icon-source.server
  styles/         # global.css — the single source of design tokens
functions/        # Cloudflare Pages Functions
  api/            # /api/releases, /api/appstore, /api/status
  lib/            # Runtime-agnostic cores (importable from plain Node)
  _middleware.ts  # Host allowlist, deep-link rewrite, language negotiation, 404 representation
public/           # Static assets, .well-known, hot-update, scales
tools/            # Build scripts (hot-update manifest, scale manifest, AASA + i18n validation)
```

Prefer changing content in `src/config/` over editing pages: features, download
platforms, friend links and legal documents are all data-driven.

## The four things in astro.config.mjs

Beyond Tailwind and the `i18n` block the config carries four custom Vite plugins,
each guarding a trap that looks like dead weight to anyone who did not hit it:

**`misansWeights()`** — MiSans ships `@font-face` rules declaring the weights
Xiaomi used when cutting the family (Regular 330 / Medium 380 / Bold 630), not the
ones this site asks for. Left alone, both `font-weight: 400` and `500` resolve to
Medium 380 and the MD3 type scale loses the body/label distinction it is built on.
The plugin rewrites each face's descriptor to a standard weight at import time;
glyph data and unicode-range subsets are untouched.

**`pruneFontSubsets()`** — MiSans is cut into 56 `unicode-range` subsets *per
weight*, by character cluster; 172 `@font-face` rules made up 81% of a 293 KB
shared stylesheet, while the site's twelve pages use 1038 distinct codepoints
between them. The plugin collects the charset by scanning the **source text** under
`src/` and drops every subset covering none of it, so the woff2 files behind those
rules are never emitted either.

It runs in `transform`, not `generateBundle`, because Vite hashes the CSS *after*
transform: pruning later would ship post-prune bytes under a pre-prune, `immutable`,
year-long-cached filename. Build-time only — dev serves the full family, since a
stale charset that silently falls back to a system face until the server restarts is
a miserable thing to debug.

**The scan reads text, comments included.** That interacts badly with i18n; see
[Multiple languages](#multiple-languages-i18n).

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

**A rounded container that scrolls has to be two elements.** `border-radius` rounds
the container's own background, not its scrollbar: the bar is painted square across
the full height of the border box, so with the thumb at either end of its travel it
sits *outside* the rounded silhouette instead of being cut by it. Rounding the thumb
does not help — the track still spans corner to corner.

Only a **clipping ancestor** removes it, because inside one the bar is ordinary
descendant painting subject to the ancestor's rounded clip region. So the shape is
fixed: radius + `overflow: hidden` on the outer, `.lt-scroll-y` + `overflow-y: auto`
on the inner. `.lt-dialog-card`/`.lt-dialog-body`, `.lt-lang-panel`/`.lt-lang-scroll`
and `.lt-mobile-menu`/`.lt-mobile-menu-scroll` are all built that way; copy it.

`clip-path: inset(0 round Npx)` on the scroller itself, or a `margin` on
`::-webkit-scrollbar-track`, would both save the extra element — and both rest on a
guess about whether one engine clips its own scrollbar. The wrapper is what the
cascade *guarantees*, and the bar here is that an out-of-support Android WebView has
to survive it too.

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

## Multiple languages (i18n)

The site is **purely static**: no adapter, no SSR. `Astro.preferredLocale` is
therefore always `undefined`, and Astro's own i18n middleware runs once at build
time. The division of labour is fixed by that:

| Layer | File | Job |
|-------|------|-----|
| Config | `i18n` in `astro.config.mjs` | Declares the locales and the URL shape (`prefixDefaultLocale: false`, so the default stays at `/`) |
| Locale table | `src/i18n/locales.ts` | code → URL segment / endonym / hreflang / og:locale, plus the `Accept-Language` folding rules |
| Published set | `src/i18n/published.json` | The locales actually built. The config, the locale table and the check script all read this one file |
| Dictionaries | `src/i18n/<code>.json` | Flat dotted keys; the default locale's file defines the key set |
| Lookup | `src/i18n/ui.ts` | `useTranslations()`, `routeUrl()`, `hreflangAlternates()` |
| Route table | `src/i18n/routes.ts` | `ROUTES` and `TRANSLATED_ROUTES`: which locale has which page |
| Routes | `src/pages/[lang]/*.astro` | One per published locale; the body is shared via `src/components/pages/*.astro` |
| Legal documents | `src/config/legal.ts` | Holds only the **shape** (slug, `lastUpdated`, whether each section has prose, how many subsections); the words are positional keys in the dictionaries |
| First-visit detection, 404 language | `functions/_middleware.ts` | `Accept-Language` → 302, plus substituting a localized 404 document. See [deployment](./deployment.en.md#language-negotiation) |

Page components do **not** take a `locale` prop. They read `Astro.currentLocale`,
which Astro fills from the route (`/en/features` → `en`, `/features` → the
default). The route files are then pure shells, and the two cannot disagree.

All ten locales currently translate all twelve routes, so `TRANSLATED_ROUTES` is
`ALL_ROUTES` for every one of them. The table stays a table: "this locale is only
partly translated" is a state the site can be in again at any time, and link
generation, `hreflang` and the middleware's redirect guard all read it.

### Adding a locale

1. Write `src/i18n/<code>.json`. The key set must match the default locale
   *exactly*, placeholders included — `npm run i18n:check` fails on both missing
   and surplus keys
2. Add a row to `LOCALES` in `src/i18n/locales.ts`
3. Add the code to `src/i18n/published.json`
4. Record which pages you translated in `TRANSLATED_ROUTES` in `src/i18n/routes.ts`

No page files change: `src/pages/[lang]/*.astro` is driven by `PREFIXED_LOCALES`
and grows a copy on its own. Translating only part of the site is fine — leave the
rest unclaimed and it stays with the default locale.

### What a partly-translated locale does

`TRANSLATED_ROUTES` is the single source of truth. For a page a locale does not
claim:

- Navbar and footer links come from `routeUrl()`, which points **straight at the
  default-locale URL** — no redirect hop
- The switcher's target comes from `pathInLocale()`, which stays on the current
  page. The cookie still records the choice, so every page that *does* have a
  translation is in that language from then on
- `hreflang` does not claim the locale has that page. Claiming an alternate that
  404s is worse than claiming none: crawlers validate the cluster and drop the
  whole set when one member does not reciprocate
- The middleware will **not** auto-detect a visitor onto that path in that locale.
  Doing so 404s, the 404 fallback sends them back, and detection fires again — an
  infinite loop

A 404 on a prefixed path is probed once against the unprefixed equivalent: a hit
302s there, a miss serves that locale's own 404 document.

Do **not** reach for Astro's `i18n.fallback` here. It does not understand routes
built by `src/pages/[lang]/*`: it treats `/en` as an ordinary page needing an
English version, emits a redirect stub at `/en/en`, and the stub it emits for
`/en/features` *outranks the real route* — the actual translated page is dropped
from the build with nothing but a warning. Its stubs are also 2-second meta-refresh
documents canonicalising to the apex domain, which is a two-hop chain.

### Why the 404 page is a route and not an artefact

There can only be one `dist/404.html` — **that file is the Pages configuration** (see
the deployment doc). So the nine translations are ordinary routes,
`src/pages/[lang]/404.astro`, built to `/<locale>/404/` and substituted in by the
middleware at status 404. That is why `ROUTES` has a `notFound: "/404"` entry: both
`/404` and `/<locale>/404/` are directly reachable, which is consistent with the site
having always allowed `curl /404`.

It is `noindex`, so `BaseLayout` emits no `hreflang` cluster for it — same for
`/open`. Claiming alternates for a page nobody may index is pointless, and an
asymmetric cluster is worse than no cluster.

### The app contract: these must not move

`app/lib/core/config/app_config.dart` builds these URLs straight from
`siteBaseUrl`, with **no locale prefix**, so they must keep being served at the
default locale, on the original path, byte for byte:

| URL | What the app does with it |
|-----|---------------------------|
| `/data/legal.json` | Legal catalog (version + per-document `lastUpdated`); the client uses it to decide whether its cache is stale |
| `/data/friend-links.json` | Friend-link catalog, including the `groupUin` / `androidKey` / `iosAuthSig` the native QQ-group handoff needs |
| `/legal/<slug>.md` | Markdown source, rendered **natively** rather than in a WebView |
| `/legal/<slug>/` | The WebView fallback for the same document |

Both `config/legal.ts` and `config/friendLinks.ts` were restructured **additively**:
the default-locale output is unchanged byte for byte, and translations live at new
paths like `/<locale>/legal/<slug>.md`. `renderLegalMarkdown()` emits one extra line
— the "the Simplified Chinese governs" notice — and only for non-default locales.
That is precisely why the default output has to stay identical: it is a document the
app caches and validates against `lastUpdated`.

After touching either file, compare digests:

```sh
npx astro build
certutil -hashfile dist\data\legal.json SHA256
certutil -hashfile dist\data\friend-links.json SHA256
certutil -hashfile dist\legal\terms.md SHA256
```

`tools/check-i18n.mjs` walks `legalDocuments`, derives every positional key, and
asserts the default dictionary has all of them and that no `legal.*` key points at a
section that no longer exists. Derived keys are the one place in this i18n setup the
type system cannot reach: add a section and forget the ten dictionaries, and
production renders `legal.privacy.s12.heading`.

### Two things that bite

**The font pruning counts comments, and ten languages mostly defeat it.**
`pruneFontSubsets()` scans the source *text* under `src/`, data and comments alike.
Covering all ten locales means the charset has to include traditional-only hanzi,
kana, hangul, Cyrillic and Vietnamese Latin Extended Additional. Measured on the
built stylesheet with every page translated: MiSans subsets kept go 50 → 110 of
112, its `@font-face` text goes 71 KB → 160 KB raw (25 → 57 KB gzip, 8.1 → 18.6 KB
brotli), and the whole shared file goes 133 KB → 222 KB raw, 38 → 70 KB gzip,
19.0 → 29.3 KB brotli. Font subsets are 72% of the shared CSS by raw bytes and
essentially all of the growth. The pruning plugin is left with almost nothing to
drop, which is the honest consequence of a charset that really does span simplified
and traditional hanzi, kana, hangul, Cyrillic and Vietnamese — not waste to be
optimised away. The number that transfers is the brotli delta, **+10.3 KB** on a
render-blocking file; the +89 KB raw mostly costs parse time, and it is almost
entirely `unicode-range` hex lists, which is why it compresses about 6:1.

Three things worth knowing before trying:

- The subsets are **lazy**. `unicode-range` means a browser only downloads the woff2
  behind a rule when a rendered character falls in it, so a Spanish visitor never
  fetches the hangul faces. What grew is the CSS, not the font traffic
- MiSans is only reached for CJK and Cyrillic: `--font-sans` puts Plus Jakarta Sans
  ahead of it, so Latin copy never touches MiSans. If the CSS size ever needs to
  come back down, that is the lever — load MiSans only on the locales whose content
  needs it. It has not been done because it would make the switcher's own endonyms
  render in a different face on different pages
- Comments in the i18n modules are English, and where they would otherwise quote
  Chinese source text they paraphrase instead. A comment quoting all ten endonyms
  measured +6 surviving subsets and +6,893 raw bytes on its own

Endonyms cannot be dropped: the switcher has to be readable by someone who cannot
read the page they landed on, so each language is listed in its own script and never
translated.

**`transition:persist` conflicts with locales in four places.** Persisted elements
are not part of the swap, so:

- `Navbar.astro` keys its persist name by locale (`lt-navbar-${locale}`): same-locale
  navigations still get the cheap persist, cross-locale ones render fresh, and the
  old language's labels cannot survive onto the new language's page. `<html lang>`
  needs no help — Astro syncs root-element attributes from the new document, and
  `BaseLayout`'s `preserveRootState` only carries the two client-only states (theme,
  kiosk).
- But a changed persist name means the element is *replaced*, and every module-scope
  reference in the navbar script then points at a detached node — Astro dedupes
  scripts by content, so the module does not re-execute. The observable result is
  that after one language switch the theme toggle, the burger and the language panel
  all silently stop working. `Navbar.astro`'s script therefore has to use
  `onPageSetup()` (see [Page conventions](#page-conventions)) and re-query on every
  navigation; the same goes for `onBeforeNavigation()`, which binds once and so may
  only ever query live.
- And the flip side of that cheap same-locale persist: everything the server
  rendered *inside* the bar stays frozen on whichever page first put it on screen.
  The nav links and the logo are locale-absolute, so they age fine, but the
  switcher's hrefs come from `pathInLocale(Astro.url.pathname, …)` and describe the
  page they were built for. Walking `/en/features/` → `/en/download/` and then
  picking 日本語 used to land on `/ja/features/`; worse, a visit that *starts* at `/`
  pins every later switch in that locale to `/<lang>/`, which is exactly the
  "switching language always sends me home" report. `Navbar.astro` copies the
  incoming document's hrefs onto the persisted bar in `astro:before-swap`. Copying
  rather than recomputing keeps `pathInLocale`'s fallback for a route the target
  locale has not translated on the server, instead of duplicating
  `TRANSLATED_ROUTES` — and the locale table's endonyms — into the navbar chunk.
- The nav links' `aria-current` is page-dependent the same way, and is copied in
  the same handler. It used to be recomputed by a *second* implementation of the
  server's matching rule, and the two disagreed: the client tested `base === "/"`
  to mean "this is Home, match it exactly", which holds only in the default
  locale. Elsewhere Home's base is `/en`, `/ja`, … — a prefix of every page in
  that language — so Home stayed lit for the whole visit. The server rule now
  compares against `routeUrl(locale, "home")` instead of a literal `/`, and the
  client no longer has one. Two copies of a rule is not a redundancy, it is a
  deadline.

**The switcher links straight at its destination** — no `?lang=`, no redirect — and
is therefore structurally identical to every other link on the site. It used to carry
`?lang=` and rely on the middleware's 302 to set the cookie and land on the clean
URL, with `data-astro-reload` forcing a full navigation. **That attribute does not
exist in Astro 7** (it appears nowhere in the package), so every click went through
Client Router's fetch-and-swap with a 302 in the middle. Linking directly removes
the redirect from the click path; the route survives because the href *is* the route.
The preference cookie is written by a capture-phase delegated listener before the
navigation starts. The middleware still honours `?lang=` — that is for the app's deep
links and for callers without JS.

`data-astro-prefetch={false}` **does** work (Astro's `elMatchesStrategy` returns
false for the literal string `"false"`) and must stay: with `prefetchAll: true` a
hover would otherwise prefetch a whole document per language.

### Checks

```sh
npm run i18n:check        # sources: dictionaries, locale table, config and route table agree
npm run i18n:check:dist   # post-build: TRANSLATED_ROUTES and dist/ match in both directions
```

`i18n:check` is wired into `prebuild`. The `--dist` half needs build output, so it
is a separate command — run it after changing what a locale claims.
## Before committing

There is no test suite and no lint script. The minimum bar is that the build passes:

```sh
npm run build
```

`onBrokenLinks: 'throw'` belongs to the docs site; there is no equivalent here, so
after touching routes click through the navbar and footer by hand. Anything
affecting old WebViews (CSS layers, syntax lowering) must be verified with
`build && preview` — the dev server cannot show it.

The same goes for `functions/`, which `astro dev` does not run. Language
negotiation, the 404 representation and the deep-link rewrite are only visible
under `npm run build && npx wrangler pages dev dist`; when the local workerd binary
is older than today's date it refuses to start with `requires compatibility date`,
and the fix is `--compatibility-date <the newest date it names>`.
