import type { APIRoute } from 'astro';
import { briefSections, briefItemById, BRIEF_KEYS, BRIEF_LIMITS } from '../../data/brief';
import { buildBriefPdf, countAnswered, type BriefAnswers } from '../../lib/briefPdf';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Простой лимит от злоупотреблений: не больше 4 брифов в час с одного адреса.
// Хранится в памяти процесса: для одного инстанса приложения этого достаточно.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 4) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const esc = (v: string) => v.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

// Убираем управляющие символы (кроме переводов строки и табуляции)
const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const slug = (v: string) =>
  v
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const raw = await request.text();
  if (raw.length > BRIEF_LIMITS.total) return json({ error: 'too_large' }, 413);

  let body: {
    values?: Record<string, unknown>;
    extras?: Record<string, unknown>;
    consent?: string;
    hp?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // Ловушка для ботов: поле должно оставаться пустым
  if (clean(body.hp)) return json({ ok: true });

  if (body.consent !== 'true' && body.consent !== 'on') return json({ error: 'consent_required' }, 400);

  let ip = 'unknown';
  try {
    ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  } catch {
    ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  }
  if (limited(ip)) return json({ error: 'rate_limited' }, 429);

  // Разбор ответов: принимаем только известные вопросы и допустимые варианты
  const answers: BriefAnswers = { values: {}, extras: {} };
  for (const [id, v] of Object.entries(body.values ?? {})) {
    const item = briefItemById.get(id);
    if (!item) continue;
    if (item.type === 'checks') {
      const list = (Array.isArray(v) ? v : []).map(clean).filter((x) => x && item.options?.includes(x));
      if (list.length) answers.values[id] = list;
    } else {
      const text = clean(v).slice(0, BRIEF_LIMITS.field);
      if (!text) continue;
      if (item.type === 'radio' && !item.options?.includes(text)) continue;
      answers.values[id] = text;
    }
  }
  for (const [id, v] of Object.entries(body.extras ?? {})) {
    const item = briefItemById.get(id);
    if (!item || (item.type !== 'radio' && item.type !== 'checks')) continue;
    const text = clean(v).slice(0, BRIEF_LIMITS.extra);
    if (text) answers.extras[id] = text;
  }

  // Обязательные поля: компания, имя, телефон
  const company = String(answers.values[BRIEF_KEYS.company] ?? '');
  const name = String(answers.values[BRIEF_KEYS.name] ?? '');
  const phone = String(answers.values[BRIEF_KEYS.phone] ?? '');
  if (!company || !name || phone.replace(/\D/g, '').length < 10) {
    return json({ error: 'validation_failed' }, 400);
  }

  const relayUrl = process.env.TELEGRAM_RELAY_URL ?? import.meta.env.TELEGRAM_RELAY_URL;
  const relaySecret = process.env.TELEGRAM_RELAY_SECRET ?? import.meta.env.TELEGRAM_RELAY_SECRET;
  if (!relayUrl || !relaySecret) {
    console.error('TELEGRAM_RELAY_URL / TELEGRAM_RELAY_SECRET не заданы в переменных окружения');
    return json({ error: 'server_misconfigured' }, 500);
  }

  const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });
  const { answered, total } = countAnswered(briefSections, answers);

  let pdf: Buffer;
  try {
    pdf = await buildBriefPdf(briefSections, answers, { date, keys: BRIEF_KEYS });
  } catch (err) {
    console.error('Не удалось собрать PDF брифа:', err);
    return json({ error: 'pdf_failed' }, 500);
  }

  const email = String(answers.values[BRIEF_KEYS.email] ?? '');
  const caption = [
    '<b>Новый бриф с yaropolov.ru</b>',
    `Компания: ${esc(company)}`,
    `Контакт: ${esc(name)}`,
    `Телефон: ${esc(phone)}`,
    email ? `Почта: ${esc(email)}` : '',
    `Заполнено: ${answered} из ${total}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1000);

  const day = new Date().toISOString().slice(0, 10);
  const filename = `brief-${slug(company) || 'client'}-${day}.pdf`;

  const form = new FormData();
  form.append('document', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  form.append('caption', caption);

  try {
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'x-relay-secret': relaySecret },
      body: form,
    });
    if (!res.ok) {
      console.error('Telegram relay (brief) error:', await res.text());
      return json({ error: 'telegram_failed' }, 502);
    }
  } catch (err) {
    console.error('Telegram relay (brief) fetch failed:', err);
    return json({ error: 'telegram_failed' }, 502);
  }

  return json({ ok: true });
};
