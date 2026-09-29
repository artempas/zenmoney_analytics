import { describe, expect, it } from 'vitest';
import type { TxType } from '@zm/shared';
import { classify, detectAccountKind, type ClassifyRow } from '../src/domain/classify.js';

let nextId = 1;
function row(p: Partial<ClassifyRow> & { date: string }): ClassifyRow {
  const id = nextId++;
  const hasOut = p.outAccount != null;
  const hasIn = p.inAccount != null;
  return {
    id,
    zmCreatedAt: null,
    category: null,
    payee: null,
    comment: null,
    outAccount: null,
    outAmount: null,
    outCurrency: hasOut ? 'RUB' : null,
    inAccount: null,
    inAmount: null,
    inCurrency: hasIn ? 'RUB' : null,
    rawType: hasOut && hasIn ? 'transfer' : hasOut ? 'expense' : 'income',
    fingerprint: `fp${id}`,
    ...p,
  };
}

const ctx = (over: Partial<Parameters<typeof classify>[1]> = {}) => ({
  selfNames: [] as string[],
  savingsAccounts: new Set<string>(),
  overrides: new Map<string, TxType>(),
  ...over,
});

describe('classify', () => {
  it('keeps categorized and two-sided operations as is', () => {
    const a = row({ date: '2026-08-01', category: 'Еда', outAccount: 'Карта', outAmount: 100 });
    const b = row({
      date: '2026-08-01',
      outAccount: 'Карта',
      outAmount: 100,
      inAccount: 'Вклад',
      inAmount: 100,
    });
    const res = classify([a, b], ctx());
    expect(res.get(a.id)).toMatchObject({ type: 'expense', reason: 'native' });
    expect(res.get(b.id)).toMatchObject({ type: 'transfer', reason: 'native' });
  });

  it('pairs exact counter operations within 3 days on different accounts', () => {
    const out = row({ date: '2026-08-03', outAccount: 'A', outAmount: 500_00 });
    const inc = row({ date: '2026-08-05', inAccount: 'B', inAmount: 500_00 });
    const far = row({ date: '2026-08-10', inAccount: 'B', inAmount: 500_00 });
    const res = classify([out, inc, far], ctx());
    expect(res.get(out.id)).toMatchObject({ type: 'transfer', reason: 'paired' });
    expect(res.get(inc.id)?.pairId).toBe(res.get(out.id)?.pairId);
    expect(res.get(far.id)).toMatchObject({ type: 'income', reason: 'uncategorized' });
  });

  it('does not pair operations on the same account', () => {
    const out = row({ date: '2026-08-03', outAccount: 'A', outAmount: 500_00 });
    const inc = row({ date: '2026-08-03', inAccount: 'A', inAmount: 500_00 });
    const res = classify([out, inc], ctx());
    expect(res.get(out.id)?.reason).toBe('uncategorized');
  });

  it('pairs amounts that differ by a commission, but only for large amounts', () => {
    const out = row({ date: '2026-08-13', outAccount: 'Black', outAmount: 120_000_00 });
    const inc = row({ date: '2026-08-13', inAccount: 'Накопительный', inAmount: 118_000_00 });
    const smallOut = row({ date: '2026-08-13', outAccount: 'Black', outAmount: 500_00 });
    const smallIn = row({ date: '2026-08-13', inAccount: 'Карта', inAmount: 490_00 });
    const res = classify([out, inc, smallOut, smallIn], ctx());
    expect(res.get(out.id)?.reason).toBe('paired');
    expect(res.get(inc.id)?.reason).toBe('paired');
    expect(res.get(smallOut.id)?.reason).toBe('uncategorized');
    expect(res.get(smallIn.id)?.reason).toBe('uncategorized');
  });

  it('prefers exact matches over approximate ones', () => {
    const out = row({ date: '2026-08-03', outAccount: 'A', outAmount: 110_000_00 });
    const approx = row({ date: '2026-08-03', inAccount: 'B', inAmount: 105_000_00 });
    const exact = row({ date: '2026-08-04', inAccount: 'C', inAmount: 110_000_00 });
    const res = classify([out, approx, exact], ctx());
    expect(res.get(exact.id)?.reason).toBe('paired');
    expect(res.get(approx.id)?.reason).toBe('uncategorized');
  });

  it('marks operations mentioning own names as transfers (case and ё insensitive)', () => {
    const a = row({
      date: '2026-08-02',
      payee: 'Артём П.',
      inAccount: 'Black',
      inAmount: 20_000_00,
    });
    const b = row({
      date: '2026-08-04',
      comment: 'Поступление средств, отправитель: Артем Игоревич П, тел.',
      inAccount: '*1374',
      inAmount: 6_661_00,
    });
    const res = classify([a, b], ctx({ selfNames: ['артем п.', 'Артем Игоревич П'] }));
    expect(res.get(a.id)).toMatchObject({ type: 'transfer', reason: 'self' });
    expect(res.get(b.id)).toMatchObject({ type: 'transfer', reason: 'self' });
  });

  it('treats uncategorized operations on savings accounts as transfers', () => {
    const a = row({ date: '2026-08-16', outAccount: 'Накопительный счет', outAmount: 5_000_00 });
    const res = classify([a], ctx({ savingsAccounts: new Set(['Накопительный счет']) }));
    expect(res.get(a.id)).toMatchObject({ type: 'transfer', reason: 'savings' });
  });

  it('applies manual overrides first', () => {
    const a = row({ date: '2026-08-01', category: 'Еда', outAccount: 'Карта', outAmount: 100 });
    const out = row({ date: '2026-08-03', outAccount: 'A', outAmount: 500_00 });
    const inc = row({ date: '2026-08-03', inAccount: 'B', inAmount: 500_00 });
    const res = classify(
      [a, out, inc],
      ctx({
        overrides: new Map<string, TxType>([
          [a.fingerprint, 'transfer'],
          [out.fingerprint, 'expense'],
        ]),
      }),
    );
    expect(res.get(a.id)).toMatchObject({ type: 'transfer', reason: 'manual' });
    expect(res.get(out.id)).toMatchObject({ type: 'expense', reason: 'manual' });
    expect(res.get(inc.id)?.reason).toBe('uncategorized');
  });

  it('marks incomes in expense categories as refunds', () => {
    const spend = row({
      date: '2026-08-09',
      category: 'Развлечения',
      outAccount: 'Карта',
      outAmount: 3_000_00,
    });
    const back = row({
      date: '2026-08-09',
      category: 'Развлечения',
      payee: 'Илья К.',
      inAccount: 'Карта',
      inAmount: 1_600_00,
    });
    const salary = row({
      date: '2026-08-13',
      category: 'Зарплата',
      inAccount: 'Black',
      inAmount: 200_000_00,
    });
    const res = classify([spend, back, salary], ctx());
    expect(res.get(back.id)).toMatchObject({ type: 'income', isRefund: true });
    expect(res.get(salary.id)?.isRefund).toBe(false);
  });

  it('treats paybacks as refunds even when they exceed the spending in the category', () => {
    const spend = row({
      date: '2026-08-07',
      category: 'Развлечения',
      outAccount: 'Black',
      outAmount: 100_00,
    });
    const back1 = row({
      date: '2026-08-09',
      category: 'Развлечения',
      payee: 'Кирилл П.',
      inAccount: 'Карта',
      inAmount: 3_200_00,
    });
    const back2 = row({
      date: '2026-08-10',
      category: 'Развлечения',
      payee: 'Николай С.',
      inAccount: 'Карта',
      inAmount: 3_200_00,
    });
    const res = classify([spend, back1, back2], ctx());
    expect(res.get(back1.id)?.isRefund).toBe(true);
    expect(res.get(back2.id)?.isRefund).toBe(true);
  });

  it('keeps income-like categories as income even if they have expenses', () => {
    const fee = row({
      date: '2026-08-01',
      category: 'Проценты/кэшбек',
      outAccount: 'Black',
      outAmount: 10_00,
    });
    const interest = row({
      date: '2026-08-02',
      category: 'Проценты/кэшбек',
      inAccount: 'Black',
      inAmount: 50_00,
    });
    const res = classify([fee, interest], ctx());
    expect(res.get(interest.id)?.isRefund).toBe(false);
  });
});

describe('detectAccountKind', () => {
  it.each([
    ['Накопительный счет', 'savings'],
    ['машина1 (14% • вклад 3 мес)', 'savings'],
    ['Инвесткопилка', 'savings'],
    ['МОЕ (11% • счёт)', 'savings'],
    ['Black', 'regular'],
    ['*1374', 'regular'],
    ['Наличные', 'regular'],
  ])('%s → %s', (name, kind) => {
    expect(detectAccountKind(name)).toBe(kind);
  });
});
