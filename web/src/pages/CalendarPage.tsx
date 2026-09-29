import { useMemo, useState } from 'react';
import { Card, CloseButton, Grid, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { CalendarData, TransactionsResponse } from '@zm/shared';
import { api } from '../api/client';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { TxList } from '../components/TxList';
import { ChartCard, Dashboard, PageLoader, QueryView } from '../components/ui';
import {
  barStyle,
  categoryAxis,
  esc,
  tooltipBase,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from '../lib/chartOptions';
import { toEpochDay } from '../lib/dates';
import { dateLong, money, pluralize, WEEKDAYS_SHORT } from '../lib/format';
import type { Period } from '../lib/period';
import { useChartTheme } from '../lib/useChartTheme';

const WEEKDAYS_FULL = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
];
const MONTH_NAMES = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
];

export function CalendarPage() {
  return (
    <Dashboard title="Календарь трат">{(period) => <CalendarContent period={period} />}</Dashboard>
  );
}

function CalendarContent({ period }: { period: Period }) {
  const query = useAnalytics<CalendarData>('calendar', {
    from: period.from,
    to: period.to,
    currency: period.currency,
  });
  return <QueryView query={query}>{(c) => <CalendarView c={c} period={period} />}</QueryView>;
}

function quantile(values: number[], q: number): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]!;
}

