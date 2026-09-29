import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconFileImport,
  IconTable,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { usePeriod, type Period } from '../lib/period';
import { percent } from '../lib/format';
import { PeriodBar } from './PeriodBar';

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
  /** Indexes of right-aligned (numeric) columns. */
  numeric?: number[];
}

/** A chart card with an optional table-view twin (the accessible equivalent of the chart). */
export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  table?: TableView;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card>
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <div>
          <Title order={4}>{title}</Title>
          {subtitle && (
            <Text size="sm" c="dimmed">
              {subtitle}
            </Text>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          {actions}
          {table && (
            <SegmentedControl
              size="xs"
              value={view}
              onChange={(v) => setView(v as 'chart' | 'table')}
              aria-label="Вид"
              data={[
                { value: 'chart', label: <IconChartBar size={14} aria-label="График" /> },
                { value: 'table', label: <IconTable size={14} aria-label="Таблица" /> },
              ]}
            />
          )}
        </Group>
      </Group>
      {view === 'table' && table ? <DataTable {...table} /> : children}
    </Card>
  );
}

export function DataTable({ columns, rows, numeric = [] }: TableView) {
  return (
    <Table.ScrollContainer minWidth={400} maxHeight={420}>
      <Table striped highlightOnHover stickyHeader className="tabular">
        <Table.Thead>
          <Table.Tr>
            {columns.map((c, i) => (
              <Table.Th key={c} ta={numeric.includes(i) ? 'right' : undefined}>
                {c}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, ri) => (
            <Table.Tr key={ri}>
              {r.map((cell, ci) => (
                <Table.Td key={ci} ta={numeric.includes(ci) ? 'right' : undefined}>
                  {cell}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/**
 * Stat tile: label · value · delta vs a named period.
 * Delta color = direction × whether up is good; always paired with an arrow and text.
 */
export function StatTile({
  label,
  value,
  delta,
  upIsGood = true,
  hint,
}: {
  label: string;
  value: string;
  delta?: { value: number | null; label: string };
  upIsGood?: boolean;
  hint?: React.ReactNode;
}) {
  let deltaNode: React.ReactNode = null;
  if (delta && delta.value !== null && Number.isFinite(delta.value)) {
    const up = delta.value > 0;
    const flat = Math.abs(delta.value) < 0.005;
    const good = flat ? null : up === upIsGood;
    const Icon = up ? IconArrowUpRight : IconArrowDownRight;
    deltaNode = (
      <Group gap={4} wrap="nowrap">
        {!flat && <Icon size={14} color={good ? 'var(--app-good)' : 'var(--app-bad)'} />}
        <Text size="xs" c={flat ? 'dimmed' : good ? 'var(--app-good)' : 'var(--app-bad)'} fw={500}>
          {flat ? 'без изменений' : `${up ? '+' : '−'}${percent(Math.abs(delta.value))}`}
        </Text>
        <Text size="xs" c="dimmed">
          {delta.label}
        </Text>
      </Group>
    );
  } else if (delta) {
    deltaNode = (
      <Text size="xs" c="dimmed">
        нет данных {delta.label}
      </Text>
    );
  }
  return (
    <Card padding="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text className="stat-value" mt={4}>
        {value}
      </Text>
      <Stack gap={2} mt={6}>
        {deltaNode}
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function relativeDelta(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return (current - prev) / Math.abs(prev);
}

export function EmptyData() {
  return (
    <Center py={80}>
      <Stack align="center" gap="sm" maw={420}>
        <IconFileImport size={40} stroke={1.4} />
        <Title order={3}>Данных пока нет</Title>
        <Text c="dimmed" ta="center">
          Экспортируйте транзакции из ZenMoney в CSV и загрузите файл — после этого здесь появится
          аналитика.
        </Text>
        <Button component={Link} to="/import" leftSection={<IconFileImport size={16} />}>
          Загрузить выгрузку
        </Button>
      </Stack>
    </Center>
  );
}

export function PageLoader() {
  return (
    <Center py={80}>
      <Loader />
    </Center>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert color="red" title="Не удалось загрузить данные">
      {error instanceof Error ? error.message : String(error)}
    </Alert>
  );
}

/** Wraps a dashboard: the filter row on top, empty state when nothing is uploaded yet. */
export function Dashboard({
  title,
  filters,
  children,
}: {
  title: string;
  filters?: React.ReactNode;
  children: (period: Period) => React.ReactNode;
}) {
  const { period, meta } = usePeriod();
  if (meta.isPending) return <PageLoader />;
  if (meta.isError) return <ErrorAlert error={meta.error} />;
  return (
    <Stack gap={0}>
      <Title order={2} mb="md">
        {title}
      </Title>
      {!period || meta.data?.txCount === 0 ? (
        <EmptyData />
      ) : (
        <>
          <PeriodBar>{filters}</PeriodBar>
          {children(period)}
        </>
      )}
    </Stack>
  );
}

/** Renders query state: loader on first load, error, and dims the previous render while refetching. */
export function QueryView<T>({
  query,
  children,
}: {
  query: {
    data: T | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isPlaceholderData?: boolean;
    isFetching: boolean;
  };
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <PageLoader />;
  if (query.isError || query.data === undefined) return <ErrorAlert error={query.error} />;
  return <div className={query.isFetching ? 'refetching' : undefined}>{children(query.data)}</div>;
}
