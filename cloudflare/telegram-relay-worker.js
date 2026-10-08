// Cloudflare Worker: relays lead notifications and brief PDFs to Telegram.
//
// Why this exists: outbound connections from the TimeWeb container to
// api.telegram.org time out (backbone-level filtering in RU, outside
// TimeWeb's or our control). Cloudflare's network isn't affected, so
// this worker sits in between: the app POSTs here, the worker calls
// Telegram using its own bot token/chat id.
//
// Two modes, chosen by the request Content-Type:
//   1. application/json           {"text": "..."}              -> sendMessage
//   2. multipart/form-data        document (file) + caption    -> sendDocument
//      (used by /api/send-brief to deliver the brief as a PDF)
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create Worker,
// paste this file, then set these as encrypted variables (Settings ->
// Variables) before deploying:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   RELAY_SECRET        (shared secret, also set as TELEGRAM_RELAY_SECRET
//                         in the TimeWeb app's env vars)
//
// After changing this file the worker must be re-deployed in Cloudflare,
// otherwise PDF delivery (mode 2) will not work.

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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
