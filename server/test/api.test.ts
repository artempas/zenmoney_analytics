import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Anomalies,
  CalendarData,
  FlowData,
  ImportResult,
  IncomeData,
  Meta,
  Monthly,
  Overview,
  TransactionsResponse,
} from '@zm/shared';
import {
  buildCsv,
  createLoggedIn,
  createTestApp,
  get,
  register,
  upload,
  type CsvRow,
  type TestApp,
} from './helpers.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/sample.csv'), 'utf8');
const AUG = 'from=2026-08-01&to=2026-08-31';

async function setSettings(t: TestApp, body: object) {
  const res = await t.app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { selfNames: [], includeUncategorized: true, passiveCategories: null, ...body },
    headers: { cookie: t.cookie },
  });
  expect(res.statusCode).toBe(200);
}

describe('auth', () => {
  it('lets the first user register and then closes registration', async () => {
    const { app } = await createTestApp();
    const me0 = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me0.json()).toEqual({ user: null, registrationOpen: true });

    const first = await register(app, 'a@example.com');
    expect(first.res.statusCode).toBe(200);
    expect(first.cookie).toMatch(/^zm_session=/);

    const second = await register(app, 'b@example.com');
    expect(second.res.statusCode).toBe(403);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: first.cookie },
    });
    expect(me.json().user.email).toBe('a@example.com');
  });

  it('keeps registration open with ALLOW_REGISTRATION', async () => {
    const { app } = await createTestApp({ ALLOW_REGISTRATION: 'true' });
    await register(app, 'a@example.com');
    const second = await register(app, 'b@example.com');
    expect(second.res.statusCode).toBe(200);
  });

  it('logs in with the password and rejects a wrong one', async () => {
    const { app } = await createTestApp();
    await register(app, 'a@example.com', 'correct-horse');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@example.com', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'A@example.com ', password: 'correct-horse' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('requires a session for data endpoints', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: `/api/analytics/overview?${AUG}` });
    expect(res.statusCode).toBe(401);
  });

  it('rejects cross-origin state-changing requests', async () => {
    const t = await createLoggedIn();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: t.cookie, origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('issues passkey registration options for a logged-in user', async () => {
    const t = await createLoggedIn();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/passkeys/register/options',
      headers: { cookie: t.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rp.id).toBe('localhost');
    expect(body.authenticatorSelection.residentKey).toBe('required');
  });
});

