import { useMemo } from 'react';
import { Badge, Card, Grid, Group, Stack, Table, Text, Title } from '@mantine/core';
import type { Anomalies, TxLite } from '@zm/shared';
import { useNavigate } from 'react-router';
import { useAnalytics } from '../api/queries';
import { EChart } from '../components/EChart';
import { ChartCard, Dashboard, QueryView } from '../components/ui';
import { categoryAxis, esc, tooltipBase, tooltipTitle, valueAxis } from '../lib/chartOptions';
import { monthEnd } from '../lib/dates';
import { dateShort, money, monthLabel, number, timesPhrase } from '../lib/format';
import { periodSearch, type Period } from '../lib/period';
import { useChartTheme } from '../lib/useChartTheme';

export function AnomaliesPage() {
  return (
    <Dashboard title="Крупные и необычные траты">
      {(period) => <AnomaliesContent period={period} />}
    </Dashboard>
  );
}

function AnomaliesContent({ period }: { period: Period }) {
  const query = useAnalytics<Anomalies>('anomalies', {
    from: period.from,
    to: period.to,
    currency: period.currency,
  });
  return <QueryView query={query}>{(a) => <AnomaliesView a={a} period={period} />}</QueryView>;
}

function title(tx: TxLite): string {
  return tx.payee ?? tx.comment ?? tx.category ?? 'Без категории';
}

function AnomaliesView({ a, period }: { a: Anomalies; period: Period }) {
  const cur = period.currency ?? 'RUB';
  const navigate = useNavigate();
  const openDay = (date: string) =>
    navigate(`/transactions${periodSearch({ ...period, from: date, to: date })}`);

  return (
    <Stack gap="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card h="100%">
            <Title order={4}>Необычные траты</Title>
            <Text size="sm" c="dimmed" mb="md">
              Заметно больше обычного чека у того же получателя (или в той же категории) за
              предыдущие полгода
            </Text>
            {a.unusual.length === 0 ? (
              <Text c="dimmed" size="sm">
                Ничего необычного — или пока мало истории: нужно хотя бы 5 похожих операций за
                полгода.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={520}>
                <Table className="tabular" highlightOnHover verticalSpacing={8}>
                  <Table.Tbody>
                    {a.unusual.map((u) => (
                      <Table.Tr
                        key={u.id}
                        className="clickable-row"
                        onClick={() => openDay(u.date)}
                      >
                        <Table.Td w={96}>
                          <Text size="sm">{dateShort(u.date)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{title(u)}</Text>
                          <Text size="xs" c="dimmed">
                            {timesPhrase(u.ratio)} больше обычного{' '}
                            {u.basis === 'payee' ? `чека у «${u.key}»` : `в категории «${u.key}»`}{' '}
                            (медиана {money(u.median, cur)} по {u.historyCount} операциям)
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={600}>
                            {money(u.amount, cur)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card h="100%">
            <Title order={4}>Всплески по категориям</Title>
            <Text size="sm" c="dimmed" mb="md">
              Месяцы, когда категория обошлась в 1,5+ раза дороже среднего за 3 предыдущих месяца
            </Text>
            {a.spikes.length === 0 ? (
              <Text c="dimmed" size="sm">
                Всплесков нет — или недостаточно истории (нужны данные за предыдущие месяцы).
              </Text>
            ) : (
              <Stack gap="sm">
                {a.spikes.map((s) => (
                  <Group
                    key={`${s.month}:${s.category}`}
                    justify="space-between"
                    wrap="nowrap"
                    className="clickable-row"
                    p={4}
                    style={{ borderRadius: 6 }}
                    onClick={() =>
                      navigate(
                        `/transactions${periodSearch(
                          { ...period, from: `${s.month}-01`, to: monthEnd(`${s.month}-01`) },
                          { category: s.category, type: 'expense' },
                        )}`,
                      )
                    }
                  >
                    <div>
                      <Text size="sm">{s.category}</Text>
                      <Text size="xs" c="dimmed">
                        {monthLabel(s.month)} ·{' '}
                        {s.ratio === null
                          ? 'раньше трат не было'
                          : `обычно ${money(s.baseline, cur)}`}
                      </Text>
                    </div>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} className="tabular">
                        {money(s.amount, cur)}
                      </Text>
                      <Badge variant="light" color={s.ratio === null ? 'gray' : 'orange'}>
                        {s.ratio === null ? 'новое' : `×${number(s.ratio)}`}
                      </Badge>
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>
      <LargestChart items={a.largest} currency={cur} onOpen={openDay} />
    </Stack>
  );
}

function LargestChart({
  items,
  currency,
  onOpen,
}: {
  items: TxLite[];
  currency: string;
  onOpen: (date: string) => void;
}) {
  const t = useChartTheme();
  const rows = [...items].reverse();
  const option = useMemo(
    () => ({
      grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const tx = rows[p.dataIndex]!;
          return (
            tooltipTitle(`${dateShort(tx.date)} · ${tx.category ?? 'Без категории'}`) +
            `<div>${esc(title(tx))}</div><b>${esc(money(tx.amount, currency))}</b>` +
            (tx.account ? `<div style="opacity:.7">${esc(tx.account)}</div>` : '')
          );
        },
      },
      xAxis: valueAxis(t),
      yAxis: {
        ...categoryAxis(
          t,
          rows.map((r) => `${dateShort(r.date).slice(0, 5)} ${title(r).slice(0, 28)}`),
        ),
        axisLabel: { color: t.textSecondary, fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.amount),
          barMaxWidth: 18,
          itemStyle: { color: t.series[1], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            color: t.textSecondary,
            fontSize: 11,
            formatter: (p: { value: number }) => money(p.value, currency),
          },
        },
      ],
    }),
    [t, rows, currency],
  );

  return (
    <ChartCard
      title="Крупнейшие траты"
      subtitle={`Топ-${items.length} расходов за период`}
      table={{
        columns: ['Дата', 'Получатель / комментарий', 'Категория', 'Счёт', 'Сумма'],
        rows: items.map((r) => [
          dateShort(r.date),
          title(r),
          r.category ?? 'Без категории',
          r.account ?? '',
          money(r.amount, currency),
        ]),
        numeric: [4],
      }}
    >
      {items.length === 0 ? (
        <Text c="dimmed">Расходов за период нет.</Text>
      ) : (
        <EChart
          option={option}
          height={Math.max(240, items.length * 28 + 20)}
          ariaLabel="Крупнейшие траты"
          onClick={(e) => onOpen(rows[e.dataIndex]!.date)}
        />
      )}
    </ChartCard>
  );
}
