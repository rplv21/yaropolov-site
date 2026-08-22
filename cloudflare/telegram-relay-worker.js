// Cloudflare Worker: relays lead notifications to Telegram.
//
// Why this exists: outbound connections from the TimeWeb container to
// api.telegram.org time out (backbone-level filtering in RU, outside
// TimeWeb's or our control). Cloudflare's network isn't affected, so
// this worker sits in between: the app POSTs the message text here,
// the worker calls Telegram using its own bot token/chat id.
//
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create Worker,
// paste this file, then set these as encrypted variables (Settings ->
// Variables) before deploying:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   RELAY_SECRET        (shared secret, also set as TELEGRAM_RELAY_SECRET
//                         in the TimeWeb app's env vars)

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
