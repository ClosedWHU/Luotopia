// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
  site: 'https://whu.sb',
});
