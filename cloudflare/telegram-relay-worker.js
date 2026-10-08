// Cloudflare Worker: relays lead notifications and brief PDFs to Telegram.
//
// Why this exists: outbound connections from the TimeWeb container to
// api.telegram.org time out (backbone-level filtering in RU, outside
// TimeWeb's or our control). Cloudflare's network isn't affected, so
// this worker sits in between: the app POSTs here, the worker calls
// Telegram using its own bot token/chat id.
//
// Modes, chosen by the request Content-Type / body:
//   1. application/json  {"text": "..."}                      -> sendMessage
//   2. multipart/form-data  document (file) + caption         -> sendDocument
//   3. application/json  {"action":"brief_put", token, data}  -> store a brief in KV
//      application/json  {"action":"brief_get", token}        -> read it back
//      (used by /api/send-brief and the /brief/<token> page; briefs live in
//       the KV namespace bound as BRIEFS and expire after BRIEF_TTL_SECONDS)
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create Worker,
// paste this file, then set these as encrypted variables (Settings ->
// Variables) before deploying:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   RELAY_SECRET        (shared secret, also set as TELEGRAM_RELAY_SECRET
//                         in the TimeWeb app's env vars)
// and bind a KV namespace under the variable name BRIEFS
// (Settings -> Bindings -> Add -> KV namespace).
//
// After changing this file the worker must be re-deployed in Cloudflare,
// otherwise PDF delivery (mode 2) will not work.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const BRIEF_TTL_SECONDS = 90 * 24 * 60 * 60; // how long a brief link stays alive
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

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

    const contentType = request.headers.get('content-type') || '';

    // Mode 2: a file (brief PDF)
    if (contentType.includes('multipart/form-data')) {
      let form;
      try {
        form = await request.formData();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const file = form.get('document');
      if (!file || typeof file === 'string' || file.size === 0 || file.size > MAX_FILE_BYTES) {
        return new Response('Bad Request', { status: 400 });
      }
      const caption = String(form.get('caption') || '').slice(0, 1000);

      const out = new FormData();
      out.append('chat_id', env.TELEGRAM_CHAT_ID);
      out.append('document', file, file.name || 'brief.pdf');
      if (caption) {
        out.append('caption', caption);
        out.append('parse_mode', 'HTML');
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: out,
      });
      const body = await tgRes.text();
      return new Response(body, {
        status: tgRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Mode 1: text message (leads)
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Mode 3: brief storage
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
      return stored ? new Response(stored, { headers: { 'Content-Type': 'application/json' } }) : json({ error: 'not_found' }, 404);
    }

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
