import type { CalendarData } from '@zm/shared';
import { eachDay, weekday } from '../domain/dates.js';
import { loadFlows, major, type AnalyticsCtx } from './base.js';

export function getCalendar(ctx: AnalyticsCtx, from: string, to: string): CalendarData {
  const flows = loadFlows(ctx, from, to);
  const byDay = new Map<string, { amount: number; count: number }>();
  const matrix = new Map<string, { amount: number; count: number }>();
  let hasTime = false;

  for (const f of flows) {
    if (f.kind === 'income') continue;
    const day = byDay.get(f.date) ?? { amount: 0, count: 0 };
    if (f.kind === 'expense') {
      day.amount += f.amount;
      day.count += 1;
      if (f.hour !== null) {
        hasTime = true;
        const key = `${weekday(f.date)}:${f.hour}`;
        const cell = matrix.get(key) ?? { amount: 0, count: 0 };
        cell.amount += f.amount;
        cell.count += 1;
        matrix.set(key, cell);
      }
    } else {
      day.amount -= f.amount;
    }
    byDay.set(f.date, day);
  }

  const days = eachDay(from, to).map((date) => {
    const d = byDay.get(date);
    return { date, expense: major(Math.max(0, d?.amount ?? 0)), count: d?.count ?? 0 };
  });

  const wd = Array.from({ length: 7 }, (_, i) => ({ weekday: i, total: 0, days: 0, count: 0 }));
  for (const d of days) {
    const w = wd[weekday(d.date)]!;
    w.total += d.expense;
    w.days += 1;
    w.count += d.count;
  }

  const hourMatrix: CalendarData['hourMatrix'] = [];
  for (const [key, cell] of matrix) {
    const [w, h] = key.split(':').map(Number) as [number, number];
    hourMatrix.push({ weekday: w, hour: h, amount: major(cell.amount), count: cell.count });
  }
  hourMatrix.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);

  return {
    days,
    weekday: wd.map((w) => ({
      weekday: w.weekday,
      total: Math.round(w.total * 100) / 100,
      avg: w.days ? Math.round((w.total / w.days) * 100) / 100 : 0,
      count: w.count,
    })),
    hourMatrix,
    hasTime,
  };
}
