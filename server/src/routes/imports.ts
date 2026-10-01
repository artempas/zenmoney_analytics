import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ImportRecord } from '@zm/shared';
import type { Db } from '../db/index.js';
import { accounts, imports, overrides, transactions } from '../db/schema.js';
import { HttpError, requireUser } from '../http.js';
import { importTransactions, rollbackImport } from '../import/importService.js';
import { ImportError, parseZenmoneyCsv } from '../import/parseZenmoney.js';

export async function importRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post('/api/imports', async (request) => {
    const me = requireUser(request);
    if (!request.isMultipart()) throw new HttpError(400, 'Ожидается файл (multipart/form-data)');
    const file = await request.file();
    if (!file) throw new HttpError(400, 'Файл не передан');
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw new HttpError(413, 'Файл слишком большой');
    try {
      const rows = parseZenmoneyCsv(buffer.toString('utf8'));
      return importTransactions(db, me.id, file.filename || 'export.csv', rows);
    } catch (e) {
      if (e instanceof ImportError) throw new HttpError(400, e.message);
      throw e;
    }
  });

  app.get('/api/imports', async (request): Promise<ImportRecord[]> => {
    const me = requireUser(request);
    return db
      .select({
        id: imports.id,
        filename: imports.filename,
        uploadedAt: imports.uploadedAt,
        dateFrom: imports.dateFrom,
        dateTo: imports.dateTo,
        rows: imports.rows,
        replaced: imports.replaced,
      })
      .from(imports)
      .where(eq(imports.userId, me.id))
      .orderBy(desc(imports.id))
      .all();
  });

  app.delete('/api/imports/:id', async (request) => {
    const me = requireUser(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Некорректный идентификатор');
    const deleted = rollbackImport(db, me.id, id);
    if (deleted === null) throw new HttpError(404, 'Загрузка не найдена');
    return { ok: true, deleted };
  });

  app.delete('/api/data', async (request) => {
    const me = requireUser(request);
    db.transaction((tx) => {
      tx.delete(transactions).where(eq(transactions.userId, me.id)).run();
      tx.delete(imports).where(eq(imports.userId, me.id)).run();
      tx.delete(accounts).where(eq(accounts.userId, me.id)).run();
      tx.delete(overrides).where(eq(overrides.userId, me.id)).run();
    });
    return { ok: true };
  });
}
