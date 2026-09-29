// Calendar-date helpers for YYYY-MM-DD strings (mirrors server/src/domain/dates.ts).

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

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(date: string): number {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
}

export function monthEnd(date: string): string {
  return `${date.slice(0, 7)}-${String(daysInMonth(date)).padStart(2, '0')}`;
}

export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  const ym = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const d = Math.min(Number(date.slice(8, 10)), daysInMonth(`${ym}-01`));
  return `${ym}-${String(d).padStart(2, '0')}`;
}

/** Month keys (YYYY-MM) between two dates inclusive, newest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = monthStart(to);
  while (cur >= monthStart(from)) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, -1);
  }
  return out;
}

export function isWholeMonth(from: string, to: string): boolean {
  return from === monthStart(from) && to === monthEnd(from);
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