describe('import and analytics', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createLoggedIn({}, () => new Date('2026-09-29T12:00:00Z'));
    const res = await upload(t, fixture);
    expect(res.statusCode).toBe(200);
    await setSettings(t, { selfNames: ['Иван Иванович И'] });
  });

  it('reports the imported period and detected accounts', async () => {
    const meta = await get<Meta>(t, '/api/meta');
    expect(meta).toMatchObject({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-28',
      defaultCurrency: 'RUB',
      txCount: 19,
    });
    const accounts = await get<{ name: string; kind: string }[]>(t, '/api/accounts');
    const kinds = Object.fromEntries(accounts.map((a) => [a.name, a.kind]));
    expect(kinds).toEqual({
      Карта: 'regular',
      Кредитка: 'regular',
      'Накопительный счет': 'savings',
      'Вклад (12% • 3 мес)': 'savings',
    });
  });

  it('classifies transfers, refunds and uncategorized operations', async () => {
    const list = await get<TransactionsResponse>(
      t,
      '/api/transactions?pageSize=100&sort=date&order=asc',
    );
    const reasons = list.items.map(
      (i) => `${i.date}:${i.type}:${i.reason}${i.isRefund ? ':refund' : ''}`,
    );
    expect(reasons).toEqual([
      '2026-08-01:expense:native',
      '2026-08-01:expense:native',
      '2026-08-02:income:native',
      '2026-08-02:transfer:native',
      '2026-08-03:transfer:paired',
      '2026-08-04:transfer:paired',
      '2026-08-05:transfer:paired',
      '2026-08-05:transfer:paired',
      '2026-08-06:transfer:self',
      '2026-08-07:transfer:savings',
      '2026-08-08:expense:native',
      '2026-08-09:income:native:refund',
      '2026-08-10:income:native',
      '2026-08-11:income:uncategorized',
      '2026-08-12:expense:uncategorized',
      '2026-08-15:expense:native',
      '2026-08-20:expense:native',
      '2026-08-25:expense:native',
      '2026-08-28:expense:native',
    ]);
  });

  it('computes overview totals net of refunds', async () => {
    const o = await get<Overview>(t, `/api/analytics/overview?${AUG}`);
    expect(o.expense).toBe(7684.5);
    expect(o.income).toBe(100375.5);
    expect(o.savings).toBe(92691);
    expect(o.refunds).toBe(600);
    expect(o.uncategorized).toEqual({ income: 320, expense: 550, included: true });
    expect(o.topCategories[0]).toMatchObject({ category: 'Еда', amount: 4500 });
    expect(o.prevFrom).toBe('2026-07-01');
    expect(o.prev.expense).toBe(0);
    expect(o.forecast).toBeNull();
    expect(o.cumulative.labels).toHaveLength(31);
    expect(o.cumulative.current[30]).toBe(7684.5);
  });

  it('excludes uncategorized operations when the toggle is off', async () => {
    await setSettings(t, { selfNames: ['Иван Иванович И'], includeUncategorized: false });
    const o = await get<Overview>(t, `/api/analytics/overview?${AUG}`);
    expect(o.expense).toBe(7134.5);
    expect(o.income).toBe(100055.5);
    expect(o.uncategorized.included).toBe(false);
  });

  it('treats the self transfer as income when no own names are configured', async () => {
    await setSettings(t, { selfNames: [] });
    const o = await get<Overview>(t, `/api/analytics/overview?${AUG}`);
    expect(o.income).toBe(115375.5);
  });

  it('applies and removes manual type overrides', async () => {
    const list = await get<TransactionsResponse>(t, `/api/transactions?q=мегафон`);
    expect(list.total).toBe(1);
    const id = list.items[0]!.id;
    const patch = await t.app.inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { type: 'transfer' },
      headers: { cookie: t.cookie },
    });
    expect(patch.json()).toMatchObject({ type: 'transfer', reason: 'manual' });
    expect((await get<Overview>(t, `/api/analytics/overview?${AUG}`)).expense).toBe(7134.5);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/transactions/${id}`,
      payload: { type: null },
      headers: { cookie: t.cookie },
    });
    expect((await get<Overview>(t, `/api/analytics/overview?${AUG}`)).expense).toBe(7684.5);
  });

  it('keeps overrides and replaces the period on re-import', async () => {
    const list = await get<TransactionsResponse>(t, `/api/transactions?q=мегафон`);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/transactions/${list.items[0]!.id}`,
      payload: { type: 'transfer' },
      headers: { cookie: t.cookie },
    });
    const again = await upload(t, fixture);
    expect(again.json<ImportResult>()).toMatchObject({
      rows: 19,
      replaced: 19,
      dateFrom: '2026-08-01',
    });
    const meta = await get<Meta>(t, '/api/meta');
    expect(meta.txCount).toBe(19);
    const after = await get<TransactionsResponse>(t, `/api/transactions?q=мегафон`);
    expect(after.items[0]).toMatchObject({ type: 'transfer', reason: 'manual' });
  });

  it('filters transactions by category, type and text', async () => {
    const food = await get<TransactionsResponse>(
      t,
      `/api/transactions?category=${encodeURIComponent('Еда')}`,
    );
    expect(food.total).toBe(4);
    const refunds = await get<TransactionsResponse>(t, '/api/transactions?type=refund');
    expect(refunds.total).toBe(1);
    const search = await get<TransactionsResponse>(
      t,
      `/api/transactions?q=${encodeURIComponent('ЗЕРНО')}`,
    );
    expect(search.total).toBe(2);
  });

  it('builds monthly series', async () => {
    const m = await get<Monthly>(t, '/api/analytics/monthly?to=2026-08-31&months=12');
    expect(m.months).toEqual(['2026-08']);
    expect(m.expense).toEqual([7684.5]);
    expect(m.income).toEqual([100375.5]);
    expect(m.byParent.find((p) => p.category === 'Еда')?.values).toEqual([4500]);
    expect(m.byCategory.map((c) => c.category)).toContain('Еда / Кофе');
  });

  it('builds the spending calendar', async () => {
    const c = await get<CalendarData>(t, `/api/analytics/calendar?${AUG}`);
    expect(c.days).toHaveLength(31);
    expect(c.days.find((d) => d.date === '2026-08-01')).toMatchObject({
      expense: 1484.5,
      count: 2,
    });
    // 1200 spent and 600 refunded on different days: the refund day does not go negative.
    expect(c.days.find((d) => d.date === '2026-08-09')?.expense).toBe(0);
    expect(c.hasTime).toBe(true);
    // Saturday (weekday 5) 2026-08-01 at 09:00 — coffee.
    expect(c.hourMatrix.find((h) => h.weekday === 5 && h.hour === 9)).toMatchObject({
      amount: 250,
      count: 1,
    });
  });

  it('builds a balanced money flow', async () => {
    const f = await get<FlowData>(t, `/api/analytics/flow?${AUG}`);
    expect(f.totals).toEqual({
      income: 100375.5,
      compensations: 0,
      expense: 7684.5,
      toSavings: 66000,
      fromSavings: 0,
      rest: 26691,
      deficit: 0,
    });
    const hubIn = f.links.filter((l) => l.target === 'hub').reduce((s, l) => s + l.value, 0);
    const hubOut = f.links.filter((l) => l.source === 'hub').reduce((s, l) => s + l.value, 0);
    expect(hubIn).toBeCloseTo(hubOut, 2);
    expect(f.nodes.find((n) => n.id === 'sav:Вклад (12% • 3 мес)')?.value).toBe(49000);
    expect(f.links).toContainEqual({ source: 'exp:Еда', target: 'sub:Еда / Кофе', value: 550 });

    const noSavings = await get<FlowData>(t, `/api/analytics/flow?${AUG}&savings=0`);
    expect(noSavings.totals).toMatchObject({ toSavings: 0, fromSavings: 0, rest: 92691 });
  });

  it('summarizes passive income', async () => {
    const i = await get<IncomeData>(t, `/api/analytics/income?${AUG}`);
    expect(i.total).toBe(100375.5);
    expect(i.passive).toBe(375.5);
    expect(i.sources.map((s) => [s.source, s.passive])).toEqual([
      ['Зарплата', false],
      ['Проценты и кэшбэк (без категории)', true],
      ['Проценты/кэшбек', true],
    ]);
    expect(i.passiveByAccount).toEqual([
      { account: 'Кредитка', amount: 320 },
      { account: 'Накопительный счет', amount: 55.5 },
    ]);
    expect(i.passiveCumulative.at(-1)?.value).toBe(375.5);
  });

  it('lists the largest expenses', async () => {
    const a = await get<Anomalies>(t, `/api/analytics/anomalies?${AUG}`);
    expect(a.largest[0]).toMatchObject({ payee: 'Ресторан Тест', amount: 3500 });
    expect(a.unusual).toEqual([]);
  });

  it('isolates data between users', async () => {
    const other = await createLoggedIn();
    const meta = await get<Meta>(other, '/api/meta');
    expect(meta.txCount).toBe(0);
  });

  it('deletes all data', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/data',
      headers: { cookie: t.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((await get<Meta>(t, '/api/meta')).txCount).toBe(0);
  });

  it('rejects files that are not ZenMoney exports', async () => {
    const res = await upload(t, 'hello,world\n1,2');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/заголовок/);
  });
});

