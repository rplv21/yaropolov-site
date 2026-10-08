// Русская микротипографика для готового HTML.
// Главное правило: однобуквенные и короткие служебные слова (и, а, в, к, с, о, у,
// на, по, за, из, от, до, не, но...) никогда не остаются в конце строки,
// они всегда держатся за следующим словом через неразрывный пробел.
// Дополнительно: тире не отрывается от предыдущего слова, а числа с
// разрядами и единицами (1 000 000 ₽, 85 %) не разрываются.

const NB = ' ';

const WORDS = [
  'а', 'б', 'в', 'и', 'к', 'о', 'с', 'у', 'я',
  'во', 'ко', 'со', 'об', 'на', 'по', 'за', 'из', 'от', 'до', 'не', 'ни', 'но', 'да',
  'же', 'ли', 'бы', 'то', 'для', 'при', 'про', 'без', 'над', 'под', 'или',
];

const wordRe = new RegExp(`(?<![\\p{L}\\p{N}_])(${WORDS.join('|')})[ \\t\\r\\n]+(?=\\S|$)`, 'giu');

function fixText(text: string): string {
  return text
    .replace(wordRe, `$1${NB}`)
    .replace(/[ \t\r\n]+(?=[—–](?:[ \t\r\n]| |$))/g, NB)
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NB}`)
    .replace(/(\d) (?=(?:₽|%|шт|мин|сек|лет|дня|дней|мест)(?![\p{L}]))/gu, `$1${NB}`);
}

// Обрабатываем только текст между тегами. Содержимое script/style/textarea/pre/title
// и атрибуты остаются нетронутыми.
export function typo(html: string): string {
  // Короткое слово перед принудительным переносом (<br>) повисло бы в конце строки:
  // переносим его на следующую строку («...предлагаю и<br>сколько» → «...предлагаю<br>и сколько»).
  html = html.replace(
    new RegExp(`(?<=[\\s>])(${WORDS.join('|')})[ \\t\\r\\n]*(<br\\s*/?>)`, 'giu'),
    '$2$1 '
  );

  const parts = html.split(/(<[^>]+>)/);
  let skip: string | null = null;
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        const open = part.match(/^<(script|style|textarea|pre|title)\b/i);
        if (open && !part.endsWith('/>')) skip = open[1].toLowerCase();
        const close = part.match(/^<\/(script|style|textarea|pre|title)\s*>/i);
        if (close) skip = null;
        return part;
      }
      return skip ? part : fixText(part);
    })
    .join('');
}
