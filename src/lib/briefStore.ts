// Хранилище брифов: каждый бриф лежит отдельным JSON-файлом под случайным
// токеном, по которому открывается страница /brief/<токен>. Серверный код.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BriefItem, BriefSection } from '../data/brief';

export interface BriefAnswers {
  values: Record<string, string | string[]>;
  extras: Record<string, string>;
}

export interface StoredBrief {
  createdAt: string; // ISO
  answers: BriefAnswers;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

const dir = () => process.env.BRIEF_DIR || path.join(process.cwd(), 'data', 'briefs');

/** Ответ на вопрос: список выбранного + уточнение. */
export function answerParts(item: BriefItem, a: BriefAnswers) {
  const raw = a.values[item.id];
  const extra = (a.extras[item.id] || '').trim();
  const list = Array.isArray(raw) ? raw.filter(Boolean) : raw ? [String(raw).trim()].filter(Boolean) : [];
  return { list, extra };
}

export function countAnswered(sections: BriefSection[], a: BriefAnswers) {
  let answered = 0;
  let total = 0;
  for (const s of sections) {
    for (const it of s.items) {
      total++;
      const { list, extra } = answerParts(it, a);
      if (list.length || extra) answered++;
    }
  }
  return { answered, total };
}

// Основное хранилище: Cloudflare KV через тот же воркер, что шлёт сообщения в Telegram.
// Файлы на диске остаются запасным вариантом: для локальной разработки и на случай,
// если воркер ещё не обновлён или KV недоступен.
function relay() {
  const url = process.env.TELEGRAM_RELAY_URL ?? import.meta.env.TELEGRAM_RELAY_URL;
  const secret = process.env.TELEGRAM_RELAY_SECRET ?? import.meta.env.TELEGRAM_RELAY_SECRET;
  return url && secret ? { url: String(url), secret: String(secret) } : null;
}

async function relayCall(body: Record<string, unknown>) {
  const r = relay();
  if (!r) return null;
  try {
    return await fetch(r.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-relay-secret': r.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('Хранилище брифов (relay) недоступно:', err);
    return null;
  }
}

async function saveToFile(token: string, data: StoredBrief) {
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${token}.json`), JSON.stringify(data), { flag: 'wx' });
}

/** Сохраняет бриф и возвращает его уникальный токен (128 бит случайности). */
export async function saveBrief(answers: BriefAnswers): Promise<string> {
  const token = randomBytes(16).toString('base64url');
  const data: StoredBrief = { createdAt: new Date().toISOString(), answers };

  const res = await relayCall({ action: 'brief_put', token, data });
  if (res?.ok) return token;
  if (res) console.error('KV не принял бриф, пишу в файл:', res.status, await res.text().catch(() => ''));

  await saveToFile(token, data);
  return token;
}

export async function loadBrief(token: string): Promise<StoredBrief | null> {
  if (!TOKEN_RE.test(token)) return null;

  const res = await relayCall({ action: 'brief_get', token });
  if (res?.ok) {
    try {
      return (await res.json()) as StoredBrief;
    } catch {
      /* пойдём в файл */
    }
  }

  try {
    return JSON.parse(await readFile(path.join(dir(), `${token}.json`), 'utf8')) as StoredBrief;
  } catch {
    return null;
  }
}
