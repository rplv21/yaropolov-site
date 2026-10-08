import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

// Слабое устройство: мало ядер или памяти, либо включено «уменьшить движение».
// Для него тяжёлые анимации (схема зала) рисуются сразу в конечном виде.
const lowPower =
  reduce ||
  (navigator.hardwareConcurrency || 8) <= 2 ||
  ((navigator as unknown as { deviceMemory?: number }).deviceMemory || 8) <= 2;
const hallState = new WeakMap<HTMLCanvasElement, { p: number }>();

const $$ = <T extends HTMLElement = HTMLElement>(sel: string, ctx: ParentNode = document) =>
  Array.from(ctx.querySelectorAll<T>(sel));

/* ───────── Диалог политики (нужен всегда) ───────── */
(() => {
  const dlg = document.getElementById('privacy') as HTMLDialogElement | null;
  document.querySelectorAll('.privacy-open').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      dlg?.showModal();
    })
  );
  dlg?.querySelector('.privacy-close')?.addEventListener('click', () => dlg.close());
  dlg?.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
})();

/* ───────── Утилиты ───────── */

// Режем текст на буквы внутри слов (слово обрезается маской, буква вылетает).
function splitChars(el: HTMLElement): HTMLElement[] {
  const chars: HTMLElement[] = [];
  el.setAttribute('aria-label', (el.textContent || '').replace(/\s+/g, ' ').trim());
  const walk = (node: Node): Node => {
    if (node.nodeType === 3) {
      const frag = document.createDocumentFragment();
      (node.textContent || '').split(/([ \t\r\n]+)/).forEach((part) => {
        if (!part) return;
        if (/^[ \t\r\n]+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          return;
        }
        const w = document.createElement('span');
        w.className = 'w';
        w.setAttribute('aria-hidden', 'true');
        [...part].forEach((ch) => {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          w.appendChild(c);
          chars.push(c);
        });
        frag.appendChild(w);
      });
      return frag;
    }
    if (node.nodeType === 1 && (node as Element).tagName !== 'BR') {
      Array.from(node.childNodes).forEach((child) => node.replaceChild(walk(child), child));
    }
    return node;
  };
  Array.from(el.childNodes).forEach((child) => el.replaceChild(walk(child), child));
  return chars;
}

// Режем текст на слова (для эффекта «загорающегося» абзаца).
function splitWords(el: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];
  const walk = (node: Node): Node => {
    if (node.nodeType === 3) {
      const frag = document.createDocumentFragment();
      (node.textContent || '').split(/([ \t\r\n]+)/).forEach((part) => {
        if (!part) return;
        if (/^[ \t\r\n]+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          return;
        }
        const s = document.createElement('span');
        s.className = 'lw';
        s.textContent = part;
        words.push(s);
        frag.appendChild(s);
      });
      return frag;
    }
    if (node.nodeType === 1 && (node as Element).tagName !== 'BR') {
      Array.from(node.childNodes).forEach((child) => node.replaceChild(walk(child), child));
    }
    return node;
  };
  Array.from(el.childNodes).forEach((child) => el.replaceChild(walk(child), child));
  return words;
}

// Число «набегает» от нуля. Формат берём из исходной строки: «+85%», «1 000 000 ₽».
function countUp(el: HTMLElement, duration = 1.6) {
  const full = el.textContent || '';
  const m = full.match(/^(\D*)([\d\s ]*\d)(.*)$/);
  if (!m) return;
  const [, pre, numStr, suf] = m;
  const to = parseInt(numStr.replace(/\D/g, ''), 10);
  const o = { v: 0 };
  gsap.to(o, {
    v: to,
    duration,
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = pre + Math.round(o.v).toLocaleString('ru-RU').replace(/ /g, ' ') + suf;
    },
    onComplete: () => {
      el.textContent = full;
    },
  });
}

/* ───────── Форма: ничего не прячем, работает всегда ───────── */

if (reduce) {
  // Без движения: все начальные состояния остаются конечными, загрузчик убираем.
  document.querySelectorAll<HTMLElement>('.hero-h, .hero-fade').forEach((e) => {
    e.style.opacity = '1';
    e.style.visibility = 'visible';
  });
  document.querySelectorAll<HTMLElement>('.wipe').forEach((e) => (e.style.clipPath = 'none'));
  document.querySelectorAll('.svc').forEach((s, i) => s.classList.toggle('is-open', i === 0));
  initFaq();
  initHall(); // при «уменьшении движения» схема зала сразу в конечном виде
} else {
  boot();
}

