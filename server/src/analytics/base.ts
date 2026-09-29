import type { Db } from '../db/index.js';
import {
  effectivePassiveCategories,
  getIncomeCategories,
  getSavingsAccounts,
  getSettings,
  PASSIVE_PATTERN,
} from '../domain/userState.js';

export const UNCATEGORIZED = 'Без категории';

export interface AnalyticsCtx {
  db: Db;
  userId: number;
  /** Server's current date (YYYY-MM-DD), used to tell whether a period is still in progress. */
  today: string;
  currency: string;
  includeUncategorized: boolean;
  passiveCategories: Set<string>;
  savingsAccounts: Set<string>;
}

/** A money movement that affects income/expense analytics. Amounts are in minor units. */
export interface Flow {
  id: number;
  date: string;
  /** HH (0-23) from ZenMoney's createdDate when it falls on the operation date. */
  hour: number | null;
  kind: 'expense' | 'refund' | 'income';
  category: string;
  parent: string;
  rawCategory: string | null;
  payee: string | null;
  comment: string | null;
  account: string | null;
  amount: number;
  uncategorized: boolean;
  passive: boolean;
}

export interface TransferLeg {
  date: string;
  outAccount: string | null;
  outAmount: number | null;
  inAccount: string | null;
  inAmount: number | null;
}

interface TxDbRow {
  id: number;
  date: string;
  zm_created_at: string | null;
  category: string | null;
  category_parent: string | null;
  payee: string | null;
  comment: string | null;
  out_account: string | null;
  out_amount: number | null;
  out_currency: string | null;
  in_account: string | null;
  in_amount: number | null;
  in_currency: string | null;
  type: 'expense' | 'income' | 'transfer';
  reason: string;
  is_refund: number;
}

export function buildCtx(
  db: Db,
  userId: number,
  currency: string | undefined,
  now: Date,
): AnalyticsCtx {
  const s = getSettings(db, userId);
  const passive = effectivePassiveCategories(s, getIncomeCategories(db, userId));
  return {
    db,
    userId,
    today: now.toISOString().slice(0, 10),
    currency: currency ?? defaultCurrency(db, userId) ?? 'RUB',
    includeUncategorized: s.includeUncategorized,
    passiveCategories: new Set(passive),
    savingsAccounts: getSavingsAccounts(db, userId),
  };
}

export function defaultCurrency(db: Db, userId: number): string | null {
  const row = db.$client
    .prepare(
      `SELECT cur, COUNT(*) AS n FROM (
         SELECT out_currency AS cur FROM transactions WHERE user_id = ? AND out_currency IS NOT NULL
         UNION ALL
         SELECT in_currency FROM transactions WHERE user_id = ? AND in_currency IS NOT NULL
       ) GROUP BY cur ORDER BY n DESC LIMIT 1`,
    )
    .get(userId, userId) as { cur: string } | undefined;
  return row?.cur ?? null;
}

export function dataRange(db: Db, userId: number): { min: string | null; max: string | null } {
  const row = db.$client
    .prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM transactions WHERE user_id = ?')
    .get(userId) as { min: string | null; max: string | null };
  return row;
}

/** Months (YYYY-MM) in which the user has at least one transaction. */
export function monthsWithData(db: Db, userId: number): Set<string> {
  const rows = db.$client
    .prepare('SELECT DISTINCT substr(date, 1, 7) AS m FROM transactions WHERE user_id = ?')
    .all(userId) as { m: string }[];
  return new Set(rows.map((r) => r.m));
}

function hourOf(row: TxDbRow): number | null {
  if (!row.zm_created_at || row.zm_created_at.slice(0, 10) !== row.date) return null;
  const h = Number(row.zm_created_at.slice(11, 13));
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
}

function isPassiveIncome(ctx: AnalyticsCtx, row: TxDbRow): boolean {
  if (row.category !== null) return ctx.passiveCategories.has(row.category);
  return PASSIVE_PATTERN.test(`${row.payee ?? ''} ${row.comment ?? ''}`);
}

function selectRows(ctx: AnalyticsCtx, from: string, to: string, types: string[]): TxDbRow[] {
  const placeholders = types.map(() => '?').join(',');
  return ctx.db.$client
    .prepare(
      `SELECT id, date, zm_created_at, category, category_parent, payee, comment,
              out_account, out_amount, out_currency, in_account, in_amount, in_currency,
              type, reason, is_refund
       FROM transactions
       WHERE user_id = ? AND date >= ? AND date <= ? AND type IN (${placeholders})
       ORDER BY date, id`,
    )
    .all(ctx.userId, from, to, ...types) as TxDbRow[];
}

/** Income, expense and refund flows in [from, to] for the context currency. */
export function loadFlows(ctx: AnalyticsCtx, from: string, to: string): Flow[] {
  const flows: Flow[] = [];
  for (const row of selectRows(ctx, from, to, ['expense', 'income'])) {
    const uncategorized = row.reason === 'uncategorized';
    if (uncategorized && !ctx.includeUncategorized) continue;
    const isExpense = row.type === 'expense';
    // Effective expense is paid from the outgoing side; overrides may flip a one-sided row.
    const amount = isExpense
      ? (row.out_amount ?? row.in_amount)
      : (row.in_amount ?? row.out_amount);
    const currency = isExpense
      ? (row.out_currency ?? row.in_currency)
      : (row.in_currency ?? row.out_currency);
    const account = isExpense
      ? (row.out_account ?? row.in_account)
      : (row.in_account ?? row.out_account);
    if (!amount || currency !== ctx.currency) continue;
    const category = row.category ?? UNCATEGORIZED;
    const kind: Flow['kind'] = isExpense ? 'expense' : row.is_refund ? 'refund' : 'income';
    flows.push({
      id: row.id,
      date: row.date,
      hour: hourOf(row),
      kind,
      category,
      parent: row.category_parent ?? category,
      rawCategory: row.category,
      payee: row.payee,
      comment: row.comment,
      account,
      amount,
      uncategorized,
      passive: kind === 'income' && isPassiveIncome(ctx, row),
    });
  }
  return flows;
}

export function loadTransfers(ctx: AnalyticsCtx, from: string, to: string): TransferLeg[] {
  return selectRows(ctx, from, to, ['transfer']).map((row) => ({
    date: row.date,
    outAccount: row.out_currency === ctx.currency ? row.out_account : null,
    outAmount: row.out_currency === ctx.currency ? row.out_amount : null,
    inAccount: row.in_currency === ctx.currency ? row.in_account : null,
    inAmount: row.in_currency === ctx.currency ? row.in_amount : null,
  }));
}

/** Rounds minor units to major units with 2 decimals. */
export function major(minor: number): number {
  return Math.round(minor) / 100;
}

export function sumBy<T>(items: readonly T[], fn: (item: T) => number): number {
  let s = 0;
  for (const i of items) s += fn(i);
  return s;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Net expense (expenses minus refunds) per key. */
export function netExpenseBy(
  flows: readonly Flow[],
  key: (f: Flow) => string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const f of flows) {
    if (f.kind === 'income') continue;
    const k = key(f);
    map.set(k, (map.get(k) ?? 0) + (f.kind === 'expense' ? f.amount : -f.amount));
  }
  return map;
}

export function totals(flows: readonly Flow[]): {
  income: number;
  expense: number;
  refunds: number;
} {
  let income = 0;
  let expense = 0;
  let refunds = 0;
  for (const f of flows) {
    if (f.kind === 'income') income += f.amount;
    else if (f.kind === 'expense') expense += f.amount;
    else refunds += f.amount;
  }
  return { income, expense: expense - refunds, refunds };
}
