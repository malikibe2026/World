// Colour system for maps and charts (validated with the dataviz palette validator).
// Sequential = one hue (blue) light→dark, anchor flipped in dark mode; diverging = blue ↔ red with
// a neutral grey midpoint; categorical = fixed slot order, never cycled.
import type { Theme } from '../types';
import { quantile } from '../utils/quality';

const BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const RED = ['#fbd5d0', '#f3a69d', '#e8746a', '#d64a42', '#b4302b', '#8c201d', '#651512'];

export function sequential(theme: Theme): string[] {
  return theme === 'dark' ? [...BLUE].reverse() : BLUE;
}

/** 7 classes: 3 negative (red), neutral, 3 positive (blue). */
export function diverging(theme: Theme): string[] {
  // dark mode flips the anchor: the most extreme classes are the lightest (highest contrast on dark)
  if (theme === 'dark') return [RED[1], RED[2], RED[4], '#383835', BLUE[4], BLUE[2], BLUE[1]];
  return [RED[5], RED[3], RED[1], '#f0efec', BLUE[1], BLUE[3], BLUE[5]];
}

export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export function mapColors(theme: Theme) {
  return theme === 'dark'
    ? { ocean: '#0a1424', land: '#1c232c', landHover: '#2a3440', border: '#4a5868', borderStrong: '#8ea2b8', admin1: '#56677a', admin2: '#3e4c5c', noData: '#2b2f33', text: '#e8edf2', halo: '#0a1424', water: '#123459', river: '#2f6aa8', selected: '#ffd166', capital: '#ffffff', city: '#c9d4e0', peak: '#d9a066', seaText: '#7ea7d8', road: '#7b6a4e', urban: 'rgba(255, 196, 120, 0.22)' }
    : { ocean: '#dbe7f2', land: '#f6f4ef', landHover: '#ebe7de', border: '#a7aeb6', borderStrong: '#5d6874', admin1: '#b6bcc3', admin2: '#d0d4d8', noData: '#e3e1db', text: '#1f2933', halo: '#ffffff', water: '#b9d3ea', river: '#6f9fcf', selected: '#d97706', capital: '#111827', city: '#374151', peak: '#8b5e34', seaText: '#4f7cac', road: '#c9a46b', urban: 'rgba(217, 119, 6, 0.16)' };
}

export interface Classification {
  kind: 'sequential' | 'diverging';
  breaks: number[]; // upper bounds of classes 0..n-2 (last class open-ended)
  colors: string[];
  min: number;
  max: number;
  count: number;
}

/** Quantile classes (7) for sequential data; symmetric classes around 0 for diverging data. */
export function classify(values: number[], kind: 'sequential' | 'diverging', theme: Theme): Classification | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length < 2) return null;
  if (kind === 'diverging') {
    const colors = diverging(theme);
    const absSorted = xs.map(Math.abs).sort((a, b) => a - b);
    const q1 = niceRound(quantile(absSorted, 0.33)), q2 = niceRound(quantile(absSorted, 0.66)), q3 = niceRound(quantile(absSorted, 0.9));
    const eps = Math.max(q1 * 0.15, 1e-9);
    return { kind, breaks: [-q3, -q2, -eps, eps, q2, q3], colors, min: xs[0], max: xs[xs.length - 1], count: xs.length };
  }
  const colors = sequential(theme);
  const n = colors.length;
  const breaks: number[] = [];
  for (let i = 1; i < n; i++) breaks.push(niceRound(quantile(xs, i / n)));
  const uniq = breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);
  return { kind, breaks: uniq, colors: colors.slice(colors.length - (uniq.length + 1)), min: xs[0], max: xs[xs.length - 1], count: xs.length };
}

export function classIndex(c: Classification, v: number): number {
  for (let i = 0; i < c.breaks.length; i++) if (v < c.breaks[i]) return i;
  return c.breaks.length;
}

/** Round to 2 significant figures so legend labels stay readable. */
export function niceRound(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / p) * p;
}
