import type { Monthly } from '@zm/shared';
import { addMonths, monthEnd, monthKey, monthRange, monthStart } from '../domain/dates.js';
import { dataRange, loadFlows, major, type AnalyticsCtx, type Flow } from './base.js';

// 7 categorical hues + a neutral "Прочее" keeps the stack within the 8-slot palette.
const MAX_PARENTS = 7;
const OTHER = 'Прочее';

function seriesBy(
  flows: Flow[],
  months: string[],
  key: (f: Flow) => string,
): Map<string, number[]> {
  const idx = new Map(months.map((m, i) => [m, i]));
  const map = new Map<string, number[]>();
  for (const f of flows) {
    if (f.kind === 'income') continue;
    const i = idx.get(monthKey(f.date));
    if (i === undefined) continue;
    const k = key(f);
    const arr = map.get(k) ?? new Array<number>(months.length).fill(0);
    arr[i]! += f.kind === 'expense' ? f.amount : -f.amount;
    map.set(k, arr);
  }
  return map;
}

function toMajorSeries(
  map: Map<string, number[]>,
): { category: string; values: number[]; total: number }[] {
  return [...map.entries()]
    .map(([category, values]) => ({
      category,
      values: values.map((v) => major(Math.max(0, v))),
      total: values.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Income/expense by month for `months` months ending with the month of `to`. */
export function getMonthly(ctx: AnalyticsCtx, to: string, monthsCount: number): Monthly {
  const range = dataRange(ctx.db, ctx.userId);
  let from = monthStart(addMonths(monthStart(to), -(monthsCount - 1)));
  if (range.min && from < monthStart(range.min)) from = monthStart(range.min);
  const end = monthEnd(to);
  if (from > end) from = monthStart(to);
  const months = monthRange(from, end);
  const flows = loadFlows(ctx, from, end);

  const income = new Array<number>(months.length).fill(0);
  const expense = new Array<number>(months.length).fill(0);
  const idx = new Map(months.map((m, i) => [m, i]));
  for (const f of flows) {
    const i = idx.get(monthKey(f.date));
    if (i === undefined) continue;
    if (f.kind === 'income') income[i]! += f.amount;
    else if (f.kind === 'expense') expense[i]! += f.amount;
    else expense[i]! -= f.amount;
  }
  const net = months.map((_, i) => income[i]! - expense[i]!);
  let acc = 0;
  const cumulative = net.map((n) => (acc += n));

  const parents = toMajorSeries(seriesBy(flows, months, (f) => f.parent));
  const top = parents.slice(0, MAX_PARENTS);
  const rest = parents.slice(MAX_PARENTS);
  const byParent = top.map(({ category, values }) => ({ category, values }));
  if (rest.length) {
    byParent.push({
      category: OTHER,
      values: months.map(
        (_, i) => Math.round(rest.reduce((s, r) => s + r.values[i]! * 100, 0)) / 100,
      ),
    });
  }

  // Parents and subcategories, for the category trend selector.
  const full = toMajorSeries(seriesBy(flows, months, (f) => f.category));
  const byCategory = [
    ...parents,
    ...full.filter((c) => !parents.some((p) => p.category === c.category)),
  ]
    .map(({ category, values }) => ({ category, values }))
    .sort((a, b) => a.category.localeCompare(b.category, 'ru'));

  return {
    months,
    income: income.map(major),
    expense: expense.map((v) => major(Math.max(0, v))),
    net: net.map(major),
    cumulative: cumulative.map(major),
    byParent,
    byCategory,
  };
}
