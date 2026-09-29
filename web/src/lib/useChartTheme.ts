import { useComputedColorScheme } from '@mantine/core';
import { chartTheme, type ChartTheme } from './palette';

export function useChartTheme(): ChartTheme {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  return chartTheme(scheme);
}
