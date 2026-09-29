import crypto from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { ImportResult } from '@zm/shared';
import type { Db } from '../db/index.js';
import { accounts, imports, transactions, type NewTransactionRow } from '../db/schema.js';
import { detectAccountKind } from '../domain/classify.js';
import { reclassifyUser } from '../domain/userState.js';
import { ImportError, type ParsedRow } from './parseZenmoney.js';

export function fingerprintOf(row: ParsedRow): string {
  const key = [
    row.date,
    row.zmCreatedAt ?? '',
    row.outAccount ?? '',
    row.outAmount ?? '',
    row.inAccount ?? '',
    row.inAmount ?? '',
    row.payee ?? '',
  ].join('|');
  return crypto.createHash('sha1').update(key).digest('hex');
}

/**
 * Replaces all transactions of the user within the date range covered by the file
 * with the rows from the file, then re-runs classification.
 */
export function importTransactions(
  db: Db,
  userId: number,
  filename: string,
  rows: ParsedRow[],
): ImportResult {
  if (rows.length === 0) throw new ImportError('В файле нет ни одной операции');
  const dates = rows.map((r) => r.date).sort();
  const dateFrom = dates[0]!;
  const dateTo = dates[dates.length - 1]!;

  return db.transaction((tx) => {
    const inRange = and(
      eq(transactions.userId, userId),
      gte(transactions.date, dateFrom),
      lte(transactions.date, dateTo),
    );
    const replaced =
      tx
        .select({ n: sql<number>`count(*)` })
        .from(transactions)
        .where(inRange)
        .get()?.n ?? 0;
    tx.delete(transactions).where(inRange).run();

    const importRow = tx
      .insert(imports)
      .values({
        userId,
        filename,
        uploadedAt: new Date().toISOString(),
        dateFrom,
        dateTo,
        rows: rows.length,
        replaced,
      })
      .returning({ id: imports.id })
      .get();

    const seen = new Map<string, number>();
    const values: NewTransactionRow[] = rows.map((r) => {
      const base = fingerprintOf(r);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return {
        userId,
        importId: importRow.id,
        date: r.date,
        zmCreatedAt: r.zmCreatedAt,
        zmChangedAt: r.zmChangedAt,
        category: r.category,
        categoryParent: r.categoryParent,
        payee: r.payee,
        comment: r.comment,
        outAccount: r.outAccount,
        outAmount: r.outAmount,
        outCurrency: r.outCurrency,
        inAccount: r.inAccount,
        inAmount: r.inAmount,
        inCurrency: r.inCurrency,
        rawType: r.rawType,
        type: r.rawType,
        reason: 'native',
        pairId: null,
        isRefund: false,
        fingerprint: n === 0 ? base : `${base}#${n}`,
      };
    });
    for (let i = 0; i < values.length; i += 500) {
      tx.insert(transactions)
        .values(values.slice(i, i + 500))
        .run();
    }

    const existing = new Set(
      tx
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .all()
        .map((a) => a.name),
    );
    const newAccounts: string[] = [];
    for (const r of rows) {
      for (const name of [r.outAccount, r.inAccount]) {
        if (name && !existing.has(name)) {
          existing.add(name);
          newAccounts.push(name);
        }
      }
    }
    if (newAccounts.length) {
      tx.insert(accounts)
        .values(
          newAccounts.map((name) => ({
            userId,
            name,
            kind: detectAccountKind(name),
            kindAuto: true,
          })),
        )
        .run();
    }

    // Same connection, so this runs inside the surrounding transaction.
    reclassifyUser(db, userId);

    return { importId: importRow.id, dateFrom, dateTo, rows: rows.length, replaced, newAccounts };
  });
}
