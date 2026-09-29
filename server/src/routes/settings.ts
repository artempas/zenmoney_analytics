import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Account, SettingsResponse } from '@zm/shared';
import type { Db } from '../db/index.js';
import { accounts, settings } from '../db/schema.js';
import { detectAccountKind } from '../domain/classify.js';
import {
  effectivePassiveCategories,
  getIncomeCategories,
  getSettings,
  reclassifyUser,
} from '../domain/userState.js';
import { HttpError, parseWith, requireUser } from '../http.js';

const settingsSchema = z.object({
  selfNames: z.array(z.string().trim().min(2).max(100)).max(20),
  includeUncategorized: z.boolean(),
  passiveCategories: z.array(z.string().max(200)).max(200).nullable(),
});

const accountSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['regular', 'savings']).nullable(),
});

export async function settingsRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  const settingsResponse = (userId: number): SettingsResponse => {
    const s = getSettings(db, userId);
    const incomeCategories = getIncomeCategories(db, userId);
    return {
      ...s,
      incomeCategories,
      effectivePassiveCategories: effectivePassiveCategories(s, incomeCategories),
    };
  };

  app.get('/api/settings', async (request) => settingsResponse(requireUser(request).id));

  app.put('/api/settings', async (request) => {
    const me = requireUser(request);
    const body = parseWith(settingsSchema, request.body);
    getSettings(db, me.id); // ensures the row exists
    db.update(settings)
      .set({
        selfNames: [...new Set(body.selfNames)],
        includeUncategorized: body.includeUncategorized,
        passiveCategories: body.passiveCategories,
      })
      .where(eq(settings.userId, me.id))
      .run();
    reclassifyUser(db, me.id);
    return settingsResponse(me.id);
  });

  app.get('/api/accounts', async (request): Promise<Account[]> => {
    const me = requireUser(request);
    const rows = db.$client
      .prepare(
        `SELECT a.name, a.kind, a.kind_auto AS kindAuto,
                (SELECT COUNT(*) FROM transactions t
                  WHERE t.user_id = a.user_id AND (t.out_account = a.name OR t.in_account = a.name)) AS txCount
         FROM accounts a WHERE a.user_id = ? ORDER BY txCount DESC, a.name`,
      )
      .all(me.id) as { name: string; kind: Account['kind']; kindAuto: number; txCount: number }[];
    return rows.map((r) => ({ ...r, kindAuto: r.kindAuto === 1 }));
  });

  app.put('/api/accounts', async (request) => {
    const me = requireUser(request);
    const { name, kind } = parseWith(accountSchema, request.body);
    const res = db
      .update(accounts)
      .set(
        kind === null
          ? { kind: detectAccountKind(name), kindAuto: true }
          : { kind, kindAuto: false },
      )
      .where(and(eq(accounts.userId, me.id), eq(accounts.name, name)))
      .run();
    if (res.changes === 0) throw new HttpError(404, 'Счёт не найден');
    reclassifyUser(db, me.id);
    return { ok: true };
  });
}
