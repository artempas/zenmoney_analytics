// API contracts shared by the server and the web client. Types only: this package has no runtime code.
// Money values in responses are in major currency units (e.g. rubles), rounded to 2 decimals.

export type TxType = 'expense' | 'income' | 'transfer';

/**
 * Why a transaction ended up with its effective type.
 * - native: taken from the export as is (has a category, or both accounts are set)
 * - paired: one-sided uncategorized operation matched with a counter operation
 * - self: payee/comment mentions one of the user's own names
 * - savings: uncategorized operation on a savings account
 * - manual: type set by the user
 * - uncategorized: one-sided operation without category that is counted as income/expense
 */
export type TypeReason = 'native' | 'paired' | 'self' | 'savings' | 'manual' | 'uncategorized';

export type AccountKind = 'regular' | 'savings';

export interface User {
  id: number;
  email: string;
}

export interface MeResponse {
  user: User | null;
  registrationOpen: boolean;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
}

export interface ImportResult {
  importId: number;
  dateFrom: string;
  dateTo: string;
  rows: number;
  replaced: number;
  newAccounts: string[];
}

export interface ImportRecord {
  id: number;
  filename: string;
  uploadedAt: string;
  dateFrom: string;
  dateTo: string;
  rows: number;
  replaced: number;
}

export interface Account {
  name: string;
  kind: AccountKind;
  kindAuto: boolean;
  txCount: number;
}

export interface Settings {
  selfNames: string[];
  includeUncategorized: boolean;
  /** null means "detect automatically by name" */
  passiveCategories: string[] | null;
}

export interface SettingsResponse extends Settings {
  /** Effective list of passive income categories (auto-detected when passiveCategories is null). */
  effectivePassiveCategories: string[];
  /** All categories that have at least one income operation. */
  incomeCategories: string[];
}

export interface Meta {
  dateFrom: string | null;
  dateTo: string | null;
  currencies: string[];
  defaultCurrency: string | null;
  categories: string[];
  accounts: string[];
  txCount: number;
}

export interface Transaction {
  id: number;
  date: string;
  time: string | null;
  category: string | null;
  payee: string | null;
  comment: string | null;
  outAccount: string | null;
  outAmount: number | null;
  outCurrency: string | null;
  inAccount: string | null;
  inAmount: number | null;
  inCurrency: string | null;
  rawType: TxType;
  type: TxType;
  reason: TypeReason;
  pairId: number | null;
  isRefund: boolean;
}

export interface TransactionsResponse {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

export type TxTypeFilter = TxType | 'refund' | 'all';

export interface PeriodQuery {
  from: string;
  to: string;
  currency?: string;
}

export interface CategoryAmount {
  category: string;
  amount: number;
  share: number;
}

export interface PeriodTotals {
  income: number;
  expense: number;
  savings: number;
  savingsRate: number | null;
}

export interface Overview extends PeriodTotals {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  prev: PeriodTotals;
  refunds: number;
  uncategorized: { income: number; expense: number; included: boolean };
  forecast: {
    asOf: string;
    monthEnd: string;
    spent: number;
    projected: number;
    dailyRate: number;
  } | null;
  cumulative: {
    labels: string[];
    current: (number | null)[];
    baseline: (number | null)[];
    baselineLabel: string;
  };
  topCategories: CategoryAmount[];
  lastDataDate: string | null;
}

export interface Monthly {
  months: string[];
  income: number[];
  expense: number[];
  net: number[];
  cumulative: number[];
  byParent: { category: string; values: number[] }[];
  byCategory: { category: string; values: number[] }[];
}

export interface CalendarData {
  days: { date: string; expense: number; count: number }[];
  weekday: { weekday: number; total: number; avg: number; count: number }[];
  hourMatrix: { weekday: number; hour: number; amount: number; count: number }[];
  hasTime: boolean;
}

export type FlowNodeKind =
  'income' | 'hub' | 'expense' | 'subexpense' | 'savings' | 'fromSavings' | 'rest' | 'deficit';

export interface FlowData {
  nodes: { id: string; label: string; kind: FlowNodeKind; value: number }[];
  links: { source: string; target: string; value: number }[];
  totals: {
    income: number;
    /** Paybacks in categories where they exceed the spending of the period. */
    compensations: number;
    expense: number;
    toSavings: number;
    fromSavings: number;
    rest: number;
    deficit: number;
  };
}

export interface TxLite {
  id: number;
  date: string;
  category: string | null;
  payee: string | null;
  comment: string | null;
  account: string | null;
  amount: number;
}

export interface UnusualTx extends TxLite {
  basis: 'payee' | 'category';
  key: string;
  median: number;
  ratio: number;
  historyCount: number;
}

export interface CategorySpike {
  month: string;
  category: string;
  amount: number;
  baseline: number;
  /** null when the category had no spending in the previous months. */
  ratio: number | null;
  baselineMonths: number;
}

export interface Anomalies {
  largest: TxLite[];
  unusual: UnusualTx[];
  spikes: CategorySpike[];
}

export interface IncomeData {
  months: string[];
  sources: { source: string; passive: boolean; values: number[]; total: number }[];
  total: number;
  passive: number;
  passiveShare: number | null;
  passiveMonthlyAvg: number;
  passiveAnnualRunRate: number;
  passiveCumulative: { date: string; value: number }[];
  passiveByAccount: { account: string; amount: number }[];
}

export interface ApiError {
  error: string;
}
