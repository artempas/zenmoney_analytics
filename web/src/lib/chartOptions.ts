import type { ChartTheme } from './palette';
import { compact } from './format';

/** Escapes text coming from user data before it goes into an HTML tooltip. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tooltipBase(t: ChartTheme) {
  return {
    backgroundColor: t.surface,
    borderColor: t.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.text, fontSize: 12, fontFamily: 'inherit' },
    extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 8px;',
    confine: true,
  };
}

/** A tooltip row: value first (strong), series name after, keyed by a short line of the series color. */
export function tooltipRow(color: string, name: string, value: string): string {
  return (
    `<div style="display:flex;align-items:center;gap:8px;line-height:20px">` +
    `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${color}"></span>` +
    `<b style="font-variant-numeric:tabular-nums">${esc(value)}</b>` +
    `<span style="opacity:.7">${esc(name)}</span></div>`
  );
}

export function tooltipTitle(title: string): string {
  return `<div style="margin-bottom:4px;opacity:.7">${esc(title)}</div>`;
}

export function valueAxis(t: ChartTheme) {
  return {
    type: 'value' as const,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' as const } },
    axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compact(v) },
  };
}

export function categoryAxis(t: ChartTheme, data: string[]) {
  return {
    type: 'category' as const,
    data,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true },
  };
}

export function legendBase(t: ChartTheme) {
  return {
    top: 0,
    left: 0,
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16,
    textStyle: { color: t.textSecondary, fontSize: 12 },
  };
}

/** Bar with a 4px rounded data end and a square base. */
export function barStyle(color: string, horizontal = false) {
  return {
    color,
    borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
  };
}
