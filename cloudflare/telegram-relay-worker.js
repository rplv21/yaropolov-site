// Cloudflare Worker: relays lead notifications to Telegram and stores data in KV.
//
// Why this exists: outbound connections from the TimeWeb container to
// api.telegram.org time out (backbone-level filtering in RU, outside
// TimeWeb's or our control). Cloudflare's network isn't affected, so
// this worker sits in between: the app POSTs here, the worker calls
// Telegram using its own bot token/chat id.
//
// Requests are JSON, chosen by the body:
//   {"text": "..."}                       -> Telegram sendMessage
//   {"action":"brief_put", token, data}   -> store a brief in KV (90 days)
//   {"action":"brief_get", token}         -> read it back
//   {"action":"view_inc", slug}           -> +1 article view
//   {"action":"views_get"}                -> all article view counts
//   {"action":"status_get"}               -> Direct status: value of KV key "status:direct" (up/down)
//
// Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RELAY_SECRET
// KV binding: BRIEFS (briefs and view counters share the namespace)
//
// After changing this file the worker must be re-deployed in Cloudflare.

const BRIEF_TTL_SECONDS = 90 * 24 * 60 * 60; // how long a brief link stays alive
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const VIEWS_PREFIX = 'views:';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const secret = request.headers.get('x-relay-secret');
    if (!secret || secret !== env.RELAY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Direct status indicator: edit the KV key "status:direct" (value up or down) in the dashboard
    if (payload.action === 'status_get') {
      if (!env.BRIEFS) return json({ error: 'kv_not_bound' }, 500);
      const value = ((await env.BRIEFS.get('status:direct')) || '').trim().toLowerCase();
      return json({ state: value === 'up' || value === 'down' ? value : null });
    }

    // Article views
    if (payload.action === 'view_inc' || payload.action === 'views_get') {
      if (!env.BRIEFS) return json({ error: 'kv_not_bound' }, 500);
      if (payload.action === 'view_inc') {
        if (typeof payload.slug !== 'string' || !SLUG_RE.test(payload.slug)) return json({ error: 'bad_slug' }, 400);
        const key = VIEWS_PREFIX + payload.slug;
        const current = parseInt((await env.BRIEFS.get(key)) || '0', 10) || 0;
        await env.BRIEFS.put(key, String(current + 1));
        return json({ ok: true });
      }
      const listed = await env.BRIEFS.list({ prefix: VIEWS_PREFIX, limit: 200 });
      const out = {};
      await Promise.all(
        listed.keys.map(async (k) => {
          out[k.name.slice(VIEWS_PREFIX.length)] = parseInt((await env.BRIEFS.get(k.name)) || '0', 10) || 0;
        })
      );
      return json(out);
    }

    // Brief storage
    if (payload.action === 'brief_put' || payload.action === 'brief_get') {
      if (!env.BRIEFS) return json({ error: 'kv_not_bound' }, 500);
      if (typeof payload.token !== 'string' || !TOKEN_RE.test(payload.token)) {
        return json({ error: 'bad_token' }, 400);
      }
      if (payload.action === 'brief_put') {
        const data = JSON.stringify(payload.data ?? null);
        if (!payload.data || data.length > 200000) return json({ error: 'bad_data' }, 400);
        await env.BRIEFS.put(payload.token, data, { expirationTtl: BRIEF_TTL_SECONDS });
        return json({ ok: true });
      }
      const stored = await env.BRIEFS.get(payload.token);
      return stored
        ? new Response(stored, { headers: { 'Content-Type': 'application/json' } })
        : json({ error: 'not_found' }, 404);
    }

    // Text message (leads, brief notifications)
    const text = typeof payload.text === 'string' ? payload.text : '';
    if (!text || text.length > 4000) {
      return new Response('Bad Request', { status: 400 });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });

    const body = await tgRes.text();
    return new Response(body, {
      status: tgRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
