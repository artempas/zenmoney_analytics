import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

/** Opens (or creates) the SQLite database and applies pending migrations. Pass ':memory:' for tests. */
export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  // Case-insensitive search for Cyrillic (SQLite's LOWER/LIKE only fold ASCII).
  sqlite.function('ulower', { deterministic: true }, (s: unknown) =>
    typeof s === 'string' ? s.toLowerCase().replace(/ё/g, 'е') : s,
  );
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
