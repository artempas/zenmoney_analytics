import type { AccountKind, TxType, TypeReason } from '@zm/shared';
import { toEpochDay } from './dates.js';

export interface ClassifyRow {
  id: number;
  date: string;
  zmCreatedAt: string | null;
  category: string | null;
  payee: string | null;
  comment: string | null;
  outAccount: string | null;
  outAmount: number | null;
  outCurrency: string | null;
  inAccount: string | null;
  inAmount: number | null;
  inCurrency: string | null;
  rawType: TxType;
  fingerprint: string;
}

export interface ClassifyContext {
  selfNames: string[];
  savingsAccounts: ReadonlySet<string>;
  overrides: ReadonlyMap<string, TxType>;
}

export interface Classification {
  type: TxType;
  reason: TypeReason;
  pairId: number | null;
  isRefund: boolean;
}

/** Counter operations must be at most this many days apart to form a transfer pair. */
export const PAIR_MAX_DAYS = 3;
/** Relative amount difference allowed for a pair (bank commissions). */
export const PAIR_TOLERANCE = 0.05;
/** Non-exact pairs are only considered for amounts of at least this many minor units. */
export const PAIR_TOLERANCE_MIN_AMOUNT = 100_000;

/** Categories that are income by nature even if something was once spent from them. */
export const INCOME_CATEGORY_PATTERN =
  /зарплат|заработ|доход|процент|кэшб|кешб|cashback|преми|аванс|дивиденд|купон|подработ|фриланс|гонорар|стипенд|пенси|пособи|вычет|salary|income/i;

export const SAVINGS_ACCOUNT_PATTERN =
  /накоп|вклад|копилк|депозит|брокер|сбережен|invest|saving|deposit|\d+(?:[.,]\d+)?\s*%/i;

export function detectAccountKind(name: string): AccountKind {
  return SAVINGS_ACCOUNT_PATTERN.test(name) ? 'savings' : 'regular';
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function createdSeconds(row: ClassifyRow): number {
  if (!row.zmCreatedAt) return toEpochDay(row.date) * 86_400;
  return Date.parse(`${row.zmCreatedAt.replace(' ', 'T')}Z`) / 1000;
}

/**
 * Decides the effective type of every transaction:
 *   manual override → native (categorized or two-sided) → counter-operation pair →
 *   "transfer to self" by name → operation on a savings account → uncategorized income/expense.
 * Then marks incomes in categories used for spending as refunds.
 */
export function classify(
  rows: readonly ClassifyRow[],
  ctx: ClassifyContext,
): Map<number, Classification> {
  const result = new Map<number, Classification>();
  const pending: ClassifyRow[] = [];

  for (const row of rows) {
    const override = ctx.overrides.get(row.fingerprint);
    if (override) {
      result.set(row.id, { type: override, reason: 'manual', pairId: null, isRefund: false });
    } else if (row.rawType === 'transfer' || row.category !== null) {
      result.set(row.id, { type: row.rawType, reason: 'native', pairId: null, isRefund: false });
    } else {
      pending.push(row);
    }
  }

  // 1. Pair uncategorized one-sided expenses with uncategorized one-sided incomes.
  const outs = pending.filter((r) => r.rawType === 'expense');
  const ins = pending.filter((r) => r.rawType === 'income');
  const candidates: {
    out: ClassifyRow;
    inc: ClassifyRow;
    rel: number;
    days: number;
    secs: number;
  }[] = [];
  for (const out of outs) {
    const outAmount = out.outAmount ?? 0;
    const outDay = toEpochDay(out.date);
    for (const inc of ins) {
      if (inc.inCurrency !== out.outCurrency || inc.inAccount === out.outAccount) continue;
      const days = Math.abs(toEpochDay(inc.date) - outDay);
      if (days > PAIR_MAX_DAYS) continue;
      const inAmount = inc.inAmount ?? 0;
      const rel = Math.abs(outAmount - inAmount) / Math.max(outAmount, inAmount);
      if (rel > 0) {
        if (rel > PAIR_TOLERANCE) continue;
        if (Math.min(outAmount, inAmount) < PAIR_TOLERANCE_MIN_AMOUNT) continue;
      }
      candidates.push({
        out,
        inc,
        rel,
        days,
        secs: Math.abs(createdSeconds(out) - createdSeconds(inc)),
      });
    }
  }
  candidates.sort(
    (a, b) => a.rel - b.rel || a.days - b.days || a.secs - b.secs || a.out.id - b.out.id,
  );
  const paired = new Set<number>();
  for (const c of candidates) {
    if (paired.has(c.out.id) || paired.has(c.inc.id)) continue;
    paired.add(c.out.id);
    paired.add(c.inc.id);
    const pairId = Math.min(c.out.id, c.inc.id);
    result.set(c.out.id, { type: 'transfer', reason: 'paired', pairId, isRefund: false });
    result.set(c.inc.id, { type: 'transfer', reason: 'paired', pairId, isRefund: false });
  }

  // 2. Remaining uncategorized one-sided operations.
  const names = ctx.selfNames.map(normalizeText).filter((n) => n.length >= 2);
  for (const row of pending) {
    if (paired.has(row.id)) continue;
    const text = normalizeText(`${row.payee ?? ''} | ${row.comment ?? ''}`);
    const account = row.rawType === 'expense' ? row.outAccount : row.inAccount;
    if (names.some((n) => text.includes(n))) {
      result.set(row.id, { type: 'transfer', reason: 'self', pairId: null, isRefund: false });
    } else if (account !== null && ctx.savingsAccounts.has(account)) {
      result.set(row.id, { type: 'transfer', reason: 'savings', pairId: null, isRefund: false });
    } else {
      result.set(row.id, {
        type: row.rawType,
        reason: 'uncategorized',
        pairId: null,
        isRefund: false,
      });
    }
  }

  // 3. Refunds: incomes in categories that are also used for spending (friends paying back,
  // purchase returns). Categories without expenses or named like income stay income.
  const spentFrom = new Set<string>();
  for (const row of rows) {
    if (row.category !== null && result.get(row.id)?.type === 'expense')
      spentFrom.add(row.category);
  }
  for (const row of rows) {
    const c = result.get(row.id);
    if (!c || c.type !== 'income' || row.category === null) continue;
    if (spentFrom.has(row.category) && !INCOME_CATEGORY_PATTERN.test(row.category))
      c.isRefund = true;
  }

  return result;
}
