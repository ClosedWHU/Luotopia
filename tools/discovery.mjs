import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { SITE_ORIGIN } from '../src/config/site.mjs';

function indexable(html) {
  const meta = html.match(/<meta\b[^>]*>/gi) ?? [];
  return !meta.some((tag) =>
    (/\bname=["']robots["']/i.test(tag) && /\bcontent=["'][^"']*\bnoindex\b/i.test(tag))
    || /\bhttp-equiv=["']refresh["']/i.test(tag));
}

function outputFile(root, pathname) {
  return path.join(root, decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
}

/** Run before mirror HTML is replaced: only the primary site's content is indexed. */
export function discoverySitemap() {
  let root;
  const integration = sitemap({
    filter: (url) => {
      const file = outputFile(root, new URL(url).pathname);
      return file.endsWith('.html') && existsSync(file) && indexable(readFileSync(file, 'utf8'));
    },
  });
  const buildSitemap = integration.hooks['astro:build:done'];
  integration.hooks['astro:build:done'] = async (context) => {
    root = fileURLToPath(context.dir);
    await buildSitemap(context);
    verifyDiscovery(root);
    context.logger.info('[discovery] sitemap, llms links and documentation Markdown verified');
  };
  return integration;
}

/** Validate generated public artifacts, not source-code shape or a saved URL snapshot. */
function verifyDiscovery(root) {
  const read = (pathname) => readFileSync(outputFile(root, pathname), 'utf8');
  const localPath = (href) => {
    const url = new URL(href);
    if (url.origin !== SITE_ORIGIN || url.search || url.hash) {
      throw new Error(`[discovery] expected a canonical URL: ${href}`);
    }
    if (!existsSync(outputFile(root, url.pathname))) {
      throw new Error(`[discovery] missing output for ${href}`);
    }
    return url.pathname;
  };
  const locations = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => localPath(match[1]));
  const sitemapFiles = locations(read('/sitemap-index.xml'));
  const pages = sitemapFiles.flatMap((file) => locations(read(file)));
  const indexed = new Set(pages);
  if (indexed.size === 0 || indexed.size !== pages.length) {
    throw new Error('[discovery] empty sitemap or duplicate page URLs');
  }
  const robots = read('/robots.txt');
  if (!robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap-index.xml`)) {
    throw new Error('[discovery] robots.txt does not advertise the sitemap');
  }
  const llms = read('/llms.txt');
  const linked = new Set([...llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((match) => localPath(match[1])));
  if (linked.size === 0) throw new Error('[discovery] llms.txt has no links');

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (entry.name.endsWith('.html')) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        const pathname = `/${relative.replace(/index\.html$/, '')}`;
        const html = readFileSync(file, 'utf8');
        // Astro's root 404 is a file; all normal pages use directory URLs.
        if (indexed.has(pathname) !== indexable(html)) {
          throw new Error(`[discovery] sitemap membership disagrees with page metadata: ${pathname}`);
        }
        if (pathname.startsWith('/docs/') && indexable(html) && pathname !== '/docs/') {
          const markdown = `${pathname}index.md`;
          if (!linked.has(markdown) || !html.includes(`href="${markdown}"`)) {
            throw new Error(`[discovery] documentation missing from llms.txt or alternate link: ${pathname}`);
          }
          if (!read(markdown).startsWith('# ')) {
            throw new Error(`[discovery] Markdown has no title: ${markdown}`);
          }
        }
      }
    }
  };
  walk(root);
}
