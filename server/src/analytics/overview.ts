import type { Overview, PeriodTotals } from '@zm/shared';
import {
  addMonths,
  daysInMonth,
  diffDays,
  eachDay,
  monthEnd,
  monthKey,
  previousPeriod,
  wholeMonths,
} from '../domain/dates.js';
import {
  dataRange,
  loadFlows,
  major,
  monthsWithData,
  netExpenseBy,
  quantile,
  totals,
  type AnalyticsCtx,
  type Flow,
} from './base.js';

function periodTotals(flows: Flow[]): PeriodTotals {
  const t = totals(flows);
  const savings = t.income - t.expense;
  return {
    income: major(t.income),
    expense: major(t.expense),
    savings: major(savings),
    savingsRate: t.income > 0 ? savings / t.income : null,
  };
}

function dailyNetExpense(flows: Flow[]): Map<string, number> {
  return netExpenseBy(flows, (f) => f.date);
}

function cumulativeSeries(
  days: string[],
  daily: Map<string, number>,
  until: string | null,
): (number | null)[] {
  let acc = 0;
  return days.map((d) => {
    if (until !== null && d > until) return null;
    acc += daily.get(d) ?? 0;
    return major(acc);
  });
}

export function getOverview(ctx: AnalyticsCtx, from: string, to: string): Overview {
  const prev = previousPeriod(from, to);
  const flows = loadFlows(ctx, from, to);
  const prevFlows = loadFlows(ctx, prev.from, prev.to);
  const current = periodTotals(flows);
  const range = dataRange(ctx.db, ctx.userId);
  const lastDataDate = range.max;
  const t = totals(flows);

  // Uncategorized amounts are reported even when excluded, so the UI can explain the toggle.
  const withUncategorized = ctx.includeUncategorized
    ? flows
    : loadFlows({ ...ctx, includeUncategorized: true }, from, to);
  const uncategorized = { income: 0, expense: 0, included: ctx.includeUncategorized };
  for (const f of withUncategorized) {
    if (!f.uncategorized) continue;
    if (f.kind === 'expense') uncategorized.expense += f.amount;
    else if (f.kind === 'income') uncategorized.income += f.amount;
  }

  const isSingleMonth = wholeMonths(from, to) === 1;
  // For a period that is still in progress, the data ends at the latest uploaded operation.
  const inProgress = ctx.today >= from && ctx.today < to;
  const asOf =
    inProgress && lastDataDate !== null && lastDataDate >= from
      ? lastDataDate < ctx.today
        ? lastDataDate
        : ctx.today
      : null;

  // Forecast of the month's spending when the data ends in the middle of the selected month.
  let forecast: Overview['forecast'] = null;
  if (isSingleMonth && asOf !== null) {
    const daily = dailyNetExpense(flows);
    const elapsed = eachDay(from, asOf).map((d) => Math.max(0, daily.get(d) ?? 0));
    // Winsorize at P90 so that single large purchases don't inflate the daily pace.
    const cap = quantile(elapsed, 0.9);
    const dailyRate = elapsed.reduce((s, v) => s + Math.min(v, cap), 0) / elapsed.length;
    const spent = elapsed.reduce((s, v) => s + v, 0);
    const remaining = diffDays(to, asOf);
    forecast = {
      asOf,
      monthEnd: to,
      spent: major(spent),
      projected: major(spent + dailyRate * remaining),
      dailyRate: major(dailyRate),
    };
  }

  // Cumulative spending: month vs average of up to 3 previous months with data, otherwise vs previous period.
  let cumulative: Overview['cumulative'];
  if (isSingleMonth) {
    const dim = daysInMonth(from);
    const labels = Array.from({ length: dim }, (_, i) => String(i + 1));
    const days = eachDay(from, to);
    const currentSeries = cumulativeSeries(days, dailyNetExpense(flows), asOf);
    const withData = monthsWithData(ctx.db, ctx.userId);
    const baselines: number[][] = [];
    for (let k = 1; k <= 3; k++) {
      const mFrom = addMonths(from, -k);
      if (!withData.has(monthKey(mFrom))) continue;
      const mTo = monthEnd(mFrom);
      const mDaily = dailyNetExpense(loadFlows(ctx, mFrom, mTo));
      const mDays = eachDay(mFrom, mTo);
      const series = cumulativeSeries(mDays, mDaily, null) as number[];
      // Align by day of month; shorter months carry their last value.
      baselines.push(labels.map((_, i) => series[Math.min(i, series.length - 1)] ?? 0));
    }
    cumulative = {
      labels,
      current: currentSeries,
      baseline: labels.map((_, i) =>
        baselines.length
          ? Math.round((baselines.reduce((s, b) => s + b[i]!, 0) / baselines.length) * 100) / 100
          : null,
      ),
      baselineLabel: baselines.length
        ? `Среднее за ${baselines.length} ${baselines.length === 1 ? 'предыдущий месяц' : 'предыдущих месяца'}`
        : '',
    };
  } else {
    const days = eachDay(from, to);
    const prevDays = eachDay(prev.from, prev.to);
    const prevSeries = cumulativeSeries(prevDays, dailyNetExpense(prevFlows), null);
    cumulative = {
      labels: days,
      current: cumulativeSeries(days, dailyNetExpense(flows), asOf),
      baseline: days.map((_, i) => prevSeries[i] ?? null),
      baselineLabel: 'Предыдущий период',
    };
  }

  const byParent = netExpenseBy(flows, (f) => f.parent);
  const topCategories = [...byParent.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount: major(amount),
      share: t.expense > 0 ? amount / t.expense : 0,
    }));

  return {
    from,
    to,
    prevFrom: prev.from,
    prevTo: prev.to,
    ...current,
    prev: periodTotals(prevFlows),
    refunds: major(t.refunds),
    uncategorized: {
      income: major(uncategorized.income),
      expense: major(uncategorized.expense),
      included: uncategorized.included,
    },
    forecast,
    cumulative,
    topCategories,
    lastDataDate,
  };
}
