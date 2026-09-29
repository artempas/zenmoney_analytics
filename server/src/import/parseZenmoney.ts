import { parse } from 'csv-parse/sync';
import type { TxType } from '@zm/shared';

export class ImportError extends Error {}

export interface ParsedRow {
  date: string;
  category: string | null;
  categoryParent: string | null;
  payee: string | null;
  comment: string | null;
  outAccount: string | null;
  /** Minor units. */
  outAmount: number | null;
  outCurrency: string | null;
  inAccount: string | null;
  /** Minor units. */
  inAmount: number | null;
  inCurrency: string | null;
  zmCreatedAt: string | null;
  zmChangedAt: string | null;
  rawType: TxType;
}

const REQUIRED_COLUMNS = [
  'date',
  'categoryName',
  'payee',
  'comment',
  'outcomeAccountName',
  'outcome',
  'outcomeCurrencyShortTitle',
  'incomeAccountName',
  'income',
  'incomeCurrencyShortTitle',
] as const;

const CATEGORY_SEPARATOR = ' / ';

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** "1 234,56" → 123456 (minor units). Returns null for empty or zero values. */
export function parseAmount(value: string | undefined): number | null {
  const raw = clean(value);
  if (raw === null) return null;
  const normalized = raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
  const num = Number(normalized);
  if (!Number.isFinite(num)) throw new ImportError(`Не удалось разобрать сумму «${raw}»`);
  const minor = Math.round(Math.abs(num) * 100);
  return minor === 0 ? null : minor;
}

/** Accepts YYYY-MM-DD and DD.MM.YYYY. */
export function parseDate(value: string | undefined): string {
  const raw = clean(value) ?? '';
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new ImportError(`Не удалось разобрать дату «${raw}»`);
}

function parseTimestamp(value: string | undefined): string | null {
  const raw = clean(value);
  if (raw === null) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(raw);
  return m ? `${m[1]} ${m[2]}` : null;
}

export function splitCategory(category: string | null): string | null {
  if (category === null) return null;
  const idx = category.indexOf(CATEGORY_SEPARATOR);
  return idx === -1 ? category : category.slice(0, idx).trim();
}

/**
 * Parses a ZenMoney CSV export. The export starts with a few service lines
 * (e.g. `zm_dump_2011,...`) before the real header that begins with `date`.
 */
export function parseZenmoneyCsv(input: string): ParsedRow[] {
  const text = input.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^"?date"?\s*[,;]/.test(l.trim()));
  if (headerIdx === -1) {
    throw new ImportError(
      'Не найден заголовок таблицы (строка, начинающаяся с «date»). Это точно выгрузка из ZenMoney?',
    );
  }
  const headerLine = lines[headerIdx] ?? '';
  const delimiter = headerLine.includes(',') ? ',' : ';';
  const body = lines.slice(headerIdx).join('\n');

  let records: Record<string, string>[];
  try {
    records = parse(body, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (e) {
    throw new ImportError(`Ошибка разбора CSV: ${(e as Error).message}`);
  }

  const first = records[0];
  if (first) {
    const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
    if (missing.length) throw new ImportError(`В файле нет колонок: ${missing.join(', ')}`);
  }

  const rows: ParsedRow[] = [];
  for (const r of records) {
    const outAccount = clean(r.outcomeAccountName);
    const inAccount = clean(r.incomeAccountName);
    const outAmount = outAccount ? parseAmount(r.outcome) : null;
    const inAmount = inAccount ? parseAmount(r.income) : null;
    const hasOut = outAccount !== null && outAmount !== null;
    const hasIn = inAccount !== null && inAmount !== null;
    if (!hasOut && !hasIn) continue;
    const rawType: TxType = hasOut && hasIn ? 'transfer' : hasOut ? 'expense' : 'income';
    const category = clean(r.categoryName);
    rows.push({
      date: parseDate(r.date),
      category,
      categoryParent: splitCategory(category),
      payee: clean(r.payee),
      comment: clean(r.comment),
      outAccount: hasOut ? outAccount : null,
      outAmount: hasOut ? outAmount : null,
      outCurrency: hasOut ? clean(r.outcomeCurrencyShortTitle) : null,
      inAccount: hasIn ? inAccount : null,
      inAmount: hasIn ? inAmount : null,
      inCurrency: hasIn ? clean(r.incomeCurrencyShortTitle) : null,
      zmCreatedAt: parseTimestamp(r.createdDate),
      zmChangedAt: parseTimestamp(r.changedDate),
      rawType,
    });
  }
  return rows;
}