function boot() {
  initCursor();
  initMagnetic();
  initScramble();
  initIntro();
}

/* ───────── Вступление: заголовок hero собирается сразу при открытии страницы ───────── */
function initIntro() {
  // Внутренние страницы (статьи, 404): hero нет, вступление не нужно
  if (!document.querySelector('.hero-h')) {
    initScroll();
    return;
  }

  const h1 = document.querySelector<HTMLElement>('.hero-h');
  const heroChars = h1 ? splitChars(h1) : [];
  gsap.set(heroChars, { yPercent: 115, rotate: 7 });
  gsap.set(h1, { autoAlpha: 1 });
  gsap.set('.hero-fade', { autoAlpha: 0, y: 24 });
  gsap.set('.hero-canvas', { autoAlpha: 0 });

  gsap
    .timeline({ defaults: { ease: 'expo.out' } })
    .to('.hero-canvas', { autoAlpha: 1, duration: 1.6 }, 0)
    .to(heroChars, { yPercent: 0, rotate: 0, duration: 1.3, stagger: 0.022 }, 0.05)
    .to('.hero-fade', { autoAlpha: 1, y: 0, duration: 1, stagger: 0.12 }, 0.6);

  initScroll();
}

/* ───────── Всё, что связано со скроллом ───────── */
function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Полоса прогресса
  gsap.to('.prog', {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.2 },
  });

  initParticles();
  initCounters();
  initLit();
  initStack();
  initCases();
  initServices();
  initTimeline();
  initFaq();
  initWipe();
  initHeadlines();

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// Заголовки секций: буквы вылетают при появлении
function initHeadlines() {
  $$('[data-split]:not(.hero-h)').forEach((el) => {
    const chars = splitChars(el);
    gsap.set(chars, { yPercent: 115, rotate: 5 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () =>
        gsap.to(chars, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: 0.018 }),
    });
  });
}

// Счётчики
function initCounters() {
  $$('[data-count]').forEach((el) => {
    if (el.closest('.panel')) return; // кейсы считают сами, см. initCases
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => countUp(el) });
  });
}

// Абзацы, слова которых «загораются» по мере прокрутки
function initLit() {
  $$('[data-lit]').forEach((el) => {
    const words = splitWords(el);
    gsap.set(words, { opacity: 0.16 });
    gsap.to(words, {
      opacity: 1,
      ease: 'none',
      stagger: 0.12,
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 50%', scrub: true },
    });
  });
}

// Стопка карточек: предыдущая уходит вглубь, когда наезжает следующая
function initStack() {
  const cards = $$('.card');
  // Положение «прилипшей» карточки от верха экрана (css top в px)
  const stickyTop = (el: HTMLElement) => parseFloat(getComputedStyle(el).top) || 0;

  cards.forEach((card, i) => {
    const next = cards[i + 1];
    if (!next) return;
    // Предыдущая карточка остаётся яркой и читаемой, пока следующая её не коснулась.
    // Затемнение и уход вглубь идут только пока следующая карточка наезжает сверху:
    // от момента касания нижнего края до остановки на своём месте в стопке.
    // Затемнение делаем вуалью: opacity и transform считает видеокарта, а filter заставлял
    // браузер перерисовывать всю карточку на каждом кадре прокрутки.
    const veil = card.querySelector<HTMLElement>('.card-veil');
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: next,
        start: () => 'top ' + (stickyTop(card) + card.offsetHeight) + 'px',
        end: () => 'top ' + stickyTop(next) + 'px',
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
    tl.fromTo(card, { scale: 1 }, { scale: 0.94, duration: 1 }, 0);
    if (veil) tl.fromTo(veil, { opacity: 0 }, { opacity: 0.45, duration: 1 }, 0);
  });
}

