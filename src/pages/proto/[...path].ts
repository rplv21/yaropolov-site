import type { APIRoute } from 'astro';
import path from 'node:path';
import { checkPassword, configured, hasAccess, issueCookie, loginPage, noteFail, siteOf, tooManyTries } from '../../lib/proto';
import { loadVault, readFromVault } from '../../lib/protoVault';

export const prerender = false;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const BASE_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' };

const page = (html: string, status: number) =>
  new Response(html, { status, headers: { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });

const clientIp = (req: Request) =>
  req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

// Куда вернуть после входа: только внутри /proto/
const safeNext = (n: unknown, site: string, fallback: string) =>
  typeof n === 'string' && site && n.startsWith(`/proto/${site}/`) && !n.startsWith('//') ? n : fallback;

// Форма входа принимается только с того же сайта. Сравниваем хост без протокола: за прокси сервер видит http://, браузер шлёт https://.
function sameSite(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const host = new URL(origin).host;
      const mine = [url.host, request.headers.get('host'), request.headers.get('x-forwarded-host')?.split(',')[0].trim()];
      return mine.includes(host);
    } catch {
      return false;
    }
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export const POST: APIRoute = async ({ request, url }) => {
  if (!configured()) return page('<!doctype html><meta charset="utf-8"><title>Раздел недоступен</title><p>Раздел временно недоступен.</p>', 503);
  if (!sameSite(request, url)) return new Response('Запрос отклонён', { status: 403, headers: BASE_HEADERS });
  const ip = clientIp(request);
  const form = await request.formData().catch(() => null);
  const site = siteOf(url.pathname);
  const next = safeNext(form?.get('next'), site, url.pathname);
  if (tooManyTries(ip)) return page(loginPage(next, 'Слишком много попыток. Подождите несколько минут.'), 429);
  const pw = String(form?.get('password') ?? '');
  if (!site || !checkPassword(site, pw)) {
    noteFail(ip);
    return page(loginPage(next, 'Пароль не подошёл. Проверьте раскладку и попробуйте ещё раз.'), 401);
  }
  const secure = url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: next, 'Set-Cookie': issueCookie(site, secure) } });
};

export const GET: APIRoute = async ({ request, url }) => {
  if (!configured()) return page('<!doctype html><meta charset="utf-8"><title>Раздел недоступен</title><p>Раздел временно недоступен.</p>', 503);
  // Без пароля именно этого прототипа любая его ссылка (и любая несуществующая) показывает только форму входа
  const site = siteOf(url.pathname);
  if (!hasAccess(site, request.headers.get('cookie'))) {
    const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
    if (!wantsHtml) return new Response('Нужен пароль', { status: 401, headers: BASE_HEADERS });
    return page(loginPage(url.pathname, ''), 401);
  }

  const vault = await loadVault(site);
  if (!vault) return new Response('Не найдено', { status: 404, headers: BASE_HEADERS });

  // путь внутри прототипа: /proto/<Имя>/en/about/ -> en/about/index.html
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname.replace(/^\/proto\/[^/]+\/?/, ''));
  } catch {
    return new Response('Не найдено', { status: 404, headers: BASE_HEADERS });
  }
  if (rel.split('/').includes('..')) return new Response('Не найдено', { status: 404, headers: BASE_HEADERS });
  let name = rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
  let body = readFromVault(vault, name);
  if (!body && !name.endsWith('/') && vault.files.has(`${name}/index.html`)) {
    return new Response(null, { status: 301, headers: { ...BASE_HEADERS, Location: url.pathname + '/' + url.search } });
  }
  if (!body) return new Response('Не найдено', { status: 404, headers: BASE_HEADERS });

  const ext = path.extname(name).toLowerCase();
  const hashed = name.startsWith('_astro/');
  const cache = ext === '.html' ? 'private, no-store' : hashed ? 'private, max-age=31536000, immutable' : 'private, max-age=86400';
  return new Response(body, {
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache },
  });
};
