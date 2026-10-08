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

/** Сохраняет бриф и возвращает его уникальный токен (128 бит случайности). */
export async function saveBrief(answers: BriefAnswers): Promise<string> {
  const token = randomBytes(16).toString('base64url');
  const data: StoredBrief = { createdAt: new Date().toISOString(), answers };
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), `${token}.json`), JSON.stringify(data), { flag: 'wx' });
  return token;
}

export async function loadBrief(token: string): Promise<StoredBrief | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    return JSON.parse(await readFile(path.join(dir(), `${token}.json`), 'utf8')) as StoredBrief;
  } catch {
    return null;
  }
}
