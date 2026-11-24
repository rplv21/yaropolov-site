// Хранилище заявок и брифов — почтовый ящик на Яндексе (серверы в РФ).
// 152-ФЗ, ст. 18 ч. 5: персданные граждан РФ сначала записываются в базу на территории РФ,
// поэтому полная заявка уходит письмом на Яндекс, а в Telegram — только уведомление
// без имени и контактов.
//
// Переменные окружения:
//   SMTP_USER — адрес ящика на Яндексе (например, leads.yaropolov@yandex.ru)
//   SMTP_PASS — пароль приложения для этого ящика (Яндекс ID → Безопасность → Пароли приложений → Почта)
//   LEADS_TO  — куда слать заявки (по умолчанию тот же SMTP_USER)
// Пока SMTP_USER/SMTP_PASS не заданы, сайт работает по-старому (Telegram/KV).
import nodemailer from 'nodemailer';

const env = (k: string) => String(process.env[k] ?? (import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();

export function hasMail(): boolean {
  return !!(env('SMTP_USER') && env('SMTP_PASS'));
}

let transport: nodemailer.Transporter | null = null;

/** Отправляет письмо с заявкой. Бросает ошибку, если Яндекс не принял письмо. */
export async function sendLeadMail(subject: string, text: string, replyTo?: string) {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST') || 'smtp.yandex.ru',
      port: Number(env('SMTP_PORT') || 465),
      secure: Number(env('SMTP_PORT') || 465) === 465,
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
      connectionTimeout: 3_000,
      greetingTimeout: 5_000,
      socketTimeout: 15_000,
    });
  }
  const user = env('SMTP_USER');
  await transport.sendMail({
    from: `yaropolov.ru <${user}>`,
    to: env('LEADS_TO') || user,
    subject,
    text,
    ...(replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? { replyTo } : {}),
  });
}

/** Короткая причина сбоя почты для уведомления: код и ответ сервера, без паролей. */
export function mailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  return [e.code, e.responseCode, (e.response || e.message || '').slice(0, 160)].filter(Boolean).join(' · ') || 'неизвестная ошибка';
}

/** Письмо Павлу в Telegram через воркер — только служебный текст без персданных. */
export async function notifyTelegram(text: string) {
  const url = env('TELEGRAM_RELAY_URL');
  const secret = env('TELEGRAM_RELAY_SECRET');
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-relay-secret': secret },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error('Telegram relay недоступен:', e);
  }
}
