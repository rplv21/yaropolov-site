// Зашифрованное хранилище прототипов. В репозитории лежат только файлы proto-vault/<Имя>.enc:
// AES-256-GCM, ключ получается из секрета PROTO_SECRET, который есть только в окружении сервера.
// Расшифрованный сайт живёт в памяти процесса и на диск не пишется.
import { createDecipheriv, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Только из окружения сервера (переменная на TimeWeb), никогда не из .env и не из сборки.
export const secret = (): string => process.env['PROTO_SECRET'] ?? '';

const VAULT_DIR = path.resolve(process.cwd(), 'proto-vault');

type Vault = { files: Map<string, [number, number]>; data: Buffer };
const cache = new Map<string, Vault | null>();

// Формат файла: соль (16) | iv (12) | тег (16) | шифртекст. Внутри gzip: [4 байта длины индекса][индекс JSON][данные].
export async function loadVault(site: string): Promise<Vault | null> {
  if (cache.has(site)) return cache.get(site)!;
  let vault: Vault | null = null;
  try {
    const key = secret();
    if (!key) throw new Error('нет секрета');
    const raw = await readFile(path.join(VAULT_DIR, `${site}.enc`));
    const salt = raw.subarray(0, 16);
    const iv = raw.subarray(16, 28);
    const tag = raw.subarray(28, 44);
    const body = raw.subarray(44);
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(key, salt, 32), iv);
    decipher.setAuthTag(tag);
    const plain = gunzipSync(Buffer.concat([decipher.update(body), decipher.final()]));
    const len = plain.readUInt32BE(0);
    const index = JSON.parse(plain.subarray(4, 4 + len).toString('utf8')) as Record<string, [number, number]>;
    vault = { files: new Map(Object.entries(index)), data: plain.subarray(4 + len) };
  } catch {
    vault = null;
  }
  cache.set(site, vault);
  return vault;
}

export function readFromVault(v: Vault, name: string): Buffer | null {
  const hit = v.files.get(name);
  return hit ? v.data.subarray(hit[0], hit[0] + hit[1]) : null;
}
