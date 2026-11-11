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

// Страница входа у каждого прототипа своя: обращение к клиенту и рисунок про его дело.
// Прототипы без своей записи получают нейтральную страницу.
type LoginLook = { eyebrow: string; title: [string, string]; lead: string; art: string; artCss: string };

const HOUSE_ART = `<div class="art" aria-hidden="true">
  <svg viewBox="0 0 640 440" fill="none">
    <g class="sheet">
      <text x="24" y="34" class="t">ФАСАД 1–4</text>
      <text x="24" y="52" class="t dim">М 1:100 · ЛИСТ 01</text>
      <path pathLength="1" class="ln" style="--d:.1s" d="M120 72h400"/>
      <path pathLength="1" class="ln" style="--d:.15s" d="M120 64v16M520 64v16M116 76l8-8M516 76l8-8"/>
      <text x="320" y="62" class="t c">14 400</text>
      <path pathLength="1" class="ln" style="--d:.2s" d="M572 360V120"/>
      <path pathLength="1" class="ln" style="--d:.25s" d="M564 360h16M564 120h16"/>
      <text x="584" y="352" class="t">±0.000</text>
      <text x="584" y="116" class="t">+7.200</text>
    </g>
    <path pathLength="1" class="ln strong" style="--d:.3s" d="M16 360h540"/>
    <path pathLength="1" class="ln hatch" style="--d:.4s" d="M28 372l12-12M52 372l12-12M76 372l12-12M100 372l12-12M124 372l12-12M148 372l12-12M172 372l12-12M196 372l12-12M220 372l12-12M244 372l12-12M268 372l12-12M292 372l12-12M316 372l12-12M340 372l12-12M364 372l12-12M388 372l12-12M412 372l12-12M436 372l12-12M460 372l12-12M484 372l12-12M508 372l12-12M532 372l12-12"/>
    <path pathLength="1" class="ln strong" style="--d:.5s" d="M120 360V210L300 120l120 60v180"/>
    <path pathLength="1" class="ln strong" style="--d:.8s" d="M420 250h100v110"/>
    <path pathLength="1" class="ln" style="--d:1s" d="M120 210l180-90 120 60"/>
    <path pathLength="1" class="ln" style="--d:1.05s" d="M136 214l164-82 108 54" opacity=".5"/>
    <rect pathLength="1" class="win" style="--d:1.2s;--w:0s" x="150" y="236" width="44" height="104"/>
    <rect pathLength="1" class="win" style="--d:1.3s;--w:1.4s" x="222" y="196" width="72" height="92"/>
    <path pathLength="1" class="win" style="--d:1.4s;--w:2.8s" d="M300 150l40 20v38h-40z"/>
    <rect pathLength="1" class="win" style="--d:1.5s;--w:4.2s" x="350" y="226" width="46" height="62"/>
    <rect pathLength="1" class="win red" style="--d:1.6s;--w:.7s" x="440" y="276" width="62" height="84"/>
    <path pathLength="1" class="ln" style="--d:1.7s" d="M222 242h72M258 196v92M471 276v84"/>
    <path pathLength="1" class="ln" style="--d:1.8s" d="M70 360v-56"/>
    <circle pathLength="1" class="ln" style="--d:1.85s" cx="70" cy="268" r="42"/>
    <circle pathLength="1" class="ln" style="--d:1.95s" cx="58" cy="258" r="20" opacity=".45"/>
    <path pathLength="1" class="ln" style="--d:2s" d="M330 360v-40h40v40" opacity=".7"/>
    <g class="sheet">
      <path pathLength="1" class="ln" style="--d:2.1s" d="M412 396h212v32H412zM500 396v32"/>
      <text x="424" y="417" class="t">Т. СИРОТИНА</text>
      <text x="512" y="417" class="t dim">ПОРТФОЛИО</text>
    </g>
  </svg>
</div>`;

const HOUSE_CSS = `
  .art { position:fixed; top:50%; right:max(16px,calc(50vw - 640px)); width:min(54vw,720px); transform:translateY(-52%); pointer-events:none; }
  .art svg { display:block; width:100%; height:auto; overflow:visible; }
  .ln { stroke:var(--muted); stroke-width:1; stroke-linecap:square; stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1.4s cubic-bezier(.65,0,.35,1) var(--d,0s) forwards; }
  .ln.strong { stroke:var(--text); stroke-width:1.6; }
  .ln.hatch { stroke:var(--line-strong); }
  .win { fill:var(--text); fill-opacity:0; stroke:var(--text); stroke-width:1; stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1s ease var(--d,0s) forwards, glow 7s ease-in-out calc(var(--d,0s) + 1.6s + var(--w,0s)) infinite; }
  .win.red { stroke:var(--red); fill:var(--red); }
  .t { font:500 10px var(--mono); letter-spacing:.12em; fill:var(--muted); opacity:0; animation:fade .6s ease 2.2s forwards; }
  .t.dim { fill:var(--dim); }
  .t.c { text-anchor:middle; }
  @keyframes draw { to { stroke-dashoffset:0; } }
  @keyframes glow { 0%,100% { fill-opacity:0; } 35%,70% { fill-opacity:.85; } }
  @keyframes fade { to { opacity:1; } }
  @media (max-width:820px) { .art { top:16px; right:50%; width:min(100vw - 24px,520px); transform:translateX(50%); } }
  @media (prefers-reduced-motion:reduce) { .ln,.win { stroke-dashoffset:0; } .t { opacity:1; } }`;

const LOOKS: Record<string, LoginLook> = {
  TASirotina: {
    eyebrow: 'Для Татьяны Сиротиной',
    title: ['Татьяна,', 'здравствуйте'],
    lead: 'Здесь прототип вашего сайта‑портфолио: проекты, чертежи и&nbsp;галерея, на&nbsp;русском и&nbsp;английском. Пароль в&nbsp;моём сообщении.',
    art: HOUSE_ART,
    artCss: HOUSE_CSS,
  },
};

const DEFAULT_LOOK: LoginLook = {
  eyebrow: 'Прототип · yaropolov.ru',
  title: ['Закрытый', 'просмотр'],
  lead: 'Прототип открывается по паролю. Он&nbsp;в&nbsp;том же сообщении, что и&nbsp;ссылка.',
  art: '',
  artCss: '',
};

export function loginPage(next: string, error: string): string {
  const look = LOOKS[siteOf(next)] ?? DEFAULT_LOOK;
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
${look.artCss}

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
  .lead { margin:0 0 32px; max-width:36ch; color:var(--muted); text-wrap:pretty; }
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
${look.art}
<div class="ticker" aria-hidden="true"><span>Закрытый просмотр <b>●</b> прототип сайта <b>●</b> yaropolov.ru <b>●</b> сайты и реклама под заявки <b>●</b> Закрытый просмотр <b>●</b> прототип сайта <b>●</b> yaropolov.ru <b>●</b> сайты и реклама под заявки <b>●</b></span></div>

<main>
  <div class="card">
    <p class="eyebrow"><i></i>${look.eyebrow}</p>
    <h1><span>${look.title[0]}</span><span>${look.title[1]}<em>.</em></span></h1>
    <p class="lead">${look.lead}</p>
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
