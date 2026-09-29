import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Sequential blue ramp of the chart palette, so UI accents match chart slot 1.
const brand: MantineColorsTuple = [
  '#eaf2fd',
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#6da7ec',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
];

// Warm neutral grays for dark mode (chart surface #1a1a19, page #0d0d0d).
const dark: MantineColorsTuple = [
  '#c3c2b7',
  '#a8a79f',
  '#898781',
  '#5f5e59',
  '#383835',
  '#2c2c2a',
  '#1a1a19',
  '#141413',
  '#0d0d0d',
  '#080808',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  colors: { brand, dark },
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'lg', padding: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
  },
});
