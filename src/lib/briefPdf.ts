// Сборка PDF с ответами на бриф. Серверный код: вызывается из /api/send-brief.
// Шрифт Roboto с кириллицей поставляется вместе с pdfmake (vfs_fonts).
import pdfMake from 'pdfmake/build/pdfmake.js';
import vfs from 'pdfmake/build/vfs_fonts.js';
import type { BriefItem, BriefSection } from '../data/brief';

export interface BriefAnswers {
  values: Record<string, string | string[]>;
  extras: Record<string, string>;
}

const INK = '#0F0D0A';
const RED = '#C8232F';
const GREY = '#6B6556';
const LINE = '#CFC7AE';
const CREAM = '#F6F0DC';

pdfMake.vfs = vfs;
pdfMake.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};

/** Ответ на вопрос одним значением: список выбранного + уточнение. */
export function answerParts(item: BriefItem, a: BriefAnswers) {
  const raw = a.values[item.id];
  const extra = (a.extras[item.id] || '').trim();
  const list = Array.isArray(raw) ? raw.filter(Boolean) : raw ? [String(raw).trim()].filter(Boolean) : [];
  return { list, extra };
}

export function countAnswered(sections: BriefSection[], a: BriefAnswers) {
  let answered = 0;
  let total = 0;
  for (const s of sections) {
    for (const it of s.items) {
      total++;
      const { list, extra } = answerParts(it, a);
      if (list.length || extra) answered++;
    }
  }
  return { answered, total };
}

function answerCell(item: BriefItem, a: BriefAnswers) {
  const { list, extra } = answerParts(item, a);
  const out: unknown[] = [];

  if (item.type === 'checks' && list.length) {
    out.push({ ul: list, type: 'square', markerColor: RED, margin: [0, 0, 0, extra ? 4 : 0] });
  } else if (list.length) {
    out.push({ text: list.join(', '), margin: [0, 0, 0, extra ? 4 : 0] });
  }
  if (extra) {
    out.push({
      text: item.type === 'radio' || item.type === 'checks' ? [{ text: 'Уточнение: ', color: GREY }, extra] : extra,
    });
  }
  if (!out.length) out.push({ text: 'не заполнено', italics: true, color: '#A09882' });
  return out;
}

export function buildBriefPdf(
  sections: BriefSection[],
  a: BriefAnswers,
  meta: { date: string; keys: { company: string; name: string; phone: string; email: string; contact: string } }
): Promise<Buffer> {
  const first = (id: string) => {
    const v = a.values[id];
    return (Array.isArray(v) ? v.join(', ') : v || '').toString().trim() || '—';
  };
  const { answered, total } = countAnswered(sections, a);

  const summaryRows = [
    ['Компания', first(meta.keys.company)],
    ['Контактное лицо', first(meta.keys.name)],
    ['Телефон', first(meta.keys.phone)],
    ['Электронная почта', first(meta.keys.email)],
    ['Удобный способ связи', first(meta.keys.contact)],
    ['Заполнено', `${answered} из ${total} вопросов`],
  ];

  const content: unknown[] = [
    { text: `ПОЛУЧЕНО С YAROPOLOV.RU  ·  ${meta.date}`, fontSize: 8, color: GREY, bold: true, characterSpacing: 0.6, margin: [0, 0, 0, 8] },
    { text: 'Бриф на создание сайта', fontSize: 26, bold: true, margin: [0, 0, 0, 14] },
    {
      table: {
        widths: [130, '*'],
        body: summaryRows.map(([k, v]) => [
          { text: k, color: GREY, fontSize: 9, margin: [8, 5, 0, 5] },
          { text: v, bold: true, margin: [0, 5, 8, 5] },
        ]),
      },
      layout: {
        fillColor: () => CREAM,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 6],
    },
  ];

  for (const s of sections) {
    content.push({
      text: [
        { text: `${s.n}  `, color: RED },
        { text: s.title },
      ],
      fontSize: 14,
      bold: true,
      margin: [0, 20, 0, 8],
      keepWithNext: true,
    });

    content.push({
      table: {
        headerRows: 0,
        dontBreakRows: true,
        widths: [28, 190, '*'],
        body: s.items.map((it) => [
          { text: it.n, color: RED, bold: true, fontSize: 9, margin: [0, 2, 0, 0] },
          { text: it.q, bold: true, margin: [0, 2, 8, 0] },
          { stack: answerCell(it, a), margin: [0, 2, 0, 0] },
        ]),
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
        hLineColor: (i: number) => (i === 0 ? INK : LINE),
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 7,
        paddingBottom: () => 7,
      },
    });
  }

  const def = {
    pageSize: 'A4',
    pageMargins: [40, 46, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.25, color: INK },
    info: { title: 'Бриф на создание сайта', author: 'yaropolov.ru' },
    footer: (page: number, pages: number) => ({
      text: `Бриф на создание сайта  ·  стр. ${page} из ${pages}`,
      alignment: 'right',
      fontSize: 8,
      color: GREY,
      margin: [0, 18, 40, 0],
    }),
    content,
  };

  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(def).getBuffer((buf) => resolve(Buffer.from(buf)));
    } catch (e) {
      reject(e);
    }
  });
}
