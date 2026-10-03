import type { Indicator, Lang } from '../types';

const locale = (lang: Lang) => (lang === 'ms' ? 'ms-MY' : 'en-GB');

/** Compact number for stat tiles: 34.1M, 12.9K, 1,284. */
export function compact(value: number | null | undefined, lang: Lang, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs < 10_000) return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: abs < 10 ? 2 : 0 }).format(value);
  const units: Array<[number, string, string]> = [
    [1e12, 'T', ' trilion'],
    [1e9, 'B', ' bilion'],
    [1e6, 'M', ' juta'],
    [1e3, 'K', ' ribu'],
  ];
  for (const [n, en, ms] of units) {
    if (abs >= n) {
      const v = value / n;
      const s = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : digits }).format(v);
      return `${s}${lang === 'ms' ? ms : en}`;
    }
  }
  return String(value);
}

export function full(value: number | null | undefined, lang: Lang, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Format a value according to its indicator definition. */
export function formatValue(value: number | null | undefined, ind: Pick<Indicator, 'format' | 'decimals'> | undefined, lang: Lang, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const fmt = ind?.format ?? 'decimal';
  const dec = ind?.decimals ?? 1;
  switch (fmt) {
    case 'count':
      return opts.compact ? compact(value, lang) : full(value, lang, 0);
    case 'percent':
      return `${full(value, lang, dec)}%`;
    case 'currency':
      return `US$${opts.compact ? compact(value, lang) : full(value, lang, 0)}`;
    case 'currency_myr':
      return `RM${opts.compact ? compact(value, lang) : full(value, lang, 0)}`;
    default:
      return full(value, lang, dec);
  }
}

export function formatCoord(lon: number, lat: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function yearLabel(year: number, lang: Lang): string {
  if (year < 0) return lang === 'ms' ? `${Math.abs(year).toLocaleString(locale(lang))} SM` : `${Math.abs(year).toLocaleString(locale(lang))} BCE`;
  return String(year);
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
