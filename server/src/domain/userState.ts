import { eq } from 'drizzle-orm';
import type { Settings, TxType } from '@zm/shared';
import type { Db } from '../db/index.js';
import { accounts, overrides, settings, transactions } from '../db/schema.js';
import { classify, type ClassifyRow } from './classify.js';

export const PASSIVE_PATTERN = /процент|кэшб|кешб|cashback|дивиденд|купон/i;

export function getSettings(db: Db, userId: number): Settings {
  const row = db.select().from(settings).where(eq(settings.userId, userId)).get();
  if (!row) {
    db.insert(settings).values({ userId }).onConflictDoNothing().run();
    return { selfNames: [], includeUncategorized: true, passiveCategories: null };
  }
  return {
    selfNames: row.selfNames ?? [],
    includeUncategorized: row.includeUncategorized,
    passiveCategories: row.passiveCategories ?? null,
  };
}

export function getSavingsAccounts(db: Db, userId: number): Set<string> {
  const rows = db
    .select({ name: accounts.name, kind: accounts.kind })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .all();
  return new Set(rows.filter((r) => r.kind === 'savings').map((r) => r.name));
}

/** Income categories (categories that have at least one non-refund income). */
export function getIncomeCategories(db: Db, userId: number): string[] {
  const rows = db.$client
    .prepare(
      `SELECT DISTINCT category FROM transactions
       WHERE user_id = ? AND type = 'income' AND is_refund = 0 AND category IS NOT NULL
       ORDER BY category`,
    )
    .all(userId) as { category: string }[];
  return rows.map((r) => r.category);
}

export function effectivePassiveCategories(s: Settings, incomeCategories: string[]): string[] {
  if (s.passiveCategories !== null) return s.passiveCategories;
  return incomeCategories.filter((c) => PASSIVE_PATTERN.test(c));
}

/** Re-runs classification for all transactions of the user and stores the result. */
export function reclassifyUser(db: Db, userId: number): void {
  const s = getSettings(db, userId);
  const savingsAccounts = getSavingsAccounts(db, userId);
  const overrideRows = db
    .select({ fingerprint: overrides.fingerprint, type: overrides.type })
    .from(overrides)
    .where(eq(overrides.userId, userId))
    .all();
  const overrideMap = new Map<string, TxType>(overrideRows.map((o) => [o.fingerprint, o.type]));

  const rows: ClassifyRow[] = db
    .select({
      id: transactions.id,
      date: transactions.date,
      zmCreatedAt: transactions.zmCreatedAt,
      category: transactions.category,
      payee: transactions.payee,
      comment: transactions.comment,
      outAccount: transactions.outAccount,
      outAmount: transactions.outAmount,
      outCurrency: transactions.outCurrency,
      inAccount: transactions.inAccount,
      inAmount: transactions.inAmount,
      inCurrency: transactions.inCurrency,
      rawType: transactions.rawType,
      fingerprint: transactions.fingerprint,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .all();

  const result = classify(rows, {
    selfNames: s.selfNames,
    savingsAccounts,
    overrides: overrideMap,
  });
  const update = db.$client.prepare(
    'UPDATE transactions SET type = ?, reason = ?, pair_id = ?, is_refund = ? WHERE id = ?',
  );
  db.$client.transaction(() => {
    for (const [id, c] of result) update.run(c.type, c.reason, c.pairId, c.isRefund ? 1 : 0, id);
  })();
}
