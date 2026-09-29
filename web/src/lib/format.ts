const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

function currencyFormatter(currency: string, digits: number): Intl.NumberFormat {
  return nf(`c:${currency}:${digits}`, () => {
    try {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      // Not an ISO code (ZenMoney may use custom titles) — format as a plain number.
      return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
  });
}

/** 12 345 ₽ */
export function money(value: number, currency = 'RUB', digits = 0): string {
  return currencyFormatter(currency, digits).format(value);
}

/** 12 345,67 ₽ */
export function moneyExact(value: number, currency = 'RUB'): string {
  return money(value, currency, 2);
}

/** 12,3 тыс. / 1,2 млн — for axes and compact labels. */
export function compact(value: number): string {
  return nf(
    'compact',
    () => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }),
  ).format(value);
}

export function percent(value: number, digits = 0): string {
  return nf(
    `p:${digits}`,
    () =>
      new Intl.NumberFormat('ru-RU', {
        style: 'percent',
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }),
  ).format(value);
}

export function number(value: number, digits = 1): string {
  return nf(
    `n:${digits}`,
    () => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }),
  ).format(value);
}

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-08" → "Август 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${cap(MONTHS[Number(m) - 1] ?? '')} ${y}`;
}

/** "2026-08" → "августа 2026" */
export function monthGenitive(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS_GEN[Number(m) - 1] ?? ''} ${y}`;
}

/** 4,2 → "в 4,2 раза"; 9 → "в 9 раз" */
export function timesPhrase(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  if (!Number.isInteger(rounded)) return `в ${number(rounded)} раза`;
  return `в ${rounded} ${pluralize(rounded, 'раз', 'раза', 'раз')}`;
}

/** "2026-08" → "авг 2026" */
export function monthShort(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

/** "2026-08-05" → "5 августа 2026" */
export function dateLong(date: string, withYear = true): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS_GEN[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
}

/** "2026-08-05" → "05.08.2026" */
export function dateShort(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