// Занятость зала: схема на canvas. Все места рисуются пачкой (один путь для контуров,
// один для закрашенных), а анимация — это одно число прогресса. На слабых устройствах
// и при «уменьшении движения» схема сразу рисуется в конечном виде, без анимации.
function drawHall(cv: HTMLCanvasElement, progress: number) {
  const total = Number(cv.dataset.total) || 0;
  const booked = Number(cv.dataset.booked) || 0;
  const cols = Number(cv.dataset.cols) || 33;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth;
  if (!w || !total) return;
  const rows = Math.ceil(total / cols);
  const cell = w / cols;
  const h = Math.round(cell * rows);

  // Размер буфера меняем, только если он изменился (смена размера сбрасывает canvas)
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh) {
    cv.width = bw;
    cv.height = bh;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const gap = Math.max(1.5, cell * 0.14);
  const size = cell - gap;
  const shown = Math.floor(booked * progress);

  // Контуры свободных мест: один путь на все
  ctx.beginPath();
  for (let i = shown; i < total; i++) {
    const x = (i % cols) * cell + gap / 2;
    const y = Math.floor(i / cols) * cell + gap / 2;
    ctx.rect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
  ctx.strokeStyle = 'rgba(15, 13, 10, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Закрашенные (забронированные) места: тоже один путь
  if (shown > 0) {
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const x = (i % cols) * cell + gap / 2;
      const y = Math.floor(i / cols) * cell + gap / 2;
      ctx.rect(x, y, size, size);
    }
    ctx.fillStyle = '#d0222e';
    ctx.fill();
  }
}

function initHall() {
  const canvases = $$<HTMLCanvasElement>('.occ-canvas');
  canvases.forEach((cv) => {
    const st = { p: lowPower ? 1 : 0 };
    hallState.set(cv, st);
    drawHall(cv, st.p);
  });
  // Перерисовка при изменении ширины (поворот экрана, ресайз)
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((e) => {
        const cv = e.target as HTMLCanvasElement;
        drawHall(cv, hallState.get(cv)?.p ?? 1);
      });
    });
    canvases.forEach((cv) => ro.observe(cv));
  }
}

function hallIn(panel: HTMLElement) {
  $$<HTMLCanvasElement>('.occ-canvas', panel).forEach((cv) => {
    const st = hallState.get(cv);
    if (!st || st.p >= 1) return;
    gsap.to(st, {
      p: 1,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => drawHall(cv, st.p),
    });
  });
}

