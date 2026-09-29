// Date helpers for plain calendar dates in YYYY-MM-DD form (no time zones involved).

const DAY_MS = 86_400_000;

export function toEpochDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

export function fromEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

export function diffDays(a: string, b: string): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(date: string): string {
  return `${date.slice(0, 7)}-${String(daysInMonth(date)).padStart(2, '0')}`;
}

export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  const d = Number(date.slice(8, 10));
  const first = new Date(Date.UTC(y, m, 1));
  const ym = first.toISOString().slice(0, 7);
  const dim = daysInMonth(`${ym}-01`);
  return `${ym}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

/** Month keys (YYYY-MM) from the month of `from` to the month of `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = monthStart(from);
  const last = monthKey(to);
  while (monthKey(cur) <= last) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = toEpochDay(from), end = toEpochDay(to); d <= end; d++) out.push(fromEpochDay(d));
  return out;
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Number of whole calendar months the period spans, or 0 if it is not whole months. */
export function wholeMonths(from: string, to: string): number {
  if (from !== monthStart(from) || to !== monthEnd(to)) return 0;
  return monthRange(from, to).length;
}

/** The period of the same length right before [from, to]; whole months shift by months. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const months = wholeMonths(from, to);
  if (months > 0) {
    const prevFrom = addMonths(from, -months);
    return { from: prevFrom, to: addDays(from, -1) };
  }
  const len = diffDays(to, from) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}
