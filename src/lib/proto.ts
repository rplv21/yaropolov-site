// Закрытые прототипы для клиентов: /proto/<имя>/ отдаёт статический сайт из папки proto-sites/<имя>/
// только тому, кто ввёл пароль именно этого прототипа. У каждого прототипа свой пароль.
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import credentials from './protoCredentials.json';
import { secret } from './protoVault';

type Cred = { salt: string; hash: string };
const CREDS = credentials as Record<string, Cred>;

const MAX_AGE = 60 * 60 * 24 * 30; // 30 дней
const NAME = /^[A-Za-z0-9_-]+$/;

/** Имя прототипа из адреса: /proto/TASirotina/en/ -> TASirotina */
export function siteOf(pathname: string): string {
  const first = pathname.replace(/^\/proto\/?/, '').split('/')[0];
  return NAME.test(first) ? first : '';
}

const cookieName = (site: string) => `proto_${site}`;

// Для неизвестного имени считаем хеш всё равно: время ответа не выдаёт, какие прототипы существуют.
const DUMMY: Cred = { salt: '00000000000000000000000000000000', hash: '0'.repeat(64) };

// Секрет сервера подмешивается в хеш: без него публичный хеш из репозитория подобрать нельзя.
export const configured = () => secret().length >= 24;
export const hashPassword = (password: string, salt: string) => scryptSync(password, `${salt}:${secret()}`, 32);

export function checkPassword(site: string, input: string): boolean {
  if (!configured()) return false;
  const cred = CREDS[site];
  const c = cred ?? DUMMY;
  const got = hashPassword(input.slice(0, 200), c.salt);
  const want = Buffer.from(c.hash, 'hex');
  const ok = got.length === want.length && timingSafeEqual(got, want);
  return !!cred && !!input && ok;
}

// Ключ подписи зависит от имени и хеша пароля: смена пароля сразу отзывает выданные доступы.
const sign = (site: string, v: string) => createHmac('sha256', `proto:${site}:${CREDS[site]?.hash ?? ''}:${secret()}`).update(v).digest('hex');

export function issueCookie(site: string, secure: boolean): string {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${cookieName(site)}=${exp}.${sign(site, exp)}; Path=/proto/${site}; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function hasAccess(site: string, cookieHeader: string | null): boolean {
  if (!configured() || !site || !CREDS[site]) return false;
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${cookieName(site)}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(site, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Защита от перебора: не больше 8 неудачных попыток за 10 минут с одного адреса.
const tries = new Map<string, { n: number; reset: number }>();
export function tooManyTries(ip: string): boolean {
  const t = tries.get(ip);
  return !!t && t.reset >= Date.now() && t.n >= 8;
}
export function noteFail(ip: string) {
  const now = Date.now();
  const t = tries.get(ip);
  if (!t || t.reset < now) tries.set(ip, { n: 1, reset: now + 10 * 60 * 1000 });
  else t.n += 1;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function loginPage(next: string, error: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Закрытый просмотр</title>
<style>
  :root { --bg:#100E0B; --cream:#F9F3DC; --red:#C8232F; --line:rgba(249,243,220,.35); }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; padding:24px; background:var(--bg); color:var(--cream); font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
  main { width:100%; max-width:420px; }
  h1 { margin:0 0 8px; font-size:32px; line-height:1.1; font-weight:700; letter-spacing:-.02em; }
  p { margin:0 0 32px; color:rgba(249,243,220,.8); }
  label { display:block; margin-bottom:8px; font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; }
  input { width:100%; padding:14px 16px; background:transparent; color:var(--cream); border:2px solid var(--line); border-radius:0; font:inherit; }
  input:focus-visible { outline:3px solid var(--cream); outline-offset:2px; border-color:var(--cream); }
  button { margin-top:16px; width:100%; padding:14px 16px; background:var(--red); color:var(--cream); border:0; border-radius:0; font:inherit; font-weight:600; cursor:pointer; }
  button:hover { filter:brightness(1.12); }
  button:focus-visible { outline:3px solid var(--cream); outline-offset:2px; }
  .err { margin:12px 0 0; color:#ff9a9a; font-size:14px; }
</style>
</head>
<body>
<main>
  <h1>Закрытый просмотр</h1>
  <p>Эта страница доступна только по паролю.</p>
  <form method="post" autocomplete="off">
    <label for="pw">Пароль</label>
    <input id="pw" name="password" type="password" required autofocus autocomplete="current-password"${error ? ' aria-invalid="true" aria-describedby="err"' : ''}>
    <input type="hidden" name="next" value="${esc(next)}">
    ${error ? `<p class="err" id="err" role="alert">${esc(error)}</p>` : ''}
    <button type="submit">Открыть</button>
  </form>
</main>
</body>
</html>`;
}
