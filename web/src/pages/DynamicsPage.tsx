import { useMemo, useState } from 'react';
import { Grid, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import type { Monthly } from '@zm/shared';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { ChartCard, Dashboard, QueryView } from '../components/ui';
import {
  barStyle,
  categoryAxis,
  legendBase,
  tooltipBase,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from '../lib/chartOptions';
import { money, monthGenitive, monthLabel, monthShort } from '../lib/format';
import type { Period } from '../lib/period';
import type { ChartTheme } from '../lib/palette';
import { useChartTheme } from '../lib/useChartTheme';

const RANGES = [
  { value: '6', label: '6 мес' },
  { value: '12', label: '12 мес' },
  { value: '24', label: '24 мес' },
  { value: '120', label: 'Всё' },
];

export function DynamicsPage() {
  const [months, setMonths] = useState('12');
  return (
    <Dashboard
      title="Динамика по месяцам"
      filters={
        <SegmentedControl
          data={RANGES}
          value={months}
          onChange={setMonths}
          aria-label="Количество месяцев"
        />
      }
    >
      {(period) => <DynamicsContent period={period} months={Number(months)} />}
    </Dashboard>
  );
}

function DynamicsContent({ period, months }: { period: Period; months: number }) {
  const query = useAnalytics<Monthly>('monthly', {
    to: period.to,
    months,
    currency: period.currency,
  });
  return (
    <>
      <Text size="sm" c="dimmed" mb="md">
        Последние месяцы до {monthGenitive(period.to.slice(0, 7))} включительно. Отрицательное
        сальдо — красным.
      </Text>
      <QueryView query={query}>
        {(m) => <DynamicsView m={m} currency={period.currency ?? 'RUB'} />}
      </QueryView>
    </>
  );
}

type AxisParam = {
  seriesName: string;
  value: number;
  color: string;
  axisValue: string;
  dataIndex: number;
};

function axisTooltip(t: ChartTheme, months: string[], currency: string) {
  return {
    ...tooltipBase(t),
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.4 } },
    formatter: (params: AxisParam[]) =>
      tooltipTitle(monthLabel(months[params[0]?.dataIndex ?? 0] ?? '')) +
      params
        .filter((p) => p.value !== 0 || params.length <= 3)
        .map((p) => tooltipRow(p.color, p.seriesName, money(p.value, currency)))
        .join(''),
  };
}

function DynamicsView({ m, currency }: { m: Monthly; currency: string }) {
  const t = useChartTheme();
  const labels = m.months.map(monthShort);
  const [category, setCategory] = useState<string | null>(null);
  const selected = m.byCategory.find((c) => c.category === category) ?? m.byParent[0] ?? null;

  const incomeExpense = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      legend: legendBase(t),
      tooltip: axisTooltip(t, m.months, currency),
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: [
        {
          name: 'Доходы',
          type: 'bar',
          data: m.income,
          barMaxWidth: 24,
          barGap: '15%',
          itemStyle: barStyle(t.series[0]!),
        },
        {
          name: 'Расходы',
          type: 'bar',
          data: m.expense,
          barMaxWidth: 24,
          itemStyle: barStyle(t.series[1]!),
        },
      ],
    }),
    [t, m, labels, currency],
  );

  const balance = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      legend: legendBase(t),
      tooltip: axisTooltip(t, m.months, currency),
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: [
        {
          name: 'Сальдо месяца',
          type: 'bar',
          barMaxWidth: 24,
          // Series color drives the legend swatch; negative months are recolored per bar.
          itemStyle: { color: t.series[0] },
          data: m.net.map((v) => ({
            value: v,
            itemStyle: {
              color: v >= 0 ? t.series[0] : t.series[7],
              borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
            },
          })),
        },
        {
          name: 'Накопленный итог',
          type: 'line',
          data: m.cumulative,
          symbolSize: 8,
          lineStyle: { width: 2, color: t.textSecondary },
          itemStyle: { color: t.textSecondary, borderColor: t.surface, borderWidth: 2 },
        },
      ],
    }),
    [t, m, labels, currency],
  );

  const stacked = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 60, bottom: 8, containLabel: true },
      legend: { ...legendBase(t), type: 'scroll' },
      tooltip: axisTooltip(t, m.months, currency),
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: m.byParent.map((c, i) => ({
        name: c.category,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 24,
        data: c.values,
        itemStyle: {
          color: c.category === 'Прочее' ? t.neutral : (t.series[i] ?? t.neutral),
          borderColor: t.surface,
          borderWidth: 1,
        },
      })),
    }),
    [t, m, labels, currency],
  );

  const trend = useMemo(() => {
    if (!selected) return null;
    const values = selected.values;
    const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    return {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: axisTooltip(t, m.months, currency),
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: [
        {
          name: selected.category,
          type: 'bar',
          barMaxWidth: 24,
          data: values,
          itemStyle: barStyle(t.series[0]!),
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: t.muted, type: 'solid', width: 1 },
            label: {
              color: t.textSecondary,
              formatter: `среднее ${money(avg, currency)}`,
              position: 'insideEndTop',
            },
            data: [{ yAxis: avg }],
          },
        },
      ],
    };
  }, [t, m, labels, currency, selected]);

  const monthRows = (cols: number[][]) =>
    m.months.map((mo, i) => [monthLabel(mo), ...cols.map((c) => money(c[i] ?? 0, currency))]);

  return (
    <Stack gap="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <ChartCard
            title="Доходы и расходы"
            table={{
              columns: ['Месяц', 'Доходы', 'Расходы'],
              rows: monthRows([m.income, m.expense]),
              numeric: [1, 2],
            }}
          >
            <EChart option={incomeExpense} height={300} ariaLabel="Доходы и расходы по месяцам" />
          </ChartCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <ChartCard
            title="Сальдо и накопленный итог"
            subtitle="Доходы минус расходы"
            table={{
              columns: ['Месяц', 'Сальдо', 'Накопленный итог'],
              rows: monthRows([m.net, m.cumulative]),
              numeric: [1, 2],
            }}
          >
            <EChart option={balance} height={300} ariaLabel="Сальдо по месяцам" />
          </ChartCard>
        </Grid.Col>
      </Grid>
      <ChartCard
        title="Расходы по категориям"
        subtitle="Крупнейшие категории за выбранные месяцы, остальные — в «Прочее»"
        table={{
          columns: ['Категория', ...m.months.map(monthShort)],
          rows: m.byParent.map((c) => [c.category, ...c.values.map((v) => money(v, currency))]),
          numeric: m.months.map((_, i) => i + 1),
        }}
      >
        <EChart option={stacked} height={360} ariaLabel="Расходы по категориям по месяцам" />
      </ChartCard>
      {selected && trend && (
        <ChartCard
          title="Тренд категории"
          actions={
            <Select
              aria-label="Категория"
              data={m.byCategory.map((c) => c.category)}
              value={selected.category}
              onChange={setCategory}
              searchable
              allowDeselect={false}
              w={240}
              size="xs"
            />
          }
          table={{
            columns: ['Месяц', selected.category],
            rows: monthRows([selected.values]),
            numeric: [1],
          }}
        >
          <EChart
            option={trend}
            height={260}
            ariaLabel={`Расходы в категории ${selected.category} по месяцам`}
          />
        </ChartCard>
      )}
    </Stack>
  );
}