// Кейсы: горизонтальная прокрутка на широких экранах
function initCases() {
  initHall();
  const mm = gsap.matchMedia();

  mm.add('(min-width: 1000px)', () => {
    const pin = document.querySelector<HTMLElement>('.hz-pin');
    const track = document.querySelector<HTMLElement>('.hz-track');
    if (!pin || !track) return;
    const dist = () => Math.max(0, track.scrollWidth - pin.clientWidth);

    // «Упор» на обоих краях: слайдер стоит на месте ещё ~1,5-2 щелчка колеса (180-260 px), прежде чем
    // страница тронется дальше. Так понятно, что листать в сторону больше некуда.
    // Весь путь закрепления = упор + движение + упор, а положение дорожки считаем сами.
    const hold = () => Math.round(Math.min(260, Math.max(180, window.innerHeight * 0.18)));
    // Плавный сход: после правого упора содержимое начинает уезжать вверх, разгоняясь
    // от нуля до скорости обычной прокрутки (y = -exit * e^2 / 2). Когда блок отпускает
    // страницу, скорости уже равны, поэтому нет рывка «стоял и сорвался».
    const exitPx = () => Math.round(window.innerHeight * 0.5);
    const total = () => dist() + hold() * 2 + exitPx();
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    // Прогресс закрепления -> сдвиг дорожки: упор, линейное движение, упор
    const xAt = (progress: number) => {
      const px = progress * total();
      return -dist() * clamp01((px - hold()) / dist());
    };
    // Прогресс закрепления -> вертикальный сдвиг на фазе схода (остаётся -exit/2 после неё)
    const yAt = (progress: number) => {
      const px = progress * total() - (dist() + hold() * 2);
      const e = clamp01(px / exitPx());
      return (-exitPx() * e * e) / 2;
    };

    const panels = $$('.panel');
    const lines = panels.map((p) => $$('.t-line', p));
    lines.flat().forEach((l) => (l.style.strokeDashoffset = '1'));
    const fired = new Set<HTMLElement>();

    // Геометрию читаем только при пересчёте, а не на каждом кадре прокрутки:
    // чтение offsetLeft в кадре заставляет браузер заново считать раскладку.
    let offsets: number[] = [];
    let viewW = 0;
    const measure = () => {
      offsets = panels.map((p) => p.offsetLeft);
      viewW = pin.clientWidth;
    };
    measure();

    // Дорожка живёт на своём слое (will-change в CSS) и повторяет прокрутку один в один.
    // Лишнего сглаживания нет: браузерная прокрутка уже плавная, а догоняющая анимация
    // давала ощущение запаздывания и рывков.
    const setX = gsap.quickSetter(track, 'x', 'px');
    const setY = gsap.quickSetter(track, 'y', 'px');
    const lastDraw = lines.map(() => -1);

    const apply = (progress: number) => {
      const x = xAt(progress);
      setX(x);
      setY(yAt(progress));

      panels.forEach((panel, i) => {
        // Положение панели на экране с учётом сдвига дорожки
        const left = offsets[i] + x;
        if (!fired.has(panel) && left < viewW * 0.75) {
          fired.add(panel);
          $$('[data-count]', panel).forEach((n) => countUp(n));
          hallIn(panel);
        }
        // Линию роста перерисовываем, только если она заметно изменилась
        const draw = clamp01((viewW * 0.7 - left) / (viewW * 0.55));
        if (Math.abs(draw - lastDraw[i]) > 0.004) {
          lastDraw[i] = draw;
          const v = String(1 - draw);
          lines[i].forEach((l) => (l.style.strokeDashoffset = v));
        }
      });
    };

    ScrollTrigger.create({
      trigger: pin,
      pin: true,
      start: 'top top',
      end: () => '+=' + total(),
      invalidateOnRefresh: true,
      onRefresh: (self) => {
        measure();
        apply(self.progress);
      },
      onUpdate: (self) => apply(self.progress),
    });
  });

  mm.add('(max-width: 999px)', () => {
    $$('.panel').forEach((panel) => {
      ScrollTrigger.create({
        trigger: panel,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          $$('[data-count]', panel).forEach((n) => countUp(n));
          hallIn(panel);
        },
      });
      $$('.t-line', panel).forEach((p) =>
        gsap.fromTo(
          p,
          { strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: panel, start: 'top 75%', end: 'center 40%', scrub: true },
          }
        )
      );
    });
  });
}

