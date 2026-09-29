import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { AccountKind, TxType, TypeReason } from '@zm/shared';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passkeys = sqliteTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
    counter: integer('counter').notNull(),
    transports: text('transports', { mode: 'json' }).$type<string[]>(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
  },
  (t) => [index('passkeys_user_idx').on(t.userId)],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<AccountKind>().notNull(),
    kindAuto: integer('kind_auto', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('accounts_user_name_idx').on(t.userId, t.name)],
);

export const imports = sqliteTable(
  'imports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    uploadedAt: text('uploaded_at').notNull(),
    dateFrom: text('date_from').notNull(),
    dateTo: text('date_to').notNull(),
    rows: integer('rows').notNull(),
    replaced: integer('replaced').notNull(),
  },
  (t) => [index('imports_user_idx').on(t.userId)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    importId: integer('import_id').references(() => imports.id, { onDelete: 'set null' }),
    date: text('date').notNull(),
    zmCreatedAt: text('zm_created_at'),
    zmChangedAt: text('zm_changed_at'),
    category: text('category'),
    categoryParent: text('category_parent'),
    payee: text('payee'),
    comment: text('comment'),
    outAccount: text('out_account'),
    /** Minor units (kopecks). */
    outAmount: integer('out_amount'),
    outCurrency: text('out_currency'),
    inAccount: text('in_account'),
    /** Minor units (kopecks). */
    inAmount: integer('in_amount'),
    inCurrency: text('in_currency'),
    rawType: text('raw_type').$type<TxType>().notNull(),
    type: text('type').$type<TxType>().notNull(),
    reason: text('reason').$type<TypeReason>().notNull(),
    pairId: integer('pair_id'),
    isRefund: integer('is_refund', { mode: 'boolean' }).notNull().default(false),
    fingerprint: text('fingerprint').notNull(),
  },
  (t) => [
    index('tx_user_date_idx').on(t.userId, t.date),
    index('tx_user_type_date_idx').on(t.userId, t.type, t.date),
    uniqueIndex('tx_user_fingerprint_idx').on(t.userId, t.fingerprint),
  ],
);

export const overrides = sqliteTable(
  'overrides',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    type: text('type').$type<TxType>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.fingerprint] })],
);

export const settings = sqliteTable('settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  selfNames: text('self_names', { mode: 'json' }).$type<string[]>().notNull().default([]),
  includeUncategorized: integer('include_uncategorized', { mode: 'boolean' })
    .notNull()
    .default(true),
  passiveCategories: text('passive_categories', { mode: 'json' }).$type<string[] | null>(),
});

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
