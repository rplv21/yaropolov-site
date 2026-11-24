// Хранилище заявок и брифов в S3 TimeWeb Cloud (дата-центр в РФ).
// 152-ФЗ, ст. 18 ч. 5: персданные граждан РФ сначала записываются в базу на территории РФ.
// Каждая заявка и бриф сохраняются отдельным JSON-файлом в приватном бакете,
// а уже потом уходят в Telegram.
//
// Переменные окружения (всё берётся в панели TimeWeb → S3-хранилище → бакет):
//   S3_ENDPOINT   — адрес API хранилища, например https://s3.twcstorage.ru
//   S3_BUCKET     — имя бакета (приватного)
//   S3_ACCESS_KEY — Access Key
//   S3_SECRET_KEY — Secret Key
//   S3_REGION     — регион, по умолчанию ru-1
// Пока они не заданы, сайт работает по-старому.
import { AwsClient } from 'aws4fetch';

const env = (k: string) => String(process.env[k] ?? (import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();

export function hasS3(): boolean {
  return !!(env('S3_ENDPOINT') && env('S3_BUCKET') && env('S3_ACCESS_KEY') && env('S3_SECRET_KEY'));
}

let client: AwsClient | null = null;
function s3() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: env('S3_ACCESS_KEY'),
      secretAccessKey: env('S3_SECRET_KEY'),
      region: env('S3_REGION') || 'ru-1',
      service: 's3',
    });
  }
  return client;
}

// Path-style адрес: <endpoint>/<bucket>/<key> — работает у любого S3-совместимого хранилища.
const url = (key: string) =>
  `${env('S3_ENDPOINT').replace(/\/$/, '')}/${encodeURIComponent(env('S3_BUCKET'))}/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Кладёт JSON в хранилище. Бросает ошибку, если хранилище не приняло запись. */
export async function s3Put(key: string, data: unknown): Promise<void> {
  const res = await s3().fetch(url(key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

/** Читает JSON из хранилища; null, если такого ключа нет или хранилище недоступно. */
export async function s3Get<T>(key: string): Promise<T | null> {
  try {
    const res = await s3().fetch(url(key), { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.error('S3 недоступно:', e);
    return null;
  }
}

/** Короткая причина сбоя для уведомления в Telegram. */
export function s3Error(err: unknown): string {
  return String((err as Error)?.message || err).slice(0, 160);
}