// Услуги: колонки раскрываются по наведению / фокусу / нажатию.
// При раскрытии буквы названия «собираются»: вылетают из вертикальной подписи,
// разворачиваются в строку и на лету проходят через случайные символы (как в меню).
function initServices() {
  const items = $$('.svc');
  if (!items.length) return;

  const glyphs = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';

  // Режем текстовые узлы на буквы-спаны (звёздочку-svg не трогаем).
  // Для заголовка буквы собираем в неразрывные слова, иначе строка рвётся посреди слова.
  const charsOf = (el: HTMLElement | null, block: boolean) => {
    const out: HTMLElement[] = [];
    if (!el) return out;
    const mk = (ch: string) => {
      const sp = document.createElement('span');
      sp.textContent = ch;
      sp.dataset.ch = ch;
      sp.style.whiteSpace = 'pre';
      if (block) sp.style.display = 'inline-block';
      out.push(sp);
      return sp;
    };
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 3) return;
      const frag = document.createDocumentFragment();
      if (!block) {
        [...(node.textContent || '')].forEach((ch) => frag.appendChild(mk(ch)));
      } else {
        (node.textContent || '').split(/( +)/).forEach((part) => {
          if (!part) return;
          if (part.trim() === '') {
            // Пробел остаётся обычным текстом, чтобы строка могла переноситься между словами
            const sp = mk(' ');
            sp.style.display = 'inline';
            frag.appendChild(sp);
            return;
          }
          const word = document.createElement('span');
          word.style.display = 'inline-block';
          word.style.whiteSpace = 'nowrap';
          [...part].forEach((ch) => word.appendChild(mk(ch)));
          frag.appendChild(word);
        });
      }
      el.replaceChild(frag, node);
    });
    return out;
  };

  const data = new Map<HTMLElement, { name: HTMLElement[]; vert: HTMLElement[]; vertEl: HTMLElement | null }>();
  items.forEach((s) => {
    const nameEl = s.querySelector<HTMLElement>('.svc-name');
    const vertEl = s.querySelector<HTMLElement>('.svc-vert');
    data.set(s, { name: charsOf(nameEl, true), vert: charsOf(vertEl, false), vertEl });
  });

  const open = (el: HTMLElement, animate = true) => {
    if (el.classList.contains('is-open')) return;
    const d = data.get(el);

    // Измеряем ДО смены состояния: где буква стоит в вертикальной подписи и где в заголовке
    let moves: { dx: number; dy: number; w: number }[] | null = null;
    if (animate && d && d.vertEl && getComputedStyle(d.vertEl).display !== 'none') {
      moves = d.name.map((c, i) => {
        const v = d.vert[i];
        const a = v ? v.getBoundingClientRect() : null;
        const t = c.getBoundingClientRect();
        return {
          dx: a ? a.left + a.width / 2 - (t.left + t.width / 2) : 0,
          dy: a ? a.top + a.height / 2 - (t.top + t.height / 2) : 0,
          w: t.width,
        };
      });
    }

    items.forEach((s) => s.classList.toggle('is-open', s === el));

    if (!moves || !d) return;
    d.name.forEach((c, i) => {
      const m = moves![i];
      const ch = c.dataset.ch || '';
      const isLetter = /\p{L}/u.test(ch);
      if (isLetter) {
        c.style.width = m.w + 'px';
        c.style.textAlign = 'center';
      }
      gsap.killTweensOf(c);
      gsap.fromTo(
        c,
        { x: m.dx, y: m.dy, rotate: -90 },
        {
          x: 0,
          y: 0,
          rotate: 0,
          duration: 0.8,
          ease: 'expo.out',
          delay: i * 0.016,
          onUpdate: function () {
            if (!isLetter) return;
            c.textContent = this.progress() < 0.5 ? glyphs[Math.floor(Math.random() * glyphs.length)] : ch;
          },
          onComplete: () => {
            c.textContent = ch;
            c.style.width = '';
            c.style.textAlign = '';
          },
        }
      );
    });
  };

  open(items[0], false);
  items.forEach((s) => {
    s.addEventListener('mouseenter', () => fine && open(s));
    s.addEventListener('focusin', () => open(s));
    s.addEventListener('click', () => open(s));
  });
}

// Процесс: линия растёт, шаги зажигаются
function initTimeline() {
  const line = document.querySelector<HTMLElement>('.tl-line-fill');
  const wrap = document.querySelector<HTMLElement>('.tl');
  if (line && wrap) {
    gsap.fromTo(
      line,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: 'none',
        transformOrigin: '50% 0',
        scrollTrigger: { trigger: wrap, start: 'top 60%', end: 'bottom 60%', scrub: true },
      }
    );
  }
  $$('.tl-step').forEach((step) => {
    ScrollTrigger.create({
      trigger: step,
      start: 'top 62%',
      end: 'bottom 62%',
      toggleClass: { targets: step, className: 'is-on' },
    });
    gsap.from($$('.tl-n', step), {
      yPercent: 30,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: step, start: 'top 90%', end: 'top 55%', scrub: true },
    });
  });
}

// Вопросы: плавное раскрытие
function initFaq() {
  $$('.fq').forEach((item) => {
    const btn = item.querySelector<HTMLButtonElement>('.fq-q');
    btn?.addEventListener('click', () => {
      const isOpen = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(isOpen));
      if (!reduce) setTimeout(() => ScrollTrigger.refresh(), 600);
    });
  });
}

// Контакты: красная заливка раскрывается кругом снизу
function initWipe() {
  const wipe = document.querySelector<HTMLElement>('.wipe');
  const sec = document.querySelector<HTMLElement>('.contact');
  if (!wipe || !sec) return;
  gsap.fromTo(
    wipe,
    { clipPath: 'circle(0% at 50% 100%)' },
    {
      clipPath: 'circle(150% at 50% 100%)',
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top 85%', end: 'top 10%', scrub: true },
    }
  );
}

