import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Meta } from '@zm/shared';
import { getAnomalies } from '../analytics/anomalies.js';
import { buildCtx, dataRange, defaultCurrency } from '../analytics/base.js';
import { getCalendar } from '../analytics/calendar.js';
import { getFlow } from '../analytics/flow.js';
import { getIncome } from '../analytics/income.js';
import { getMonthly } from '../analytics/monthly.js';
import { getOverview } from '../analytics/overview.js';
import type { Db } from '../db/index.js';
import { diffDays } from '../domain/dates.js';
import { dateSchema, HttpError, parseWith, requireUser } from '../http.js';

const MAX_PERIOD_DAYS = 3700;

const periodSchema = z
  .object({ from: dateSchema, to: dateSchema, currency: z.string().max(10).optional() })
  .refine((q) => q.from <= q.to, 'from должен быть не позже to');

const monthlySchema = z.object({
  to: dateSchema,
  months: z.coerce.number().int().min(1).max(120).default(12),
  currency: z.string().max(10).optional(),
});

export async function analyticsRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date }) {
  const { db, now } = opts;

  const period = (query: unknown) => {
    const q = parseWith(periodSchema, query);
    if (diffDays(q.to, q.from) > MAX_PERIOD_DAYS)
      throw new HttpError(400, 'Слишком длинный период');
    return q;
  };

  app.get('/api/meta', async (request): Promise<Meta> => {
    const me = requireUser(request);
    const range = dataRange(db, me.id);
    const all = (sql: string, ...params: unknown[]) =>
      (db.$client.prepare(sql).all(me.id, ...params) as { v: string }[]).map((r) => r.v);
    const currencies = all(
      `SELECT v FROM (SELECT out_currency AS v FROM transactions WHERE user_id = ? AND out_currency IS NOT NULL
                      UNION ALL SELECT in_currency FROM transactions WHERE user_id = ? AND in_currency IS NOT NULL)
       GROUP BY v ORDER BY COUNT(*) DESC`,
      me.id,
    );
    const categories = all(
      `SELECT DISTINCT category AS v FROM transactions WHERE user_id = ? AND category IS NOT NULL ORDER BY category`,
    );
    const accounts = all(`SELECT name AS v FROM accounts WHERE user_id = ? ORDER BY name`);
    const txCount = (
      db.$client.prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?').get(me.id) as {
        n: number;
      }
    ).n;
    return {
      dateFrom: range.min,
      dateTo: range.max,
      currencies,
      defaultCurrency: defaultCurrency(db, me.id),
      categories,
      accounts,
      txCount,
    };
  });

  app.get('/api/analytics/overview', async (request) => {
    const me = requireUser(request);
    const q = period(request.query);
    return getOverview(buildCtx(db, me.id, q.currency, now()), q.from, q.to);
  });

  app.get('/api/analytics/monthly', async (request) => {
    const me = requireUser(request);
    const q = parseWith(monthlySchema, request.query);
    return getMonthly(buildCtx(db, me.id, q.currency, now()), q.to, q.months);
  });

  app.get('/api/analytics/calendar', async (request) => {
    const me = requireUser(request);
    const q = period(request.query);
    return getCalendar(buildCtx(db, me.id, q.currency, now()), q.from, q.to);
  });

  app.get('/api/analytics/flow', async (request) => {
    const me = requireUser(request);
    const q = period(request.query);
    const { savings } = parseWith(
      z.object({ savings: z.enum(['0', '1']).default('1') }),
      request.query,
    );
    return getFlow(buildCtx(db, me.id, q.currency, now()), q.from, q.to, savings === '1');
  });

  app.get('/api/analytics/anomalies', async (request) => {
    const me = requireUser(request);
    const q = period(request.query);
    return getAnomalies(buildCtx(db, me.id, q.currency, now()), q.from, q.to);
  });

  app.get('/api/analytics/income', async (request) => {
    const me = requireUser(request);
    const q = period(request.query);
    return getIncome(buildCtx(db, me.id, q.currency, now()), q.from, q.to);
  });
}
