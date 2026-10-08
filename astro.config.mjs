// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://yaropolov.ru',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap({ filter: (page) => !page.includes('/brief') })],
  server: {
    host: true,
  },
});
