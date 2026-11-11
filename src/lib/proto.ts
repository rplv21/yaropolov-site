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
<link rel="preload" href="/proto-login/onest-cyrillic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face { font-family:Onest; font-weight:400; font-display:swap; src:url(/proto-login/onest-cyrillic-400-normal.woff2) format('woff2'); unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116; }
  @font-face { font-family:Onest; font-weight:700; font-display:swap; src:url(/proto-login/onest-cyrillic-700-normal.woff2) format('woff2'); unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116; }
  @font-face { font-family:'JetBrains Mono'; font-weight:500; font-display:swap; src:url(/proto-login/jetbrains-mono-latin-500-normal.woff2) format('woff2'); unicode-range:U+0000-00FF,U+2000-206F; }
  @font-face { font-family:'JetBrains Mono'; font-weight:500; font-display:swap; src:url(/proto-login/jetbrains-mono-cyrillic-500-normal.woff2) format('woff2'); unicode-range:U+0400-045F; }

  :root {
    --bg:#100e0b; --abyss:#0a0908; --text:#f2ede0; --muted:#a49d8a; --dim:#6b6555;
    --line:#2a2620; --line-strong:#4a4438; --grid:#4a4438; --red:#c8232f; --err:#e0715a;
    --sans:Onest,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:'JetBrains Mono',ui-monospace,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100dvh; background:var(--bg); color:var(--text); font:16px/1.5 var(--sans); overflow-x:hidden; }

  /* Фон: сетка 32px, как на сайте, и светлое пятно, которое ходит за курсором */
  .bg { position:fixed; inset:0; pointer-events:none; }
  .grid { background-size:32px 32px; background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px); }
  .grid-base { opacity:.12; -webkit-mask-image:radial-gradient(ellipse 80% 70% at 70% 50%,#000 30%,transparent 100%); mask-image:radial-gradient(ellipse 80% 70% at 70% 50%,#000 30%,transparent 100%); }
  .grid-spot { opacity:.55; --x:72%; --y:46%; -webkit-mask-image:radial-gradient(circle 220px at var(--x) var(--y),#000,transparent 100%); mask-image:radial-gradient(circle 220px at var(--x) var(--y),#000,transparent 100%); }

  /* Композиция справа: красный диск, вращающаяся тень, орбита, стрелка-циферблат */
  .comp { position:fixed; top:50%; right:max(-120px,calc(50vw - 660px)); width:min(64vmin,620px); aspect-ratio:1; transform:translateY(-50%); pointer-events:none; }
  .comp > * { position:absolute; }
  .disc { inset:18%; border-radius:50%; background:var(--red); animation:breathe 9s ease-in-out infinite; }
  .half { inset:17.6%; border-radius:50%; background:linear-gradient(90deg,transparent 50%,var(--bg) 50%); animation:spin 28s linear infinite; opacity:.9; }
  .ring { inset:4%; border-radius:50%; border:1px solid var(--line-strong); }
  .ring2 { inset:-8%; border-radius:50%; border:1px dashed var(--line); animation:spin 90s linear infinite reverse; }
  .ticks { inset:4%; border-radius:50%; background:repeating-conic-gradient(var(--line-strong) 0 .5deg,transparent .5deg 6deg); -webkit-mask:radial-gradient(circle,transparent 64%,#000 64.5%,#000 68%,transparent 68.5%); mask:radial-gradient(circle,transparent 64%,#000 64.5%,#000 68%,transparent 68.5%); }
  .orbit { inset:4%; animation:spin 16s linear infinite; }
  .orbit::before { content:''; position:absolute; top:-7px; left:50%; width:14px; height:14px; margin-left:-7px; background:var(--text); }
  .hand { left:50%; top:50%; width:46%; height:1px; background:var(--text); transform-origin:0 50%; animation:tick 60s steps(60) infinite; opacity:.85; }
  .hand::after { content:''; position:absolute; right:-4px; top:-4px; width:9px; height:9px; border-radius:50%; background:var(--text); }
  .square { right:-2%; bottom:6%; width:16%; aspect-ratio:1; border:1px solid var(--text); animation:drift 14s ease-in-out infinite alternate; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes tick { from { transform:rotate(-90deg); } to { transform:rotate(270deg); } }
  @keyframes breathe { 0%,100% { transform:scale(1); } 50% { transform:scale(.94); } }
  @keyframes drift { from { transform:translate(0,0) rotate(0deg); } to { transform:translate(-18%,-30%) rotate(45deg); } }

  /* Бегущая строка внизу */
  .ticker { position:fixed; left:0; right:0; bottom:0; height:44px; border-top:1px solid var(--line); background:var(--abyss); overflow:hidden; font:500 12px/44px var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--dim); white-space:nowrap; }
  .ticker span { display:inline-block; padding-left:100%; animation:run 40s linear infinite; animation-delay:-14s; }
  .ticker b { color:var(--red); font-weight:500; }
  @keyframes run { to { transform:translateX(-100%); } }

  /* Форма */
  main { position:relative; z-index:1; min-height:100dvh; display:flex; align-items:center; padding:32px clamp(24px,7vw,112px) 76px; }
  .card { width:100%; max-width:440px; padding:40px 36px 32px; background:rgba(16,14,11,.82); border:1px solid var(--line); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
  .eyebrow { display:flex; align-items:center; gap:10px; margin:0 0 28px; font:500 12px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
  .eyebrow i { width:8px; height:8px; background:var(--red); animation:blink 1.6s steps(2) infinite; }
  @keyframes blink { 50% { opacity:.2; } }
  h1 { margin:0 0 14px; font-size:clamp(40px,5.2vw,56px); line-height:.98; font-weight:700; letter-spacing:-.035em; }
  h1 span { display:block; }
  h1 em { font-style:normal; color:var(--red); }
  .lead { margin:0 0 32px; max-width:34ch; color:var(--muted); text-wrap:pretty; }
  label { display:block; margin-bottom:10px; font:500 12px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
  .field { display:flex; }
  input[type=password] { flex:1; min-width:0; height:56px; padding:0 16px; background:transparent; color:var(--text); border:1px solid var(--line-strong); border-right:0; border-radius:0; font:16px var(--sans); letter-spacing:.12em; transition:border-color .2s; }
  input[type=password]:focus { outline:none; border-color:var(--text); }
  input[aria-invalid=true] { border-color:var(--err); }
  button { flex:none; width:56px; height:56px; display:grid; place-items:center; background:var(--red); color:var(--text); border:0; border-radius:0; cursor:pointer; transition:background-color .2s; }
  button:hover { background:#dd2b38; }
  button:focus-visible { outline:2px solid var(--text); outline-offset:3px; }
  button svg { transition:transform .25s cubic-bezier(.22,1,.36,1); }
  button:hover svg { transform:translateX(3px); }
  .err { display:flex; gap:8px; align-items:baseline; margin:12px 0 0; color:var(--err); font-size:14px; }
  .err::before { content:'×'; font:500 14px var(--mono); }
  .foot { margin:28px 0 0; padding-top:20px; border-top:1px solid var(--line); font-size:14px; color:var(--dim); }
  .foot a { color:var(--muted); text-decoration:none; border-bottom:1px solid var(--line-strong); }
  .foot a:hover { color:var(--text); border-color:var(--text); }

  @media (max-width:820px) {
    .comp { right:-30vmin; top:24%; width:80vmin; opacity:.5; }
    main { align-items:flex-end; padding-inline:16px; }
    .card { padding:32px 24px 28px; }
  }
  @media (prefers-reduced-motion:reduce) {
    *,*::before,*::after { animation:none !important; transition:none !important; }
  }
</style>
</head>
<body>
<div class="bg grid grid-base" aria-hidden="true"></div>
<div class="bg grid grid-spot" id="spot" aria-hidden="true"></div>
<div class="comp" aria-hidden="true">
  <div class="ring2"></div>
  <div class="ring"></div>
  <div class="ticks"></div>
  <div class="disc"></div>
  <div class="half"></div>
  <div class="orbit"></div>
  <div class="hand"></div>
  <div class="square"></div>
</div>
<div class="ticker" aria-hidden="true"><span>Закрытый просмотр <b>●</b> прототип сайта <b>●</b> yaropolov.ru <b>●</b> сайты и реклама под заявки <b>●</b> Закрытый просмотр <b>●</b> прототип сайта <b>●</b> yaropolov.ru <b>●</b> сайты и реклама под заявки <b>●</b></span></div>

<main>
  <div class="card">
    <p class="eyebrow"><i></i>Прототип · yaropolov.ru</p>
    <h1><span>Закрытый</span><span>просмотр<em>.</em></span></h1>
    <p class="lead">Прототип открывается по паролю. Он&nbsp;в&nbsp;том же сообщении, что и&nbsp;ссылка.</p>
    <form method="post" autocomplete="off">
      <label for="pw">Пароль</label>
      <div class="field">
        <input id="pw" name="password" type="password" required autofocus autocomplete="current-password"${error ? ' aria-invalid="true" aria-describedby="err"' : ''}>
        <button type="submit" aria-label="Открыть"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg></button>
      </div>
      <input type="hidden" name="next" value="${esc(next)}">
      ${error ? `<p class="err" id="err" role="alert">${esc(error)}</p>` : ''}
    </form>
    <p class="foot">Нет пароля? Напишите мне — <a href="https://t.me/pavelyaropolov">@pavelyaropolov</a></p>
  </div>
</main>
<script>
  (function () {
    var s = document.getElementById('spot');
    if (!s || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var tx = innerWidth * .72, ty = innerHeight * .46, x = tx, y = ty, t0 = Date.now(), last = 0;
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; last = Date.now(); }, { passive: true });
    }
    (function loop() {
      if (Date.now() - last > 2500) {
        var k = (Date.now() - t0) / 1000;
        tx = innerWidth * (.7 + .14 * Math.cos(k * .35));
        ty = innerHeight * (.48 + .2 * Math.sin(k * .5));
      }
      x += (tx - x) * .08; y += (ty - y) * .08;
      s.style.setProperty('--x', x + 'px'); s.style.setProperty('--y', y + 'px');
      setTimeout(loop, 16);
    })();
  })();
</script>
</body>
</html>`;
}
