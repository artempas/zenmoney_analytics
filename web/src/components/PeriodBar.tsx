import { useState } from 'react';
import { ActionIcon, Group, Select, Text, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { addMonths, isWholeMonth, monthEnd, monthsBetween, monthStart } from '../lib/dates';
import { dateShort, monthLabel } from '../lib/format';
import { usePeriod } from '../lib/period';

type Preset = { value: string; label: string; from: string; to: string };

/** The single filter row above a dashboard: period (presets first, then custom) and currency. */
export function PeriodBar({ children }: { children?: React.ReactNode }) {
  const { period, setPeriod, setCurrency, meta } = usePeriod();
  const [custom, setCustom] = useState(false);
  const m = meta.data;
  if (!period || !m?.dateFrom || !m.dateTo) return null;

  const last = m.dateTo;
  const presets: Preset[] = [
    {
      value: 'last3',
      label: 'Последние 3 месяца',
      from: monthStart(addMonths(last, -2)),
      to: monthEnd(last),
    },
    {
      value: 'last12',
      label: 'Последние 12 месяцев',
      from: monthStart(addMonths(last, -11)),
      to: monthEnd(last),
    },
    { value: 'all', label: 'Весь период', from: monthStart(m.dateFrom), to: monthEnd(last) },
    ...monthsBetween(m.dateFrom, last).map((month) => ({
      value: `m:${month}`,
      label: monthLabel(month),
      from: `${month}-01`,
      to: monthEnd(`${month}-01`),
    })),
  ];
  // A single month is the most specific name for a period, so it wins over "all time" etc.
  const matches = presets.filter((p) => p.from === period.from && p.to === period.to);
  const match = matches.find((p) => p.value.startsWith('m:')) ?? matches[0];
  const value = custom || !match ? 'custom' : match.value;
  const whole = isWholeMonth(period.from, period.to);

  const data = [
    {
      group: 'Периоды',
      items: presets.slice(0, 3).map((p) => ({ value: p.value, label: p.label })),
    },
    { group: 'Месяцы', items: presets.slice(3).map((p) => ({ value: p.value, label: p.label })) },
    {
      group: 'Другое',
      items: [
        {
          value: 'custom',
          label:
            value === 'custom'
              ? `${dateShort(period.from)} – ${dateShort(period.to)}`
              : 'Произвольный период…',
        },
      ],
    },
  ];

  const shiftMonth = (delta: number) => {
    const from = monthStart(addMonths(period.from, delta));
    setPeriod(from, monthEnd(from));
  };

  return (
    <Group gap="sm" mb="lg" wrap="wrap" align="center">
      {whole && (
        <Tooltip label="Предыдущий месяц">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => shiftMonth(-1)}
            aria-label="Предыдущий месяц"
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      <Select
        aria-label="Период"
        data={data}
        value={value}
        onChange={(v) => {
          if (!v) return;
          if (v === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          const p = presets.find((x) => x.value === v);
          if (p) setPeriod(p.from, p.to);
        }}
        allowDeselect={false}
        w={240}
        maxDropdownHeight={360}
        comboboxProps={{ shadow: 'md' }}
      />
      {whole && (
        <Tooltip label="Следующий месяц">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => shiftMonth(1)}
            aria-label="Следующий месяц"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      {value === 'custom' && (
        <DatePickerInput
          type="range"
          aria-label="Произвольный период"
          value={[period.from, period.to]}
          onChange={([from, to]) => {
            if (from && to) setPeriod(String(from).slice(0, 10), String(to).slice(0, 10));
          }}
          valueFormat="DD.MM.YYYY"
          w={240}
          allowSingleDateInRange
        />
      )}
      {m.currencies.length > 1 && (
        <Select
          aria-label="Валюта"
          data={m.currencies}
          value={period.currency ?? null}
          onChange={(v) => v && setCurrency(v)}
          allowDeselect={false}
          w={100}
        />
      )}
      {children}
      <Text size="xs" c="dimmed" ml="auto">
        Данные: {dateShort(m.dateFrom)} – {dateShort(m.dateTo)}
      </Text>
    </Group>
  );
}
