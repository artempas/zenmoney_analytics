import { useMemo } from 'react';
import { Grid, SimpleGrid, Stack, Text } from '@mantine/core';
import type { IncomeData } from '@zm/shared';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { ChartCard, Dashboard, QueryView, StatTile } from '../components/ui';
import {
  barStyle,
  categoryAxis,
  legendBase,
  tooltipBase,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from '../lib/chartOptions';
import { dateLong, money, monthLabel, monthShort, percent } from '../lib/format';
import type { Period } from '../lib/period';
import { useChartTheme } from '../lib/useChartTheme';

export function IncomePage() {
  return (
    <Dashboard title="Доходы и пассивный доход">
      {(period) => <IncomeContent period={period} />}
    </Dashboard>
  );
}

function IncomeContent({ period }: { period: Period }) {
  const query = useAnalytics<IncomeData>('income', {
    from: period.from,
    to: period.to,
    currency: period.currency,
  });
  return (
    <QueryView query={query}>
      {(d) => <IncomeView d={d} currency={period.currency ?? 'RUB'} />}
    </QueryView>
  );
}

const MAX_SOURCES = 7;

function IncomeView({ d, currency }: { d: IncomeData; currency: string }) {
  const t = useChartTheme();

  // Fold the tail into "Прочее" so the stack stays within the 8-slot palette.
  const sources = useMemo(() => {
    const top = d.sources.slice(0, MAX_SOURCES);
    const rest = d.sources.slice(MAX_SOURCES);
    if (rest.length) {
      top.push({
        source: 'Прочее',
        passive: false,
        values: d.months.map((_, i) => rest.reduce((s, r) => s + (r.values[i] ?? 0), 0)),
        total: rest.reduce((s, r) => s + r.total, 0),
      });
    }
    return top;
  }, [d]);

  const bySource = useMemo(() => {
    const multiMonth = d.months.length > 1;
    const color = (i: number, name: string) =>
      name === 'Прочее' ? t.neutral : (t.series[i] ?? t.neutral);
    if (!multiMonth) {
      const rows = [...sources].reverse();
      return {
        grid: { left: 8, right: 100, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          ...tooltipBase(t),
          formatter: (p: { dataIndex: number }) => {
            const s = rows[p.dataIndex]!;
            return (
              tooltipTitle(s.source + (s.passive ? ' · пассивный' : '')) +
              tooltipRow(t.series[0]!, 'за период', money(s.total, currency))
            );
          },
        },
        xAxis: { ...valueAxis(t), axisLabel: { show: false } },
        yAxis: {
          ...categoryAxis(
            t,
            rows.map((s) => s.source),
          ),
          axisLabel: { color: t.textSecondary, fontSize: 12 },
        },
        series: [
          {
            type: 'bar',
            barMaxWidth: 20,
            data: rows.map((s) => ({
              value: s.total,
              itemStyle: { color: s.passive ? t.series[2] : t.series[0] },
            })),
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: {
              show: true,
              position: 'right',
              color: t.textSecondary,
              fontSize: 11,
              formatter: (p: { value: number }) => money(p.value, currency),
            },
          },
        ],
      };
    }
    return {
      grid: { left: 8, right: 8, top: 60, bottom: 8, containLabel: true },
      legend: { ...legendBase(t), type: 'scroll' },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.4 } },
        formatter: (
          params: { seriesName: string; value: number; color: string; dataIndex: number }[],
        ) =>
          tooltipTitle(monthLabel(d.months[params[0]?.dataIndex ?? 0] ?? '')) +
          params
            .filter((p) => p.value > 0)
            .map((p) => tooltipRow(p.color, p.seriesName, money(p.value, currency)))
            .join(''),
      },
      xAxis: categoryAxis(t, d.months.map(monthShort)),
      yAxis: valueAxis(t),
      series: sources.map((s, i) => ({
        name: s.source,
        type: 'bar',
        stack: 'income',
        barMaxWidth: 24,
        data: s.values,
        itemStyle: { color: color(i, s.source), borderColor: t.surface, borderWidth: 1 },
      })),
    };
  }, [t, d, sources, currency]);

  const cumulative = useMemo(
    () => ({
      grid: { left: 8, right: 90, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.axis, width: 1 } },
        formatter: (params: { value: number; dataIndex: number }[]) => {
          const p = params[0];
          if (!p) return '';
          return (
            tooltipTitle(dateLong(d.passiveCumulative[p.dataIndex]!.date)) +
            tooltipRow(t.series[2]!, 'накоплено', money(p.value, currency, 2))
          );
        },
      },
      xAxis: {
        ...categoryAxis(
          t,
          d.passiveCumulative.map((p) => p.date.slice(8, 10) + '.' + p.date.slice(5, 7)),
        ),
        boundaryGap: false,
      },
      yAxis: valueAxis(t),
      series: [
        {
          type: 'line',
          data: d.passiveCumulative.map((p) => p.value),
          showSymbol: false,
          lineStyle: { width: 2, color: t.series[2] },
          areaStyle: { color: t.series[2], opacity: 0.1 },
          endLabel: {
            show: true,
            color: t.text,
            fontSize: 12,
            formatter: (p: { value: number }) => money(p.value, currency),
          },
        },
      ],
    }),
    [t, d, currency],
  );

  const byAccount = useMemo(() => {
    const rows = [...d.passiveByAccount].reverse();
    return {
      grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { dataIndex: number }) =>
          tooltipTitle(rows[p.dataIndex]!.account) +
          tooltipRow(
            t.series[2]!,
            'пассивный доход',
            money(rows[p.dataIndex]!.amount, currency, 2),
          ),
      },
      xAxis: { ...valueAxis(t), axisLabel: { show: false } },
      yAxis: {
        ...categoryAxis(
          t,
          rows.map((r) => r.account),
        ),
        axisLabel: { color: t.textSecondary, fontSize: 12 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 20,
          data: rows.map((r) => r.amount),
          itemStyle: barStyle(t.series[2]!, true),
          label: {
            show: true,
            position: 'right',
            color: t.textSecondary,
            fontSize: 11,
            formatter: (p: { value: number }) => money(p.value, currency),
          },
        },
      ],
    };
  }, [t, d, currency]);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <StatTile
          label="Доходы за период"
          value={money(d.total, currency)}
          hint="без возвратов и переводов"
        />
        <StatTile
          label="Пассивный доход"
          value={money(d.passive, currency)}
          hint="проценты, кэшбэк, дивиденды"
        />
        <StatTile
          label="Доля пассивного дохода"
          value={d.passiveShare === null ? '—' : percent(d.passiveShare, 1)}
          hint="от всех доходов"
        />
        <StatTile
          label="Пассивный доход в год"
          value={money(d.passiveAnnualRunRate, currency)}
          hint={`при текущем темпе · ${money(d.passiveMonthlyAvg, currency)} в месяц`}
        />
      </SimpleGrid>
      <ChartCard
        title="Источники дохода"
        subtitle={
          d.months.length > 1
            ? 'По месяцам'
            : 'За период · зелёно-бирюзовым отмечен пассивный доход'
        }
        table={{
          columns: ['Источник', 'Пассивный', ...d.months.map(monthShort), 'Итого'],
          rows: d.sources.map((s) => [
            s.source,
            s.passive ? 'да' : '',
            ...s.values.map((v) => money(v, currency)),
            money(s.total, currency),
          ]),
          numeric: [...d.months.map((_, i) => i + 2), d.months.length + 2],
        }}
      >
        {d.sources.length === 0 ? (
          <Text c="dimmed">Доходов за период нет.</Text>
        ) : (
          <EChart
            option={bySource}
            height={d.months.length > 1 ? 340 : Math.max(200, sources.length * 40)}
            ariaLabel="Доходы по источникам"
          />
        )}
      </ChartCard>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <ChartCard
            title="Пассивный доход нарастающим итогом"
            table={{
              columns: ['Дата', 'Накоплено'],
              rows: d.passiveCumulative.map((p) => [dateLong(p.date), money(p.value, currency, 2)]),
              numeric: [1],
            }}
          >
            {d.passive === 0 ? (
              <Text c="dimmed">
                Пассивного дохода за период не найдено. Отметьте нужные категории в настройках.
              </Text>
            ) : (
              <EChart
                option={cumulative}
                height={280}
                ariaLabel="Пассивный доход нарастающим итогом"
              />
            )}
          </ChartCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <ChartCard
            title="По счетам"
            subtitle="Куда начислялся пассивный доход"
            table={{
              columns: ['Счёт', 'Сумма'],
              rows: d.passiveByAccount.map((a) => [a.account, money(a.amount, currency, 2)]),
              numeric: [1],
            }}
          >
            {d.passiveByAccount.length === 0 ? (
              <Text c="dimmed">Нет данных.</Text>
            ) : (
              <EChart
                option={byAccount}
                height={Math.max(160, d.passiveByAccount.length * 44)}
                ariaLabel="Пассивный доход по счетам"
              />
            )}
          </ChartCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
