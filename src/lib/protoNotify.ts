// Уведомления в Telegram, когда клиент заходит в закрытый раздел: ввёл пароль, открыл страницу, скачал PDF.
// Идут через тот же релей, что и заявки (TELEGRAM_RELAY_URL / TELEGRAM_RELAY_SECRET). Без них молча ничего не шлём.

// Кому принадлежит раздел: так подписываем уведомление. Разделы без записи подписываются своим именем.
const WHO: Record<string, string> = {
  TASirotina: 'Татьяна Сиротина, прототип сайта',
  PsyStudResurs: 'Светлана, ПсиСтудРесурс, анализ ниши',
};

export type ProtoEvent = 'login' | 'open' | 'download';
const WHAT: Record<ProtoEvent, string> = {
  login: '🔑 Вход по паролю',
  open: '👀 Открыта страница',
  download: '📄 Скачан PDF',
};

// Одно и то же событие с одного адреса — не чаще раза в 30 минут, чтобы обновления страницы не сыпались в чат.
const seen = new Map<string, number>();
const QUIET = 30 * 60 * 1000;

const BOT = /bot|crawl|spider|preview|headless|lighthouse|curl|wget|python|node-fetch|facebookexternalhit|vkshare|whatsapp/i;

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

function device(ua: string): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'неизвестно';
  const app = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Telegram/.test(ua) ? 'Telegram' : /VKClient|vkontakte/i.test(ua) ? 'ВКонтакте'
    : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return app ? `${os}, ${app}` : os;
}

export function notifyProto(event: ProtoEvent, section: string, site: string, ip: string, ua: string): void {
  const url = process.env.TELEGRAM_RELAY_URL ?? import.meta.env.TELEGRAM_RELAY_URL;
  const secret = process.env.TELEGRAM_RELAY_SECRET ?? import.meta.env.TELEGRAM_RELAY_SECRET;
  if (!url || !secret || BOT.test(ua)) return;

  const key = `${event}:${site}:${ip}`;
  const now = Date.now();
  if ((seen.get(key) ?? 0) > now - QUIET) return;
  seen.set(key, now);

  const when = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const text = [
    `<b>${WHAT[event]}</b>`,
    esc(WHO[site] ?? site),
    `yaropolov.ru/${section}/${esc(site)}/`,
    `${when} МСК · ${esc(device(ua))}`,
  ].join('\n');

  // Не ждём ответа: посетитель не должен ждать Telegram
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-relay-secret': secret },
    body: JSON.stringify({ text }),
  }).catch((err) => console.error('Уведомление о входе не ушло:', err));
}
