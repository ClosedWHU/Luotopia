# Luotopia

Luojia: a comprehensive campus services app for Wuhan University.

[简体中文](README.md)

> This repository contains the Astro source for the project homepage, hosted at
> [ClosedWHU/Luotopia](https://github.com/ClosedWHU/Luotopia).
> APK releases and pre-releases are published through
> [GitHub Releases](https://github.com/ClosedWHU/Luotopia/releases).

## Overview

Luotopia is a comprehensive campus services app for Wuhan University students
and staff, with timetable, campus information, and daily-life services.

- Homepage: [https://www.whu.sb](https://www.whu.sb)

## Local Development

```bash
npm install
npm run dev        # Start the development server at localhost:4321
npm run build      # Build to dist/
npm run preview    # Preview the build locally
```

## Hot-update Scripts

Parser hot-update scripts are stored in `public/hot-update/scripts/`. The app
only accepts the signed `public/hot-update/manifest.json`; manifests without a
valid Ed25519 signature are rejected even if their checksums match.

Initialize a local signing key once:

```sh
npm run hot-update:init-key
```

This writes the private key to the ignored `.env.hot-update` file and installs
only the public key in the adjacent App workspace. Never commit
`.env.hot-update`.

Generate and verify the manifest:

```sh
npm run hot-update:generate
npm run hot-update:verify
```

`npm run build` generates the manifest automatically and fails when the signing
key is unavailable. Production must provide `HOT_UPDATE_ED25519_PRIVATE_KEY` as
a secret containing the base64-encoded PKCS#8 Ed25519 private key generated
above.

## Deployment

### Cloudflare Pages

1. Create a Pages project in the Cloudflare Dashboard and connect this GitHub repository.
2. Set the build configuration:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Optionally set `PUBLIC_SITE_URL` to your custom domain.
4. Bind the custom domain in the Pages settings after deployment.

### Cloudflare Workers (with `@astrojs/cloudflare`)

For SSR or Workers deployment mode:

```bash
npx astro add cloudflare
```

Configure `output: 'server'` and the `cloudflare()` adapter in
`astro.config.mjs`, then run:

```bash
npm run build
```

Deploy `dist/` or `dist/_worker.js` to Cloudflare Workers.

### Vercel

1. Import this GitHub repository into Vercel.
2. Astro is detected automatically; no additional configuration is required.
3. Keep **Astro** as the Framework Preset.
4. Bind your custom domain in the Vercel project settings after deployment.

### Manual Static Deployment

```bash
npm run build
# Deploy dist/ to any static hosting service, such as Nginx, GitHub Pages, or Netlify.
```

## Star History

<a href="https://star-history.tsinbei.com/#ClosedWHU/Luotopia&type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&legend=top-left" />
  </picture>
</a>

## License

[MIT](LICENSE)
