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
  // За прокси Astro считает свой адрес http:// и режет форму входа в /proto/ (Origin приходит с https://).
  // Проверка источника для этой формы сделана вручную в src/pages/proto/[...path].ts (сравнение по хосту).
  // Остальные POST сайта шлют JSON и этой проверкой не охватывались.
  security: { checkOrigin: false },
  server: {
    host: true,
  },
});