/* ───────── Частицы-воронка в hero ───────── */
function initParticles() {
  const cv = document.querySelector<HTMLCanvasElement>('.hero-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  type P = { x: number; y: number; vx: number; vy: number; r: number };
  let w = 0;
  let h = 0;
  let dpr = 1;
  let ps: P[] = [];
  let running = false;
  const mouse = { x: -9999, y: -9999 };
  const tgt = { x: 0, y: 0 };

  const spawn = (p?: P): P => {
    const q = p ?? ({} as P);
    q.x = -Math.random() * w * 0.25;
    q.y = Math.random() * h;
    q.vx = 0.5 + Math.random() * 1.1;
    q.vy = (Math.random() - 0.5) * 0.25;
    q.r = 1.1 + Math.random() * 2.1;
    return q;
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.clientWidth;
    h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tgt.x = w * (w > 900 ? 0.8 : 0.72);
    tgt.y = h * 0.5;
    const count = Math.min(240, Math.round((w * h) / 8000));
    ps = Array.from({ length: count }, () => {
      const p = spawn();
      p.x = Math.random() * w;
      return p;
    });
  };

  let t = 0;
  const frame = () => {
    if (!running) return;
    t += 0.02;
    ctx.clearRect(0, 0, w, h);

    // Воронка: кольцо, в которое стекаются «показы» и превращаются в «обращения»
    const pulse = 1 + Math.sin(t * 2) * 0.06;
    ctx.strokeStyle = 'rgba(208,34,46,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tgt.x, tgt.y, 38 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(208,34,46,0.25)';
    ctx.beginPath();
    ctx.arc(tgt.x, tgt.y, 78 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    for (const p of ps) {
      const dx = tgt.x - p.x;
      const dy = tgt.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const prox = Math.max(0, 1 - d / (w * 0.6));

      p.vx += (dx / d) * prox * 0.035;
      p.vy += (dy / d) * prox * 0.035;

      const mx = p.x - mouse.x;
      const my = p.y - mouse.y;
      const md = Math.hypot(mx, my);
      if (md < 130) {
        p.vx += (mx / md) * 0.35;
        p.vy += (my / md) * 0.35;
      }

      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;

      if (d < 34 || p.x > w + 20) {
        spawn(p);
        continue;
      }

      const hot = d < w * 0.2;
      ctx.fillStyle = hot
        ? `rgba(208,34,46,${0.55 + prox * 0.45})`
        : `rgba(246,240,220,${0.3 + prox * 0.6})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (hot ? 1.5 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  cv.parentElement?.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  cv.parentElement?.addEventListener('pointerleave', () => {
    mouse.x = mouse.y = -9999;
  });

  // Рисуем, только пока hero на экране и вкладка активна
  new IntersectionObserver(
    ([e]) => {
      const should = e.isIntersecting && !document.hidden;
      if (should && !running) {
        running = true;
        requestAnimationFrame(frame);
      } else if (!should) {
        running = false;
      }
    },
    { threshold: 0 }
  ).observe(cv);
}

/* ───────── Курсор-кольцо ───────── */
function initCursor() {
  if (!fine) return;
  const cur = document.querySelector<HTMLElement>('.cur');
  if (!cur) return;
  const xTo = gsap.quickTo(cur, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(cur, 'y', { duration: 0.35, ease: 'power3' });
  let shown = false;
  window.addEventListener('pointermove', (e) => {
    if (!shown) {
      cur.style.opacity = '1';
      shown = true;
    }
    xTo(e.clientX);
    yTo(e.clientY);
  });
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    cur.classList.toggle('is-link', !!t.closest('a, button, summary, .svc, input, textarea, label'));
  });
  document.addEventListener('pointerleave', () => (cur.style.opacity = '0'));
}

/* ───────── Магнитные кнопки ───────── */
function initMagnetic() {
  if (!fine) return;
  $$('[data-mag]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.28);
      y((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    el.addEventListener('pointerleave', () => {
      x(0);
      y(0);
    });
  });
}

/* ───────── Скремблер текста в навигации ───────── */
function initScramble() {
  if (!fine) return;
  const glyphs = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ0123456789';
  $$('[data-scr]').forEach((el) => {
    const original = el.textContent || '';
    let timer = 0;
    el.addEventListener('pointerenter', () => {
      let frame = 0;
      clearInterval(timer);
      timer = window.setInterval(() => {
        el.textContent = [...original]
          .map((ch, i) =>
            ch === ' ' ? ' ' : i < frame / 2 ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]
          )
          .join('');
        if (++frame > original.length * 2) {
          clearInterval(timer);
          el.textContent = original;
        }
      }, 28);
    });
    el.addEventListener('pointerleave', () => {
      clearInterval(timer);
      el.textContent = original;
    });
  });
}
