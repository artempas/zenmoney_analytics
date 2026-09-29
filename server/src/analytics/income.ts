import type { IncomeData } from '@zm/shared';
import { diffDays, eachDay, monthKey, monthRange } from '../domain/dates.js';
import { dataRange, loadFlows, major, UNCATEGORIZED, type AnalyticsCtx } from './base.js';

const PASSIVE_UNCATEGORIZED = 'Проценты и кэшбэк (без категории)';

export function getIncome(ctx: AnalyticsCtx, from: string, to: string): IncomeData {
  const flows = loadFlows(ctx, from, to).filter((f) => f.kind === 'income');
  const months = monthRange(from, to);
  const idx = new Map(months.map((m, i) => [m, i]));

  const sources = new Map<string, { passive: boolean; values: number[]; total: number }>();
  const passiveByDay = new Map<string, number>();
  const passiveByAccount = new Map<string, number>();
  let total = 0;
  let passive = 0;

  for (const f of flows) {
    const name = f.rawCategory ?? (f.passive ? PASSIVE_UNCATEGORIZED : UNCATEGORIZED);
    const src = sources.get(name) ?? {
      passive: f.passive,
      values: new Array<number>(months.length).fill(0),
      total: 0,
    };
    src.values[idx.get(monthKey(f.date))!]! += f.amount;
    src.total += f.amount;
    sources.set(name, src);
    total += f.amount;
    if (f.passive) {
      passive += f.amount;
      passiveByDay.set(f.date, (passiveByDay.get(f.date) ?? 0) + f.amount);
      const account = f.account ?? '—';
      passiveByAccount.set(account, (passiveByAccount.get(account) ?? 0) + f.amount);
    }
  }

  // Rates are based on the part of the period that actually has data.
  const lastDataDate = dataRange(ctx.db, ctx.userId).max;
  const effectiveTo = lastDataDate && lastDataDate < to ? lastDataDate : to;
  const periodDays = Math.max(1, diffDays(effectiveTo, from) + 1);

  let acc = 0;
  const passiveCumulative = eachDay(from, effectiveTo < from ? from : effectiveTo).map((date) => {
    acc += passiveByDay.get(date) ?? 0;
    return { date, value: major(acc) };
  });

  return {
    months,
    sources: [...sources.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([source, s]) => ({
        source,
        passive: s.passive,
        values: s.values.map(major),
        total: major(s.total),
      })),
    total: major(total),
    passive: major(passive),
    passiveShare: total > 0 ? passive / total : null,
    passiveMonthlyAvg: major((passive / periodDays) * (365.25 / 12)),
    passiveAnnualRunRate: major((passive / periodDays) * 365),
    passiveCumulative,
    passiveByAccount: [...passiveByAccount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([account, amount]) => ({ account, amount: major(amount) })),
  };
}
