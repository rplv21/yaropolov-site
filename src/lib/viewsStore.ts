// Счётчик просмотров статей. Основное хранилище: Cloudflare KV через воркер
// (переживает деплои). Если воркер не обновлён или недоступен, считаем в файле
// на диске: годится для разработки и как запасной вариант.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { relayCall } from './briefStore';

const file = () => path.join(process.env.BRIEF_DIR || path.join(process.cwd(), 'data'), 'views.json');

async function readFileCounts(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function incView(slug: string) {
  const res = await relayCall({ action: 'view_inc', slug });
  if (res?.ok) return;
  const counts = await readFileCounts();
  counts[slug] = (counts[slug] || 0) + 1;
  await mkdir(path.dirname(file()), { recursive: true });
  await writeFile(file(), JSON.stringify(counts));
}

export async function getViews(): Promise<Record<string, number>> {
  const res = await relayCall({ action: 'views_get' });
  if (res?.ok) {
    try {
      const data = (await res.json()) as Record<string, number>;
      if (data && typeof data === 'object') return data;
    } catch {
      /* пойдём в файл */
    }
  }
  return readFileCounts();
}
