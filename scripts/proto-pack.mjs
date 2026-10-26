// Упаковывает собранный сайт в зашифрованный файл proto-vault/<Имя>.enc.
// Запуск: node scripts/proto-pack.mjs <Имя> <папка со сборкой, например ../sirotina-site/dist>
// Секрет берётся из PROTO_SECRET (окружение или файл .env). В репозиторий попадает только .enc.
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const [site, dir] = process.argv.slice(2);
if (!site || !dir || !/^[A-Za-z0-9_-]+$/.test(site)) {
  console.error('Использование: node scripts/proto-pack.mjs <Имя латиницей> <папка со сборкой>');
  process.exit(1);
}

function readEnv() {
  if (process.env.PROTO_SECRET) return process.env.PROTO_SECRET;
  const f = new URL('../.env', import.meta.url);
  if (!existsSync(f)) return '';
  return readFileSync(f, 'utf8').match(/^PROTO_SECRET=(.+)$/m)?.[1].trim() ?? '';
}
const secret = readEnv();
if (!secret) {
  console.error('Нет PROTO_SECRET: добавьте его в .env или в окружение.');
  process.exit(1);
}

const root = path.resolve(dir);
if (!existsSync(root)) {
  console.error(`Нет папки ${root}`);
  process.exit(1);
}

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

const index = {};
const parts = [];
let offset = 0;
for (const f of files) {
  const buf = readFileSync(f);
  index[path.relative(root, f).split(path.sep).join('/')] = [offset, buf.length];
  parts.push(buf);
  offset += buf.length;
}
const indexBuf = Buffer.from(JSON.stringify(index), 'utf8');
const head = Buffer.alloc(4);
head.writeUInt32BE(indexBuf.length);
const plain = gzipSync(Buffer.concat([head, indexBuf, ...parts]), { level: 9 });

const salt = randomBytes(16);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', scryptSync(secret, salt, 32), iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
const out = Buffer.concat([salt, iv, cipher.getAuthTag(), body]);

const outDir = new URL('../proto-vault/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL(`${site}.enc`, outDir), out);
console.log(`Готово: proto-vault/${site}.enc, ${files.length} файлов, ${(out.length / 1048576).toFixed(1)} МБ`);
