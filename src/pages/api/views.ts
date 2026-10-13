import type { APIRoute } from 'astro';
import { articles } from '../../data/articles';
import { getViews, incView } from '../../lib/viewsStore';

export const prerender = false;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const slugs = new Set(articles.map((a) => a.slug));

// Роботов не считаем
const BOT = /bot|crawl|spider|slurp|preview|monitor|metrika|headless|lighthouse|curl|wget|python|node-fetch/i;

// Не больше 30 просмотров в минуту с одного адреса
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export const GET: APIRoute = async () => {
  const views = await getViews();
  // Отдаём только счётчики существующих статей
  const out: Record<string, number> = {};
  for (const s of slugs) out[s] = Number(views[s]) || 0;
  return json(out, 200, { 'Cache-Control': 'public, max-age=60' });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let slug = '';
  try {
    slug = String(((await request.json()) as { slug?: string }).slug ?? '');
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!slugs.has(slug)) return json({ error: 'unknown_slug' }, 400);

  if (BOT.test(request.headers.get('user-agent') || '')) return json({ ok: true });

  let ip = 'unknown';
  try {
    ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  } catch {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  }
  if (limited(ip)) return json({ ok: true });

  try {
    await incView(slug);
  } catch (err) {
    console.error('Не удалось записать просмотр:', err);
  }
  return json({ ok: true });
};
