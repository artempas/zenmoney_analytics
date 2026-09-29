import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ImportError,
  parseAmount,
  parseDate,
  parseZenmoneyCsv,
} from '../src/import/parseZenmoney.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/sample.csv'), 'utf8');

describe('parseZenmoneyCsv', () => {
  const rows = parseZenmoneyCsv(fixture);

  it('skips the service header and rows without amounts', () => {
    expect(rows).toHaveLength(19);
    expect(rows[0]!.date).toBe('2026-08-01');
  });

  it('parses decimal commas into minor units', () => {
    expect(rows[1]!.outAmount).toBe(123450);
    expect(rows[12]!.inAmount).toBe(5550);
  });

  it('keeps escaped quotes inside fields', () => {
    expect(rows[2]!.comment).toBe('Выплата заработной платы за июль 2026г. АО"Ромашка".');
  });

  it('detects operation type from the filled sides', () => {
    expect(rows[0]!.rawType).toBe('expense');
    expect(rows[2]!.rawType).toBe('income');
    expect(rows[3]!.rawType).toBe('transfer');
  });

  it('splits nested categories', () => {
    expect(rows[0]!.category).toBe('Еда / Кофе');
    expect(rows[0]!.categoryParent).toBe('Еда');
    expect(rows[1]!.categoryParent).toBe('Продукты');
  });

  it('keeps createdDate as the operation time', () => {
    expect(rows[0]!.zmCreatedAt).toBe('2026-08-01 09:15:00');
  });

  it('handles a BOM and CRLF line endings', () => {
    const text = '\uFEFF' + fixture.replace(/\n/g, '\r\n');
    expect(parseZenmoneyCsv(text)).toHaveLength(19);
  });

  it('rejects files without the header', () => {
    expect(() => parseZenmoneyCsv('a,b,c\n1,2,3')).toThrow(ImportError);
  });

  it('rejects files with missing columns', () => {
    expect(() => parseZenmoneyCsv('date,categoryName\n2026-01-01,Еда')).toThrow(/нет колонок/);
  });
});

describe('field parsers', () => {
  it('parses amounts', () => {
    expect(parseAmount('346,58')).toBe(34658);
    expect(parseAmount('1 234,56')).toBe(123456);
    expect(parseAmount('0,00')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(() => parseAmount('abc')).toThrow(ImportError);
  });

  it('parses dates', () => {
    expect(parseDate('2026-08-01')).toBe('2026-08-01');
    expect(parseDate('01.08.2026')).toBe('2026-08-01');
    expect(() => parseDate('yesterday')).toThrow(ImportError);
  });
});
