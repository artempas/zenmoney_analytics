// Chart palette: the validated dataviz reference instance (see dataviz skill, palette.md).
// Categorical order is the CVD-safety mechanism — assign in order, never cycle past 8.

export type Scheme = 'light' | 'dark';

export interface ChartTheme {
  scheme: Scheme;
  surface: string;
  page: string;
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  series: string[];
  /** De-emphasis gray for "other"/baseline series. */
  neutral: string;
  sequential: string[];
  good: string;
  bad: string;
  goodText: string;
}

const light: ChartTheme = {
  scheme: 'light',
  surface: '#fcfcfb',
  page: '#f9f9f7',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  border: 'rgba(11,11,11,0.10)',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  neutral: '#b5b3aa',
  sequential: [
    '#f0efec',
    '#cde2fb',
    '#9ec5f4',
    '#6da7ec',
    '#3987e5',
    '#256abf',
    '#184f95',
    '#0d366b',
  ],
  good: '#0ca30c',
  bad: '#d03b3b',
  goodText: '#006300',
};

const dark: ChartTheme = {
  scheme: 'dark',
  surface: '#1a1a19',
  page: '#0d0d0d',
  text: '#ffffff',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  border: 'rgba(255,255,255,0.10)',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  neutral: '#5f5e59',
  sequential: [
    '#262624',
    '#104281',
    '#184f95',
    '#1c5cab',
    '#256abf',
    '#2a78d6',
    '#5598e7',
    '#86b6ef',
  ],
  good: '#0ca30c',
  bad: '#d03b3b',
  goodText: '#0ca30c',
};

export function chartTheme(scheme: Scheme): ChartTheme {
  return scheme === 'dark' ? dark : light;
}

/**
 * Stable color per entity: the index comes from a stable ordering (e.g. total over the whole
 * range), not from the current filter, so series keep their hue. Past 8 → neutral.
 */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.series[index] ?? theme.neutral;
}
