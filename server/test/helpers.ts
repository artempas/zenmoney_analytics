import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb, type Db } from '../src/db/index.js';

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  cookie: string;
}

export async function createTestApp(
  env: Record<string, string> = {},
  now?: () => Date,
): Promise<Omit<TestApp, 'cookie'>> {
  const config = loadConfig({ APP_ORIGIN: 'http://localhost:3000', WEB_DIST: '', ...env });
  const db = openDb(':memory:');
  const app = await buildApp(config, db, { logger: false, now });
  return { app, db };
}

export async function register(
  app: FastifyInstance,
  email = 'user@example.com',
  password = 'secret-password',
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password },
  });
  const setCookie = res.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
  return { res, cookie };
}

export async function createLoggedIn(
  env: Record<string, string> = {},
  now?: () => Date,
): Promise<TestApp> {
  const { app, db } = await createTestApp(env, now);
  const { cookie } = await register(app);
  return { app, db, cookie };
}

export function multipart(filename: string, content: string) {
  const boundary = '----zmtestboundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: text/csv\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return {
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export async function upload(t: TestApp, content: string, filename = 'export.csv') {
  const mp = multipart(filename, content);
  return t.app.inject({
    method: 'POST',
    url: '/api/imports',
    payload: mp.payload,
    headers: { ...mp.headers, cookie: t.cookie },
  });
}

export async function get<T = unknown>(t: TestApp, url: string): Promise<T> {
  const res = await t.app.inject({ method: 'GET', url, headers: { cookie: t.cookie } });
  if (res.statusCode !== 200) throw new Error(`${url} → ${res.statusCode}: ${res.body}`);
  return res.json() as T;
}

export interface CsvRow {
  date: string;
  category?: string;
  payee?: string;
  comment?: string;
  out?: [string, number];
  in?: [string, number];
  created?: string;
}

/** Builds a ZenMoney-like export from compact row descriptions. */
export function buildCsv(rows: CsvRow[]): string {
  const q = (v: string | undefined) => (v === undefined ? '' : `"${v.replace(/"/g, '""')}"`);
  const amount = (v: number) => `"${v.toFixed(2).replace('.', ',')}"`;
  const lines = rows.map((r) =>
    [
      r.date,
      q(r.category),
      q(r.payee),
      q(r.comment),
      r.out ? q(r.out[0]) : '',
      r.out ? amount(r.out[1]) : '',
      r.out ? 'RUB' : '',
      r.in ? q(r.in[0]) : '',
      r.in ? amount(r.in[1]) : '',
      r.in ? 'RUB' : '',
      q(r.created ?? `${r.date} 12:00:00`),
      q(r.created ?? `${r.date} 12:00:00`),
    ].join(','),
  );
  return [
    'zm_dump_2011,1790704503,,,"4,0",',
    '',
    '',
    'date,categoryName,payee,comment,outcomeAccountName,outcome,outcomeCurrencyShortTitle,incomeAccountName,income,incomeCurrencyShortTitle,createdDate,changedDate',
    ...lines,
  ].join('\n');
}
