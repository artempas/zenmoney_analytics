import { useMemo } from 'react';
import {
  Alert,
  Anchor,
  Card,
  Grid,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router';
import type { Overview } from '@zm/shared';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { ChartCard, Dashboard, QueryView, relativeDelta, StatTile } from '../components/ui';
import {
  categoryAxis,
  legendBase,
  tooltipBase,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from '../lib/chartOptions';
import { isWholeMonth } from '../lib/dates';
import { dateLong, money, percent } from '../lib/format';
import { periodSearch, type Period } from '../lib/period';
import { useChartTheme } from '../lib/useChartTheme';

export function OverviewPage() {
  return (
    <Dashboard title="Обзор периода">{(period) => <OverviewContent period={period} />}</Dashboard>
  );
}

function OverviewContent({ period }: { period: Period }) {
  const query = useAnalytics<Overview>('overview', {
    from: period.from,
    to: period.to,
    currency: period.currency,
  });
  return <QueryView query={query}>{(o) => <OverviewView o={o} period={period} />}</QueryView>;
}

function OverviewView({ o, period }: { o: Overview; period: Period }) {
  const cur = period.currency ?? 'RUB';
  const prevLabel = isWholeMonth(o.prevFrom, o.prevTo) ? 'к прошлому месяцу' : 'к прошлому периоду';
  const navigate = useNavigate();

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <StatTile
          label="Доходы"
          value={money(o.income, cur)}
          delta={{ value: relativeDelta(o.income, o.prev.income), label: prevLabel }}
        />
        <StatTile
          label="Расходы"
          value={money(o.expense, cur)}
          delta={{ value: relativeDelta(o.expense, o.prev.expense), label: prevLabel }}
          upIsGood={false}
          hint={o.refunds > 0 ? `с учётом возвратов на ${money(o.refunds, cur)}` : undefined}
        />
        <StatTile
          label="Сбережения"
          value={money(o.savings, cur)}
          delta={{ value: relativeDelta(o.savings, o.prev.savings), label: prevLabel }}
          hint="доходы минус расходы"
        />
        <StatTile
          label="Норма сбережений"
          value={o.savingsRate === null ? '—' : percent(o.savingsRate)}
          hint={
            o.prev.savingsRate === null
              ? 'доля дохода, которая осталась'
              : `в прошлом периоде: ${percent(o.prev.savingsRate)}`
          }
        />
      </SimpleGrid>

      {(o.uncategorized.expense > 0 || o.uncategorized.income > 0) && (
        <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            Операции без категории {o.uncategorized.included ? 'учтены' : 'не учтены'} в расчётах:
            расходы {money(o.uncategorized.expense, cur)}, поступления{' '}
            {money(o.uncategorized.income, cur)}.{' '}
            <Anchor
              component={Link}
              size="sm"
              to={`/transactions${periodSearch(period, { reason: 'uncategorized' })}`}
            >
              Посмотреть операции
            </Anchor>{' '}
            ·{' '}
            <Anchor component={Link} size="sm" to="/settings">
              Настроить правила
            </Anchor>
          </Text>
        </Alert>
      )}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <CumulativeChart o={o} currency={cur} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            {o.forecast && (
              <Card>
                <Text size="sm" c="dimmed">
                  Прогноз расходов на месяц
                </Text>
                <Text className="stat-value" mt={4}>
                  {money(o.forecast.projected, cur)}
                </Text>
                <Text size="xs" c="dimmed" mt={6}>
                  Потрачено {money(o.forecast.spent, cur)} по {dateLong(o.forecast.asOf, false)};
                  обычный темп {money(o.forecast.dailyRate, cur)} в день без учёта крупных разовых
                  трат.
                </Text>
              </Card>
            )}
            <Card>
              <Title order={4} mb="md">
                Куда ушли деньги
              </Title>
              {o.topCategories.length === 0 ? (
                <Text c="dimmed" size="sm">
                  Расходов за период нет.
                </Text>
              ) : (
                <Stack gap="sm">
                  {o.topCategories.map((c) => (
                    <div
                      key={c.category}
                      className="clickable-row"
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        navigate(
                          `/transactions${periodSearch(period, { category: c.category, type: 'expense' })}`,
                        )
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        navigate(
                          `/transactions${periodSearch(period, { category: c.category, type: 'expense' })}`,
                        )
                      }
                      style={{ borderRadius: 6, padding: 4 }}
                    >
                      <Group justify="space-between" mb={4} wrap="nowrap">
                        <Text size="sm" truncate>
                          {c.category}
                        </Text>
                        <Text size="sm" fw={600} className="tabular">
                          {money(c.amount, cur)}
                        </Text>
                      </Group>
                      <Progress
                        value={c.share * 100}
                        size="sm"
                        aria-label={`${percent(c.share)} расходов`}
                      />
                    </div>
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function CumulativeChart({ o, currency }: { o: Overview; currency: string }) {
  const t = useChartTheme();
  const { labels, current, baseline, baselineLabel } = o.cumulative;
  const hasBaseline = baseline.some((v) => v !== null);
  const isMonth = labels.length > 0 && labels[0] === '1';

  const option = useMemo(() => {
    const series: object[] = [];
    if (hasBaseline) {
      series.push({
        name: baselineLabel,
        type: 'line',
        data: baseline,
        showSymbol: false,
        lineStyle: { width: 2, color: t.neutral },
        itemStyle: { color: t.neutral },
        z: 1,
      });
    }
    series.push({
      name: 'Этот период',
      type: 'line',
      data: current,
      showSymbol: false,
      lineStyle: { width: 2, color: t.series[0] },
      itemStyle: { color: t.series[0] },
      areaStyle: { color: t.series[0], opacity: 0.1 },
      z: 2,
      endLabel: {
        show: true,
        color: t.text,
        fontSize: 12,
        formatter: (p: { value: number }) => money(p.value, currency),
      },
    });
    return {
      animationDuration: 300,
      grid: { left: 8, right: 90, top: hasBaseline ? 36 : 12, bottom: 8, containLabel: true },
      legend: hasBaseline ? { ...legendBase(t), data: ['Этот период', baselineLabel] } : undefined,
      tooltip: {
        ...tooltipBase(t),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.axis, width: 1 } },
        formatter: (
          params: { seriesName: string; value: number | null; color: string; axisValue: string }[],
        ) => {
          const title = isMonth ? `${params[0]?.axisValue}-е число` : (params[0]?.axisValue ?? '');
          return (
            tooltipTitle(title) +
            params
              .filter((p) => p.value !== null && p.value !== undefined)
              .map((p) => tooltipRow(p.color, p.seriesName, money(p.value as number, currency)))
              .join('')
          );
        },
      },
      xAxis: { ...categoryAxis(t, labels), boundaryGap: false },
      yAxis: valueAxis(t),
      series,
    };
  }, [t, labels, current, baseline, baselineLabel, hasBaseline, isMonth, currency]);

  return (
    <ChartCard
      title="Накопленные расходы"
      subtitle={
        hasBaseline
          ? `Сравнение: ${baselineLabel.toLowerCase()}`
          : 'Расходы нарастающим итогом по дням'
      }
      table={{
        columns: [
          isMonth ? 'День' : 'Дата',
          'Этот период',
          ...(hasBaseline ? [baselineLabel] : []),
        ],
        rows: labels.map((l, i) => [
          l,
          current[i] === null ? '—' : money(current[i]!, currency),
          ...(hasBaseline ? [baseline[i] === null ? '—' : money(baseline[i]!, currency)] : []),
        ]),
        numeric: [1, 2],
      }}
    >
      <EChart option={option} height={320} ariaLabel="График накопленных расходов по дням" />
    </ChartCard>
  );
}
