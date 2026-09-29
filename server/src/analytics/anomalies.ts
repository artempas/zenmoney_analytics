import type { Anomalies, CategorySpike, TxLite, UnusualTx } from '@zm/shared';
import { normalizeText } from '../domain/classify.js';
import { addDays, addMonths, monthEnd, monthKey, monthRange, toEpochDay } from '../domain/dates.js';
import {
  loadFlows,
  major,
  median,
  monthsWithData,
  netExpenseBy,
  type AnalyticsCtx,
  type Flow,
} from './base.js';

const LARGEST_LIMIT = 20;
const UNUSUAL_LIMIT = 30;
const HISTORY_DAYS = 180;
const MIN_HISTORY = 5;
/** Ignore "unusual" operations that exceed the usual amount by less than this (minor units). */
const MIN_EXCESS = 10_000;
const SPIKE_RATIO = 1.5;
const SPIKE_MIN_EXCESS = 100_000;
const NEW_CATEGORY_MIN = 300_000;

function lite(f: Flow): TxLite {
  return {
    id: f.id,
    date: f.date,
    category: f.rawCategory,
    payee: f.payee,
    comment: f.comment,
    account: f.account,
    amount: major(f.amount),
  };
}

function isUnusual(amount: number, history: number[]): { median: number } | null {
  if (history.length < MIN_HISTORY) return null;
  const m = median(history);
  const mad = median(history.map((v) => Math.abs(v - m)));
  const threshold = Math.max(3 * m, m + 3 * mad);
  if (m <= 0 || amount <= threshold || amount - m < MIN_EXCESS) return null;
  return { median: m };
}

export function getAnomalies(ctx: AnalyticsCtx, from: string, to: string): Anomalies {
  const flows = loadFlows(ctx, from, to);
  const expenses = flows.filter((f) => f.kind === 'expense');

  const largest = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, LARGEST_LIMIT)
    .map(lite);

  // History window for unusual operations: 180 days before the period.
  const history = loadFlows(ctx, addDays(from, -HISTORY_DAYS), to).filter(
    (f) => f.kind === 'expense',
  );
  const byPayee = new Map<string, Flow[]>();
  const byCategory = new Map<string, Flow[]>();
  const push = (map: Map<string, Flow[]>, key: string, f: Flow) => {
    const list = map.get(key);
    if (list) list.push(f);
    else map.set(key, [f]);
  };
  for (const f of history) {
    if (f.payee) push(byPayee, normalizeText(f.payee), f);
    push(byCategory, f.category, f);
  }
  const before = (list: Flow[] | undefined, f: Flow) => {
    const day = toEpochDay(f.date);
    return (list ?? [])
      .filter(
        (h) =>
          h.id !== f.id && toEpochDay(h.date) < day && day - toEpochDay(h.date) <= HISTORY_DAYS,
      )
      .map((h) => h.amount);
  };

  const unusual: UnusualTx[] = [];
  for (const f of expenses) {
    const payeeHistory = f.payee ? before(byPayee.get(normalizeText(f.payee)), f) : [];
    let basis: UnusualTx['basis'] = 'payee';
    let key = f.payee ?? '';
    let hist = payeeHistory;
    if (payeeHistory.length < MIN_HISTORY) {
      // "Без категории" mixes unrelated operations, so it is no baseline for "usual".
      if (f.rawCategory === null) continue;
      basis = 'category';
      key = f.category;
      hist = before(byCategory.get(f.category), f);
    }
    const hit = isUnusual(f.amount, hist);
    if (!hit) continue;
    unusual.push({
      ...lite(f),
      basis,
      key,
      median: major(hit.median),
      ratio: f.amount / hit.median,
      historyCount: hist.length,
    });
  }
  unusual.sort((a, b) => b.ratio - a.ratio);

  // Category spikes: month spending vs average of up to 3 previous months with data.
  const withData = monthsWithData(ctx.db, ctx.userId);
  const spikes: CategorySpike[] = [];
  for (const month of monthRange(from, to)) {
    if (!withData.has(month)) continue;
    const mFrom = `${month}-01`;
    const current = netExpenseBy(loadFlows(ctx, mFrom, monthEnd(mFrom)), (f) => f.parent);
    const prevMonths: Map<string, number>[] = [];
    for (let k = 1; k <= 3; k++) {
      const pFrom = addMonths(mFrom, -k);
      if (!withData.has(monthKey(pFrom))) continue;
      prevMonths.push(netExpenseBy(loadFlows(ctx, pFrom, monthEnd(pFrom)), (f) => f.parent));
    }
    if (prevMonths.length === 0) continue;
    for (const [category, amount] of current) {
      const baseline =
        prevMonths.reduce((s, m) => s + Math.max(0, m.get(category) ?? 0), 0) / prevMonths.length;
      if (baseline <= 0) {
        if (amount >= NEW_CATEGORY_MIN) {
          spikes.push({
            month,
            category,
            amount: major(amount),
            baseline: 0,
            ratio: null,
            baselineMonths: prevMonths.length,
          });
        }
        continue;
      }
      if (amount >= baseline * SPIKE_RATIO && amount - baseline >= SPIKE_MIN_EXCESS) {
        spikes.push({
          month,
          category,
          amount: major(amount),
          baseline: major(baseline),
          ratio: amount / baseline,
          baselineMonths: prevMonths.length,
        });
      }
    }
  }
  spikes.sort(
    (a, b) => b.month.localeCompare(a.month) || b.amount - b.baseline - (a.amount - a.baseline),
  );

  return { largest, unusual: unusual.slice(0, UNUSUAL_LIMIT), spikes };
}
