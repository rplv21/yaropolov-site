import type { APIRoute } from 'astro';
import { relayCall } from '../../lib/briefStore';
import { directStatus } from '../../data/status';

export const prerender = false;

// Статус Яндекс.Директа для индикатора в шапке.
// Источник: ключ status:direct в Cloudflare KV (значение up или down), его можно
// менять прямо в панели Cloudflare без деплоя. Если ключа нет или воркер не
// отвечает, берём значение из src/data/status.ts.
export const GET: APIRoute = async () => {
  let state: 'up' | 'down' = directStatus.state;
  const res = await relayCall({ action: 'status_get' });
  if (res?.ok) {
    try {
      const data = (await res.json()) as { state?: string | null };
      if (data.state === 'up' || data.state === 'down') state = data.state;
    } catch {
      /* оставляем значение по умолчанию */
    }
  }
  return new Response(JSON.stringify({ state }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  });
};
