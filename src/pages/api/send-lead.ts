import type { APIRoute } from 'astro';

export const prerender = false;

interface LeadPayload {
  name?: string;
  contact?: string;
  method?: string;
  extraPhone?: string;
  site?: string;
  niche?: string;
  comment?: string;
  consent?: string;
  hp?: string;
}

const METHOD_LABELS: Record<string, string> = {
  vk: 'ВКонтакте',
  max: 'Max',
  email: 'Электронная почта',
  telegram: 'Telegram',
  phone: 'Мобильный телефон',
};

function escapeForTelegram(value: string) {
  return value.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] as string));
}

export const POST: APIRoute = async ({ request }) => {
  let payload: LeadPayload;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  const name = (payload.name ?? '').trim();
  const contact = (payload.contact ?? '').trim();
  const method = (payload.method ?? '').trim();
  const extraPhone = (payload.extraPhone ?? '').trim();
  const site = (payload.site ?? '').trim();
  const niche = (payload.niche ?? '').trim();
  const comment = (payload.comment ?? '').trim();
  const consent = payload.consent === 'on' || payload.consent === 'true';
  const honeypot = (payload.hp ?? '').trim();

  // Ловушка для ботов: поле должно оставаться пустым
  if (honeypot) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (!name || !contact || !method || !METHOD_LABELS[method] || !consent) {
    return new Response(JSON.stringify({ error: 'validation_failed' }), { status: 400 });
  }

  if (name.length > 200 || contact.length > 200 || site.length > 300 || comment.length > 2000 || extraPhone.length > 40) {
    return new Response(JSON.stringify({ error: 'validation_failed' }), { status: 400 });
  }

  const botToken = import.meta.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы в переменных окружения');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const lines = [
    '<b>Новая заявка с yaropolov.ru</b>',
    `Имя: ${escapeForTelegram(name)}`,
    `Метод связи: ${escapeForTelegram(METHOD_LABELS[method])}`,
    `Контакт: ${escapeForTelegram(contact)}`,
  ];
  if (extraPhone) lines.push(`Телефон: ${escapeForTelegram(extraPhone)}`);
  if (site) lines.push(`Сайт: ${escapeForTelegram(site)}`);
  if (niche) lines.push(`Ниша: ${escapeForTelegram(niche)}`);
  if (comment) lines.push(`Комментарий: ${escapeForTelegram(comment)}`);

  const text = lines.join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!tgRes.ok) {
      const errBody = await tgRes.text();
      console.error('Telegram API error:', errBody);
      return new Response(JSON.stringify({ error: 'telegram_failed' }), { status: 502 });
    }
  } catch (err) {
    console.error('Telegram fetch failed:', err);
    return new Response(JSON.stringify({ error: 'telegram_failed' }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
