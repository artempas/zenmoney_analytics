import { useMemo, useState } from 'react';
import { SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import type { FlowData, FlowNodeKind } from '@zm/shared';
import { useNavigate } from 'react-router';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { ChartCard, Dashboard, QueryView, StatTile } from '../components/ui';
import { esc, tooltipBase, tooltipTitle } from '../lib/chartOptions';
import { money, percent } from '../lib/format';
import { periodSearch, type Period } from '../lib/period';
import type { ChartTheme } from '../lib/palette';
import { useChartTheme } from '../lib/useChartTheme';

export function FlowPage() {
  const [savings, setSavings] = useState(true);
  return (
    <Dashboard
      title="Поток денег"
      filters={
        <Switch
          label="Переводы в накопления"
          checked={savings}
          onChange={(e) => setSavings(e.currentTarget.checked)}
        />
      }
    >
      {(period) => <FlowContent period={period} savings={savings} />}
    </Dashboard>
  );
}

function FlowContent({ period, savings }: { period: Period; savings: boolean }) {
  const query = useAnalytics<FlowData>('flow', {
    from: period.from,
    to: period.to,
    currency: period.currency,
    savings: savings ? 1 : 0,
  });
  return (
    <QueryView query={query}>
      {(f) => <FlowView f={f} period={period} savings={savings} />}
    </QueryView>
  );
}

const LABEL_WIDTH = 220;

function nodeColor(t: ChartTheme, kind: FlowNodeKind): string {
  switch (kind) {
    case 'income':
      return t.series[2]!;
    case 'hub':
      return t.textSecondary;
    case 'expense':
    case 'subexpense':
      return t.series[1]!;
    case 'savings':
    case 'fromSavings':
      return t.series[0]!;
    default:
      return t.neutral;
  }
}

function FlowView({ f, period, savings }: { f: FlowData; period: Period; savings: boolean }) {
  const t = useChartTheme();
  const cur = period.currency ?? 'RUB';
  const navigate = useNavigate();
  const byId = useMemo(() => new Map(f.nodes.map((n) => [n.id, n])), [f.nodes]);

  const option = useMemo(
    () => ({
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: (p: {
          dataType: string;
          data: { id?: string; source?: string; target?: string; value: number };
        }) => {
          if (p.dataType === 'edge') {
            const s = byId.get(p.data.source ?? '');
            const tg = byId.get(p.data.target ?? '');
            return (
              tooltipTitle(`${s?.label ?? ''} → ${tg?.label ?? ''}`) +
              `<b>${esc(money(p.data.value, cur))}</b>`
            );
          }
          const n = byId.get(p.data.id ?? '');
          return tooltipTitle(n?.label ?? '') + `<b>${esc(money(n?.value ?? 0, cur))}</b>`;
        },
      },
      series: [
        {
          type: 'sankey',
          left: 8,
          right: LABEL_WIDTH,
          top: 8,
          bottom: 8,
          nodeWidth: 10,
          nodeGap: 10,
          // Each kind keeps its own column: sources · budget · categories · subcategories.
          nodeAlign: 'left',
          layoutIterations: 64,
          draggable: false,
          emphasis: { focus: 'adjacency' },
          label: {
            color: t.text,
            fontSize: 12,
            width: LABEL_WIDTH - 12,
            overflow: 'truncate',
            formatter: (p: { data: { id: string } }) => {
              const n = byId.get(p.data.id);
              return n ? `${n.label}  {v|${money(n.value, cur)}}` : '';
            },
            rich: { v: { color: t.muted, fontSize: 11 } },
          },
          lineStyle: { opacity: 0.3, curveness: 0.5 },
          data: f.nodes.map((n) => ({
            id: n.id,
            name: n.id,
            itemStyle: { color: nodeColor(t, n.kind), borderWidth: 0 },
          })),
          // Links take the color of their non-hub end, so money keeps its meaning along the way.
          links: f.links.map((l) => {
            const end = byId.get(l.source === 'hub' ? l.target : l.source);
            return { ...l, lineStyle: { color: end ? nodeColor(t, end.kind) : t.neutral } };
          }),
        },
      ],
    }),
    [t, f, byId, cur],
  );

  const height = Math.max(
    420,
    f.nodes.filter((n) => n.kind === 'subexpense' || n.kind === 'expense').length * 26,
  );
  const tot = f.totals;
  const spentShare = tot.income > 0 ? tot.expense / (tot.income + tot.compensations) : null;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <StatTile
          label="Поступило"
          value={money(tot.income + tot.compensations, cur)}
          hint={
            tot.compensations > 0
              ? `в т.ч. возвраты ${money(tot.compensations, cur)}`
              : 'доходы за период'
          }
        />
        <StatTile
          label="Потрачено"
          value={money(tot.expense, cur)}
          hint={spentShare === null ? undefined : `${percent(spentShare)} от поступлений`}
        />
        {savings ? (
          <StatTile
            label="В накопления (нетто)"
            value={money(tot.toSavings - tot.fromSavings, cur)}
            hint={`отложено ${money(tot.toSavings, cur)}, снято ${money(tot.fromSavings, cur)}`}
          />
        ) : (
          <StatTile
            label="Сбережения"
            value={money(tot.rest - tot.deficit, cur)}
            hint="поступления минус траты"
          />
        )}
        <StatTile
          label={tot.deficit > 0 ? 'Взято из остатков' : 'Осталось на счетах'}
          value={money(tot.deficit > 0 ? tot.deficit : tot.rest, cur)}
          hint={
            tot.deficit > 0 ? 'траты и накопления больше поступлений' : 'не потрачено и не отложено'
          }
        />
      </SimpleGrid>
      <ChartCard
        title="Откуда пришли и куда ушли деньги"
        subtitle="Нажмите на категорию, чтобы открыть её операции"
        table={{
          columns: ['Откуда', 'Куда', 'Сумма'],
          rows: f.links.map((l) => [
            byId.get(l.source)?.label ?? l.source,
            byId.get(l.target)?.label ?? l.target,
            money(l.value, cur),
          ]),
          numeric: [2],
        }}
      >
        {f.links.length === 0 ? (
          <Text c="dimmed">За период нет движений.</Text>
        ) : (
          <EChart
            option={option}
            height={height}
            ariaLabel="Диаграмма потоков денег"
            onClick={(e) => {
              const id = (e.data as { id?: string } | undefined)?.id;
              const n = id ? byId.get(id) : undefined;
              if (!n) return;
              if (n.kind === 'expense' || n.kind === 'subexpense') {
                const category = n.id.slice(4);
                navigate(`/transactions${periodSearch(period, { category, type: 'expense' })}`);
              } else if (n.kind === 'income') {
                navigate(`/transactions${periodSearch(period, { type: 'income' })}`);
              }
            }}
          />
        )}
      </ChartCard>
    </Stack>
  );
}
