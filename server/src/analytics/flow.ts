import type { FlowData, FlowNodeKind } from '@zm/shared';
import { loadFlows, loadTransfers, major, netExpenseBy, type AnalyticsCtx } from './base.js';

/**
 * Sankey: income sources → "Бюджет" → expense categories (→ subcategories),
 * plus (optionally) net transfers into/out of savings accounts, and the balance
 * that stayed on or was taken from regular accounts.
 * The graph is a DAG by construction (ECharts refuses cycles).
 */
export function getFlow(
  ctx: AnalyticsCtx,
  from: string,
  to: string,
  includeSavings = true,
): FlowData {
  const flows = loadFlows(ctx, from, to);
  const transfers = includeSavings ? loadTransfers(ctx, from, to) : [];

  const nodes = new Map<string, { id: string; label: string; kind: FlowNodeKind; value: number }>();
  const links: FlowData['links'] = [];
  const node = (id: string, label: string, kind: FlowNodeKind) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind, value: 0 });
    return id;
  };
  const inSum = new Map<string, number>();
  const outSum = new Map<string, number>();
  const link = (source: string, target: string, minor: number) => {
    if (minor <= 0) return;
    links.push({ source, target, value: major(minor) });
    outSum.set(source, (outSum.get(source) ?? 0) + minor);
    inSum.set(target, (inSum.get(target) ?? 0) + minor);
  };

  const hub = node('hub', 'Бюджет', 'hub');

  const incomeBySource = new Map<string, number>();
  for (const f of flows) {
    if (f.kind === 'income')
      incomeBySource.set(f.category, (incomeBySource.get(f.category) ?? 0) + f.amount);
  }
  let income = 0;
  for (const [src, amount] of [...incomeBySource].sort((a, b) => b[1] - a[1])) {
    link(node(`in:${src}`, src, 'income'), hub, amount);
    income += amount;
  }

  // Net movement per savings account (positive = money put aside).
  const savingsNet = new Map<string, number>();
  for (const t of transfers) {
    const outSavings = t.outAccount !== null && ctx.savingsAccounts.has(t.outAccount);
    const inSavings = t.inAccount !== null && ctx.savingsAccounts.has(t.inAccount);
    if (inSavings && t.inAmount)
      savingsNet.set(t.inAccount!, (savingsNet.get(t.inAccount!) ?? 0) + t.inAmount);
    if (outSavings && t.outAmount)
      savingsNet.set(t.outAccount!, (savingsNet.get(t.outAccount!) ?? 0) - t.outAmount);
  }
  let toSavings = 0;
  let fromSavings = 0;
  for (const [account, net] of [...savingsNet].sort((a, b) => b[1] - a[1])) {
    if (net < 0) {
      link(node(`from:${account}`, `Из накоплений: ${account}`, 'fromSavings'), hub, -net);
      fromSavings += -net;
    }
  }

  const byParent = netExpenseBy(flows, (f) => f.parent);
  const byCategory = netExpenseBy(flows, (f) => f.category);

  // Categories where paybacks exceed spending (the original expense was booked elsewhere).
  let compensations = 0;
  for (const [parent, amount] of [...byParent].sort((a, b) => a[1] - b[1])) {
    if (amount >= 0) continue;
    link(node(`ref:${parent}`, `Возвраты: ${parent}`, 'income'), hub, -amount);
    compensations += -amount;
  }

  let expense = 0;
  for (const [parent, amount] of [...byParent].sort((a, b) => b[1] - a[1])) {
    if (amount <= 0) continue;
    expense += amount;
    const parentId = node(`exp:${parent}`, parent, 'expense');
    link(hub, parentId, amount);
    const children = [...byCategory].filter(
      ([c, v]) => v > 0 && c !== parent && c.startsWith(`${parent} / `),
    );
    if (children.length === 0) continue;
    for (const [child, v] of children.sort((a, b) => b[1] - a[1])) {
      link(parentId, node(`sub:${child}`, child.slice(parent.length + 3), 'subexpense'), v);
    }
    const own = byCategory.get(parent) ?? 0;
    if (own > 0)
      link(parentId, node(`sub:${parent}`, `${parent} (без подкатегории)`, 'subexpense'), own);
  }

  for (const [account, net] of [...savingsNet].sort((a, b) => b[1] - a[1])) {
    if (net > 0) {
      link(hub, node(`sav:${account}`, `Накопления: ${account}`, 'savings'), net);
      toSavings += net;
    }
  }

  const balance = income + compensations + fromSavings - expense - toSavings;
  let rest = 0;
  let deficit = 0;
  if (balance > 0) {
    rest = balance;
    link(hub, node('rest', 'Остаток на счетах', 'rest'), rest);
  } else if (balance < 0) {
    deficit = -balance;
    link(node('deficit', 'Из остатков на счетах', 'deficit'), hub, deficit);
  }
  return {
    nodes: [...nodes.values()]
      .filter((n) => inSum.has(n.id) || outSum.has(n.id))
      .map((n) => ({
        ...n,
        value: major(Math.max(inSum.get(n.id) ?? 0, outSum.get(n.id) ?? 0)),
      })),
    links,
    totals: {
      income: major(income),
      compensations: major(compensations),
      expense: major(expense),
      toSavings: major(toSavings),
      fromSavings: major(fromSavings),
      rest: major(rest),
      deficit: major(deficit),
    },
  };
}
