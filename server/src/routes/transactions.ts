import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction, TransactionsResponse, TxType, TypeReason } from '@zm/shared';
import type { Db } from '../db/index.js';
import { reclassifyUser } from '../domain/userState.js';
import { dateSchema, HttpError, parseWith, requireUser } from '../http.js';
import { UNCATEGORIZED } from '../analytics/base.js';

const listSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  type: z.enum(['all', 'expense', 'income', 'transfer', 'refund']).default('all'),
  reason: z.enum(['native', 'paired', 'self', 'savings', 'manual', 'uncategorized']).optional(),
  category: z.string().max(200).optional(),
  account: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(['date', 'amount']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

const patchSchema = z.object({ type: z.enum(['expense', 'income', 'transfer']).nullable() });

interface Row {
  id: number;
  date: string;
  zm_created_at: string | null;
  category: string | null;
  payee: string | null;
  comment: string | null;
  out_account: string | null;
  out_amount: number | null;
  out_currency: string | null;
  in_account: string | null;
  in_amount: number | null;
  in_currency: string | null;
  raw_type: TxType;
  type: TxType;
  reason: TypeReason;
  pair_id: number | null;
  is_refund: number;
}

const COLUMNS = `id, date, zm_created_at, category, payee, comment, out_account, out_amount, out_currency,
  in_account, in_amount, in_currency, raw_type, type, reason, pair_id, is_refund`;

function toDto(r: Row): Transaction {
  return {
    id: r.id,
    date: r.date,
    time:
      r.zm_created_at && r.zm_created_at.slice(0, 10) === r.date
        ? r.zm_created_at.slice(11, 16)
        : null,
    category: r.category,
    payee: r.payee,
    comment: r.comment,
    outAccount: r.out_account,
    outAmount: r.out_amount === null ? null : r.out_amount / 100,
    outCurrency: r.out_currency,
    inAccount: r.in_account,
    inAmount: r.in_amount === null ? null : r.in_amount / 100,
    inCurrency: r.in_currency,
    rawType: r.raw_type,
    type: r.type,
    reason: r.reason,
    pairId: r.pair_id,
    isRefund: r.is_refund === 1,
  };
}

export async function transactionRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get('/api/transactions', async (request): Promise<TransactionsResponse> => {
    const me = requireUser(request);
    const q = parseWith(listSchema, request.query);
    const where: string[] = ['user_id = ?'];
    const params: unknown[] = [me.id];
    const add = (clause: string, ...values: unknown[]) => {
      where.push(clause);
      params.push(...values);
    };
    if (q.from) add('date >= ?', q.from);
    if (q.to) add('date <= ?', q.to);
    if (q.type === 'refund') add('is_refund = 1');
    else if (q.type === 'income') add("type = 'income' AND is_refund = 0");
    else if (q.type !== 'all') add('type = ?', q.type);
    if (q.reason) add('reason = ?', q.reason);
    if (q.category === UNCATEGORIZED) add("category IS NULL AND type != 'transfer'");
    else if (q.category) add('(category = ? OR category_parent = ?)', q.category, q.category);
    if (q.account) add('(out_account = ? OR in_account = ?)', q.account, q.account);
    if (q.q) {
      const like = `%${q.q
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      add(
        "(ulower(payee) LIKE ? ESCAPE '\\' OR ulower(comment) LIKE ? ESCAPE '\\' OR ulower(category) LIKE ? ESCAPE '\\')",
        like,
        like,
        like,
      );
    }
    const whereSql = where.join(' AND ');
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    const orderSql =
      q.sort === 'amount'
        ? `COALESCE(out_amount, in_amount) ${order}, date DESC, id DESC`
        : `date ${order}, zm_created_at ${order}, id ${order}`;
    const total = (
      db.$client
        .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE ${whereSql}`)
        .get(...params) as {
        n: number;
      }
    ).n;
    const rows = db.$client
      .prepare(
        `SELECT ${COLUMNS} FROM transactions WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      )
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Row[];
    return { items: rows.map(toDto), total, page: q.page, pageSize: q.pageSize };
  });

  app.patch<{ Params: { id: string } }>('/api/transactions/:id', async (request) => {
    const me = requireUser(request);
    const { type } = parseWith(patchSchema, request.body);
    const tx = db.$client
      .prepare('SELECT fingerprint FROM transactions WHERE id = ? AND user_id = ?')
      .get(Number(request.params.id), me.id) as { fingerprint: string } | undefined;
    if (!tx) throw new HttpError(404, 'Операция не найдена');
    if (type === null) {
      db.$client
        .prepare('DELETE FROM overrides WHERE user_id = ? AND fingerprint = ?')
        .run(me.id, tx.fingerprint);
    } else {
      db.$client
        .prepare(
          `INSERT INTO overrides (user_id, fingerprint, type) VALUES (?, ?, ?)
           ON CONFLICT (user_id, fingerprint) DO UPDATE SET type = excluded.type`,
        )
        .run(me.id, tx.fingerprint, type);
    }
    reclassifyUser(db, me.id);
    const row = db.$client
      .prepare(`SELECT ${COLUMNS} FROM transactions WHERE id = ?`)
      .get(Number(request.params.id)) as Row;
    return toDto(row);
  });
}
