import { defineMiddleware } from 'astro:middleware';
import { typo } from './lib/typo';

// Типографика для всего сайта: после рендера любой HTML-страницы ставим
// неразрывные пробелы после предлогов и союзов (правило: «и», «в», «на»
// и другие короткие слова не остаются в конце строки).
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(typo(html), { status: response.status, statusText: response.statusText, headers });
});