describe('anomalies over history', () => {
  it('flags unusual payments, category spikes and forecasts a partial month', async () => {
    const t = await createLoggedIn({}, () => new Date('2026-08-12T12:00:00Z'));
    const rows: CsvRow[] = [];
    for (const month of ['05', '06', '07']) {
      for (const day of ['03', '10', '17', '24']) {
        rows.push({
          date: `2026-${month}-${day}`,
          category: 'Еда / Кофе',
          payee: 'Кофейня',
          out: ['Карта', 250],
        });
      }
      rows.push({
        date: `2026-${month}-05`,
        category: 'Такси',
        payee: 'Такси',
        out: ['Карта', 1000],
      });
    }
    rows.push({
      date: '2026-08-02',
      category: 'Еда / Кофе',
      payee: 'Кофейня',
      out: ['Карта', 2500],
    });
    rows.push({ date: '2026-08-03', category: 'Такси', payee: 'Такси', out: ['Карта', 6000] });
    rows.push({
      date: '2026-08-10',
      category: 'Еда / Кофе',
      payee: 'Кофейня',
      out: ['Карта', 250],
    });
    expect((await upload(t, buildCsv(rows))).statusCode).toBe(200);

    const a = await get<Anomalies>(t, `/api/analytics/anomalies?${AUG}`);
    const coffee = a.unusual.find((u) => u.payee === 'Кофейня');
    expect(coffee).toMatchObject({ basis: 'payee', median: 250, amount: 2500, historyCount: 12 });
    expect(coffee!.ratio).toBeCloseTo(10, 5);
    expect(a.spikes.find((s) => s.category === 'Такси')).toMatchObject({
      month: '2026-08',
      amount: 6000,
      baseline: 1000,
    });

    // Data ends on Aug 10, so August is a partial month with a forecast and a 3-month baseline.
    const o = await get<Overview>(t, `/api/analytics/overview?${AUG}`);
    expect(o.forecast?.asOf).toBe('2026-08-10');
    expect(o.forecast?.spent).toBe(8750);
    expect(o.forecast!.projected).toBeGreaterThan(8750);
    expect(o.cumulative.current[9]).toBe(8750);
    expect(o.cumulative.current[10]).toBeNull();
    expect(o.cumulative.baselineLabel).toMatch(/3 предыдущих/);
    expect(o.cumulative.baseline[30]).toBe(2000);
  });
});
