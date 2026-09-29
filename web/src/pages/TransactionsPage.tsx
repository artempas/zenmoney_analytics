import { useState } from 'react';
import {
  ActionIcon,
  Card,
  Group,
  Menu,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconDots, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { Transaction, TransactionsResponse, TxType } from '@zm/shared';
import { api } from '../api/client';
import { useMeta } from '../api/queries';
import { REASON_LABELS, txAccount, txAmount, TypeBadge } from '../components/TxList';
import { EmptyData, ErrorAlert, PageLoader } from '../components/ui';
import { dateShort, moneyExact } from '../lib/format';

const TYPE_OPTIONS = [
  { value: 'all', label: 'Все типы' },
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'refund', label: 'Возвраты' },
  { value: 'transfer', label: 'Переводы' },
];

const REASON_OPTIONS = [
  { value: 'uncategorized', label: 'Без категории' },
  { value: 'paired', label: 'Пары-переводы' },
  { value: 'self', label: 'Переводы себе' },
  { value: 'savings', label: 'На накоп. счетах' },
  { value: 'manual', label: 'Изменённые вручную' },
];

const PAGE_SIZE = 50;

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [q] = useDebouncedValue(search, 300);
  const page = Number(params.get('page') ?? 1);

  const set = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );

  const filters = {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    type: params.get('type') ?? 'all',
    reason: params.get('reason') ?? undefined,
    category: params.get('category') ?? undefined,
    account: params.get('account') ?? undefined,
    q: q || undefined,
    sort: params.get('sort') ?? 'date',
    order: params.get('order') ?? 'desc',
    page,
    pageSize: PAGE_SIZE,
  };

  const list = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<TransactionsResponse>('/api/transactions', { query: filters }),
    placeholderData: keepPreviousData,
  });

  const setType = useMutation({
    mutationFn: ({ id, type }: { id: number; type: TxType | null }) =>
      api<Transaction>(`/api/transactions/${id}`, { method: 'PATCH', body: { type } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['analytics'] });
      notifications.show({
        message: 'Тип операции обновлён, аналитика пересчитана',
        color: 'brand',
      });
    },
    onError: (e) => notifications.show({ message: (e as Error).message, color: 'red' }),
  });

  if (meta.data?.txCount === 0) return <EmptyData />;

  const categoryOptions = [
    'Без категории',
    ...new Set(
      (meta.data?.categories ?? []).flatMap((c) =>
        c.includes(' / ') ? [c.split(' / ')[0]!, c] : [c],
      ),
    ),
  ];
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <Stack gap="md">
      <Title order={2}>Транзакции</Title>
      <Group gap="sm" wrap="wrap">
        <TextInput
          placeholder="Поиск по получателю, комментарию"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            set('page', null);
          }}
          w={280}
          aria-label="Поиск"
        />
        <Select
          data={TYPE_OPTIONS}
          value={filters.type}
          onChange={(v) => set('type', v === 'all' ? null : v)}
          w={150}
          aria-label="Тип"
          allowDeselect={false}
        />
        <Select
          data={categoryOptions}
          value={filters.category ?? null}
          onChange={(v) => set('category', v)}
          placeholder="Категория"
          searchable
          clearable
          w={220}
          aria-label="Категория"
        />
        <Select
          data={meta.data?.accounts ?? []}
          value={filters.account ?? null}
          onChange={(v) => set('account', v)}
          placeholder="Счёт"
          searchable
          clearable
          w={200}
          aria-label="Счёт"
        />
        <Select
          data={REASON_OPTIONS}
          value={filters.reason ?? null}
          onChange={(v) => set('reason', v)}
          placeholder="Как распознано"
          clearable
          w={200}
          aria-label="Как распознано"
        />
        <Select
          data={[
            { value: 'date:desc', label: 'Сначала новые' },
            { value: 'date:asc', label: 'Сначала старые' },
            { value: 'amount:desc', label: 'Сначала крупные' },
          ]}
          value={`${filters.sort}:${filters.order}`}
          onChange={(v) => {
            if (!v) return;
            const [sort, order] = v.split(':');
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('sort', sort!);
                next.set('order', order!);
                next.delete('page');
                return next;
              },
              { replace: true },
            );
          }}
          w={180}
          aria-label="Сортировка"
          allowDeselect={false}
        />
      </Group>
      {(filters.from || filters.to) && (
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            Период: {filters.from ? dateShort(filters.from) : '…'} –{' '}
            {filters.to ? dateShort(filters.to) : '…'}
          </Text>
          <Text
            size="sm"
            c="brand"
            style={{ cursor: 'pointer' }}
            onClick={() =>
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('from');
                next.delete('to');
                next.delete('page');
                return next;
              })
            }
          >
            показать за всё время
          </Text>
        </Group>
      )}
      <Card padding={0}>
        {list.isPending ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorAlert error={list.error} />
        ) : (
          <div className={list.isFetching ? 'refetching' : undefined}>
            <Table.ScrollContainer minWidth={820}>
              <Table
                className="tabular"
                highlightOnHover
                verticalSpacing="sm"
                horizontalSpacing="md"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={100}>Дата</Table.Th>
                    <Table.Th>Операция</Table.Th>
                    <Table.Th>Счёт</Table.Th>
                    <Table.Th>Тип</Table.Th>
                    <Table.Th ta="right">Сумма</Table.Th>
                    <Table.Th w={40} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.data.items.map((tx) => {
                    const a = txAmount(tx);
                    return (
                      <Table.Tr key={tx.id}>
                        <Table.Td>
                          <Text size="sm">{dateShort(tx.date)}</Text>
                          {tx.time && (
                            <Text size="xs" c="dimmed">
                              {tx.time}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td maw={380}>
                          <Text size="sm">{tx.payee ?? (tx.category ? tx.category : '—')}</Text>
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {[tx.payee ? tx.category : null, tx.comment]
                              .filter(Boolean)
                              .join(' · ') || (tx.category ? '' : 'Без категории')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{txAccount(tx)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <TypeBadge tx={tx} />
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text
                            size="sm"
                            fw={600}
                            c={tx.type === 'transfer' ? 'dimmed' : undefined}
                          >
                            {a.sign}
                            {moneyExact(a.value, a.currency || 'RUB')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                              <Tooltip label="Изменить тип">
                                <ActionIcon variant="subtle" color="gray" aria-label="Изменить тип">
                                  <IconDots size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Label>Считать операцию</Menu.Label>
                              {(['expense', 'income', 'transfer'] as const).map((type) => (
                                <Menu.Item
                                  key={type}
                                  disabled={tx.type === type && tx.reason === 'manual'}
                                  onClick={() => setType.mutate({ id: tx.id, type })}
                                >
                                  {type === 'expense'
                                    ? 'Расходом'
                                    : type === 'income'
                                      ? 'Доходом'
                                      : 'Переводом между своими счетами'}
                                </Menu.Item>
                              ))}
                              {tx.reason === 'manual' && (
                                <>
                                  <Menu.Divider />
                                  <Menu.Item
                                    onClick={() => setType.mutate({ id: tx.id, type: null })}
                                  >
                                    Вернуть автоматическое определение
                                  </Menu.Item>
                                </>
                              )}
                              {tx.reason !== 'native' && tx.reason !== 'manual' && (
                                <>
                                  <Menu.Divider />
                                  <Menu.Label>Сейчас: {REASON_LABELS[tx.reason]}</Menu.Label>
                                </>
                              )}
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {list.data.items.length === 0 && (
              <Text c="dimmed" ta="center" py="xl">
                Ничего не найдено
              </Text>
            )}
          </div>
        )}
      </Card>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {list.data ? `Найдено операций: ${list.data.total}` : ''}
        </Text>
        {totalPages > 1 && (
          <Pagination total={totalPages} value={page} onChange={(p) => set('page', String(p))} />
        )}
      </Group>
    </Stack>
  );
}
