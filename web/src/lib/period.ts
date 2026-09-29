import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useMeta } from '../api/queries';
import { monthEnd, monthStart } from './dates';

export interface Period {
  from: string;
  to: string;
  currency: string | undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Period and currency live in the URL, so every page and link shares the same slice. */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const last = meta.data?.dateTo ?? null;

  const period = useMemo<Period | null>(() => {
    const from = params.get('from');
    const to = params.get('to');
    const currency = params.get('cur') ?? meta.data?.defaultCurrency ?? undefined;
    if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to)
      return { from, to, currency };
    if (!last) return null;
    return { from: monthStart(last), to: monthEnd(last), currency };
  }, [params, last, meta.data?.defaultCurrency]);

  const setPeriod = useCallback(
    (from: string, to: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('from', from);
          next.set('to', to);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setCurrency = useCallback(
    (cur: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('cur', cur);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { period, setPeriod, setCurrency, meta };
}

/** Query string that carries the current period to another page. */
export function periodSearch(period: Period | null, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (period) {
    p.set('from', period.from);
    p.set('to', period.to);
    if (period.currency) p.set('cur', period.currency);
  }
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