function CalendarView({ c, period }: { c: CalendarData; period: Period }) {
  const t = useChartTheme();
  const cur = period.currency ?? 'RUB';
  const [day, setDay] = useState<string | null>(null);
  const spanDays = toEpochDay(period.to) - toEpochDay(period.from) + 1;
  const vertical = spanDays <= 62;
  const weeks = Math.ceil(spanDays / 7) + 1;
  // Cap the scale at P95 so one huge day doesn't wash out the rest.
  const max = Math.max(
    1,
    quantile(
      c.days.map((d) => d.expense),
      0.95,
    ),
  );
  const total = c.days.reduce((s, d) => s + d.expense, 0);
  const activeDays = c.days.filter((d) => d.count > 0).length;

  const heatmap = useMemo(
    () => ({
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { value: [string, number, number] }) =>
          tooltipTitle(dateLong(p.value[0])) +
          tooltipRow(
            t.series[0]!,
            `${p.value[2]} ${pluralize(p.value[2], 'операция', 'операции', 'операций')}`,
            money(p.value[1], cur),
          ),
      },
      visualMap: {
        min: 0,
        max,
        dimension: 1,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 160,
        text: [`${money(max, cur)}+`, '0'],
        textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: t.sequential },
      },
      calendar: {
        range: [period.from, period.to],
        orient: vertical ? 'vertical' : 'horizontal',
        top: vertical ? 30 : 30,
        left: vertical ? 'center' : 40,
        right: vertical ? undefined : 16,
        bottom: 56,
        cellSize: vertical ? [44, 36] : ['auto', 16],
        splitLine: { show: false },
        itemStyle: { color: t.surface, borderColor: t.surface, borderWidth: 2 },
        dayLabel: {
          firstDay: 1,
          nameMap: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
          color: t.muted,
          fontSize: 11,
        },
        monthLabel: { nameMap: MONTH_NAMES, color: t.muted, fontSize: 11 },
        yearLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: c.days.map((d) => [d.date, d.expense, d.count]),
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
        },
      ],
    }),
    [t, c, max, period.from, period.to, vertical, cur],
  );

  const weekday = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.4 } },
        formatter: (params: { dataIndex: number; color: string; value: number }[]) => {
          const w = c.weekday[params[0]?.dataIndex ?? 0]!;
          return (
            tooltipTitle(`В среднем, ${WEEKDAYS_FULL[w.weekday]}`) +
            tooltipRow(t.series[0]!, 'в день', money(w.avg, cur)) +
            tooltipRow(t.neutral, 'за период', money(w.total, cur))
          );
        },
      },
      xAxis: categoryAxis(t, WEEKDAYS_SHORT),
      yAxis: valueAxis(t),
      series: [
        {
          type: 'bar',
          data: c.weekday.map((w) => w.avg),
          barMaxWidth: 24,
          itemStyle: barStyle(t.series[0]!),
        },
      ],
    }),
    [t, c, cur],
  );

  const hours = Array.from({ length: 24 }, (_, h) => String(h));
  const hourMax = Math.max(
    1,
    quantile(
      c.hourMatrix.map((h) => h.amount),
      0.95,
    ),
  );
  const hourly = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        formatter: (p: { value: [number, number, number, number] }) =>
          tooltipTitle(`${esc(WEEKDAYS_FULL[p.value[1]])}, ${p.value[0]}:00–${p.value[0]}:59`) +
          tooltipRow(
            t.series[0]!,
            `${p.value[3]} ${pluralize(p.value[3], 'операция', 'операции', 'операций')}`,
            money(p.value[2], cur),
          ),
      },
      xAxis: { ...categoryAxis(t, hours), splitArea: { show: false } },
      yAxis: { ...categoryAxis(t, WEEKDAYS_SHORT), inverse: true },
      visualMap: {
        min: 0,
        max: hourMax,
        dimension: 2,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 160,
        text: [`${money(hourMax, cur)}+`, '0'],
        textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: t.sequential },
      },
      series: [
        {
          type: 'heatmap',
          data: c.hourMatrix.map((h) => [h.hour, h.weekday, h.amount, h.count]),
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        },
      ],
    }),
    [t, c, hours, hourMax, cur],
  );

  return (
    <Stack gap="md">
      <ChartCard
        title="Траты по дням"
        subtitle={`${money(total, cur)} за ${activeDays} ${pluralize(activeDays, 'день', 'дня', 'дней')} с тратами · нажмите на день, чтобы увидеть операции`}
        table={{
          columns: ['Дата', 'Расходы', 'Операций'],
          rows: c.days
            .filter((d) => d.count > 0)
            .map((d) => [dateLong(d.date), money(d.expense, cur), d.count]),
          numeric: [1, 2],
        }}
      >
        <EChart
          option={heatmap}
          height={vertical ? Math.max(300, weeks * 38 + 100) : 260}
          ariaLabel="Календарь трат по дням"
          onClick={(e) => {
            const v = e.value as [string, number, number] | undefined;
            if (v) setDay(v[0]);
          }}
        />
      </ChartCard>
      {day && <DayDetails day={day} currency={cur} onClose={() => setDay(null)} />}
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <ChartCard
            title="По дням недели"
            subtitle="Средние траты за день"
            table={{
              columns: ['День', 'В среднем', 'Всего'],
              rows: c.weekday.map((w) => [
                WEEKDAYS_FULL[w.weekday]!,
                money(w.avg, cur),
                money(w.total, cur),
              ]),
              numeric: [1, 2],
            }}
          >
            <EChart option={weekday} height={280} ariaLabel="Средние траты по дням недели" />
          </ChartCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <ChartCard
            title="День недели × час"
            subtitle="Когда вы тратите: по времени создания операции"
            table={{
              columns: ['День', 'Час', 'Сумма', 'Операций'],
              rows: c.hourMatrix.map((h) => [
                WEEKDAYS_FULL[h.weekday]!,
                `${h.hour}:00`,
                money(h.amount, cur),
                h.count,
              ]),
              numeric: [2, 3],
            }}
          >
            {c.hasTime ? (
              <EChart option={hourly} height={280} ariaLabel="Траты по дням недели и часам" />
            ) : (
              <Text c="dimmed" size="sm">
                В выгрузке нет времени операций.
              </Text>
            )}
          </ChartCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function DayDetails({
  day,
  currency,
  onClose,
}: {
  day: string;
  currency: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['transactions', 'day', day],
    queryFn: () =>
      api<TransactionsResponse>('/api/transactions', {
        query: { from: day, to: day, type: 'expense', sort: 'amount', pageSize: 100 },
      }),
  });
  const total = q.data?.items.reduce((s, i) => s + (i.outAmount ?? 0), 0) ?? 0;
  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <div>
          <Title order={4}>{dateLong(day)}</Title>
          {q.data && (
            <Text size="sm" c="dimmed">
              Расходы: {money(total, currency)}
            </Text>
          )}
        </div>
        <CloseButton onClick={onClose} aria-label="Закрыть" />
      </Group>
      {q.isPending ? <PageLoader /> : <TxList items={q.data?.items ?? []} />}
    </Card>
  );
}
