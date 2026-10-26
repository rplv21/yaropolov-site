// Задаёт пароль для закрытого прототипа: у каждого прототипа (proto-vault/<имя>.enc) свой пароль.
// Запуск: node scripts/proto-set-password.mjs <имя папки> "пароль"
// Пример: node scripts/proto-set-password.mjs TASirotina "пароль для Татьяны"
// Сам пароль нигде не сохраняется: в src/lib/protoCredentials.json пишутся только соль и хеш (с секретом сервера).
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Секрет сервера подмешивается в хеш (см. src/lib/proto.ts). Берётся из окружения или файла .env.
function readSecret() {
  if (process.env.PROTO_SECRET) return process.env.PROTO_SECRET;
  const f = new URL('../.env', import.meta.url);
  return existsSync(f) ? (readFileSync(f, 'utf8').match(/^PROTO_SECRET=(.+)$/m)?.[1].trim() ?? '') : '';
}
const secret = readSecret();
if (secret.length < 24) {
  console.error('Нет PROTO_SECRET (минимум 24 символа): добавьте его в .env или в окружение.');
  process.exit(1);
}

const [site, password] = process.argv.slice(2);
if (!site || !password || !/^[A-Za-z0-9_-]+$/.test(site)) {
  console.error('Использование: node scripts/proto-set-password.mjs <имя папки, латиница> "пароль"');
  process.exit(1);
}
if (!existsSync(new URL(`../proto-vault/${site}.enc`, import.meta.url))) {
  console.warn(`Внимание: файла proto-vault/${site}.enc пока нет, пароль всё равно сохранён.`);
}

const file = new URL('../src/lib/protoCredentials.json', import.meta.url);
const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const salt = randomBytes(16).toString('hex');
all[site] = { salt, hash: scryptSync(password, `${salt}:${secret}`, 32).toString('hex') };
writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
console.log(`Готово: пароль для «${site}» обновлён. Прежние доступы к нему отозваны.`);
