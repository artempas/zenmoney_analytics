import { Badge, Group, Table, Text } from '@mantine/core';
import type { Transaction } from '@zm/shared';
import { dateShort, moneyExact } from '../lib/format';

export const REASON_LABELS: Record<Transaction['reason'], string> = {
  native: '',
  paired: 'пара',
  self: 'перевод себе',
  savings: 'накоп. счёт',
  manual: 'вручную',
  uncategorized: 'без категории',
};

export const TYPE_LABELS: Record<Transaction['type'], string> = {
  expense: 'Расход',
  income: 'Доход',
  transfer: 'Перевод',
};

export function txAmount(tx: Transaction): {
  value: number;
  currency: string;
  sign: '+' | '−' | '';
} {
  if (tx.type === 'expense')
    return {
      value: tx.outAmount ?? tx.inAmount ?? 0,
      currency: tx.outCurrency ?? tx.inCurrency ?? '',
      sign: '−',
    };
  if (tx.type === 'income')
    return {
      value: tx.inAmount ?? tx.outAmount ?? 0,
      currency: tx.inCurrency ?? tx.outCurrency ?? '',
      sign: '+',
    };
  return {
    value: tx.outAmount ?? tx.inAmount ?? 0,
    currency: tx.outCurrency ?? tx.inCurrency ?? '',
    sign: '',
  };
}

export function txAccount(tx: Transaction): string {
  if (tx.outAccount && tx.inAccount) return `${tx.outAccount} → ${tx.inAccount}`;
  return tx.outAccount ?? tx.inAccount ?? '';
}

export function TypeBadge({ tx }: { tx: Transaction }) {
  const color = tx.isRefund
    ? 'teal'
    : tx.type === 'expense'
      ? 'orange'
      : tx.type === 'income'
        ? 'brand'
        : 'gray';
  return (
    <Group gap={4} wrap="nowrap">
      <Badge variant="light" color={color} size="sm">
        {tx.isRefund ? 'Возврат' : TYPE_LABELS[tx.type]}
      </Badge>
      {REASON_LABELS[tx.reason] && (
        <Badge variant="outline" color="gray" size="sm">
          {REASON_LABELS[tx.reason]}
        </Badge>
      )}
    </Group>
  );
}

/** Compact read-only list of operations (for drill-downs inside dashboards). */
export function TxList({ items }: { items: Transaction[] }) {
  if (items.length === 0)
    return (
      <Text c="dimmed" size="sm">
        Операций нет.
      </Text>
    );
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table className="tabular" verticalSpacing={6}>
        <Table.Tbody>
          {items.map((tx) => {
            const a = txAmount(tx);
            return (
              <Table.Tr key={tx.id}>
                <Table.Td w={96}>
                  <Text size="sm">{dateShort(tx.date)}</Text>
                  {tx.time && (
                    <Text size="xs" c="dimmed">
                      {tx.time}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{tx.payee ?? tx.comment ?? '—'}</Text>
                  <Text size="xs" c="dimmed">
                    {tx.category ?? 'Без категории'} · {txAccount(tx)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" fw={600}>
                    {a.sign}
                    {moneyExact(a.value, a.currency || 'RUB')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
