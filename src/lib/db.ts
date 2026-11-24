// База заявок и брифов на российском хостинге (TimeWeb Postgres).
// 152-ФЗ, ст. 18 ч. 5: персданные граждан РФ сначала записываются в базу на территории РФ.
// Поэтому заявки и брифы хранятся здесь, а в Telegram уходит только уведомление
// со ссылкой, без имени и контактов.
//
// Подключение — переменная окружения DATABASE_URL (строка подключения из панели TimeWeb).
// Пока её нет, сайт работает по-старому (KV/Telegram), чтобы заявки не терялись.
import postgres from 'postgres';

/** Сколько хранить заявки и брифы — так же написано в политике (п. 5). */
export const RETENTION_DAYS = 365;

let sql: postgres.Sql | null = null;
let ready: Promise<void> | null = null;

export function dbUrl(): string {
  return String(process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL ?? '').trim();
}

export function hasDb(): boolean {
  return dbUrl().length > 0;
}

/** Подключение и таблицы создаются при первом обращении. */
export async function db(): Promise<postgres.Sql> {
  if (!sql) {
    sql = postgres(dbUrl(), {
      max: 3,
      onnotice: () => {},
      ssl: process.env.DATABASE_SSL === 'off' ? false : ('prefer' as never),
    });
    ready = (async () => {
      await sql!`create table if not exists leads (
        token text primary key,
        created_at timestamptz not null default now(),
        data jsonb not null
      )`;
      await sql!`create table if not exists briefs (
        token text primary key,
        created_at timestamptz not null default now(),
        data jsonb not null
      )`;
    })();
  }
  await ready;
  return sql;
}

/** Удаляет записи старше срока хранения. Вызывается при каждой новой записи. */
export async function purgeOld(s: postgres.Sql) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  await s`delete from leads where created_at < ${cutoff}`;
  await s`delete from briefs where created_at < ${cutoff}`;
}
