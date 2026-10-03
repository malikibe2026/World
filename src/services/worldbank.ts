// World Bank Indicators API v2 (live) with fallback to the pipeline snapshot when present.
import type { Indicator, LayerDoc, Series } from '../types';
import { liveJson, loadOptional } from './http';

const API = 'https://api.worldbank.org/v2';
const FIRST = 1960;
const LAST = new Date().getFullYear();

interface WbHeader { page: number; pages: number; per_page: number; total: number; lastupdated?: string; sourceid?: string; message?: unknown }
interface WbRow { indicator: { id: string; value: string }; country: { id: string; value: string }; countryiso3code: string; date: string; value: number | null }

function parse(doc: unknown): { header: WbHeader; rows: WbRow[] } {
  if (!Array.isArray(doc) || doc.length < 2 || !Array.isArray(doc[1])) {
    const msg = Array.isArray(doc) ? JSON.stringify(doc[0]?.message ?? doc[0]) : String(doc);
    throw new Error(`World Bank API: unexpected response ${msg.slice(0, 200)}`);
  }
  return { header: doc[0] as WbHeader, rows: doc[1] as WbRow[] };
}

/** All WDI indicators of the registry for one economy, in one request. */
export async function wbCountrySeries(geoId: string, wbCode: string, indicators: Indicator[]): Promise<{ series: Record<string, Series>; lastUpdated: string | null; mode: 'live' | 'snapshot' }> {
  const wbInds = indicators.filter((i) => i.wb_code);
  // 1) pipeline snapshot if it exists
  const snap = await loadOptional<{ series: Record<string, Array<[number, number]>>; meta: Record<string, { last_updated: string }> }>(`stats/wb/${geoId}.json`);
  if (snap) {
    const series: Record<string, Series> = {};
    for (const i of wbInds) {
      const pts = snap.series[i.code];
      if (pts?.length) series[i.code] = { indicator: i.code, sourceId: 'wb_wdi', lastUpdated: snap.meta[i.code]?.last_updated ?? null, points: pts.map(([year, value]) => ({ year, value, quality: i.quality })) };
    }
    return { series, lastUpdated: Object.values(snap.meta)[0]?.last_updated ?? null, mode: 'snapshot' };
  }
  // 2) live API (split into chunks to stay under the API's indicator-per-request limit)
  const series: Record<string, Series> = {};
  let lastUpdated: string | null = null;
  const byWb = new Map(wbInds.map((i) => [i.wb_code!, i]));
  const chunks: Indicator[][] = [];
  for (let i = 0; i < wbInds.length; i += 20) chunks.push(wbInds.slice(i, i + 20));
  await Promise.all(
    chunks.map(async (chunk) => {
      const codes = chunk.map((i) => i.wb_code).join(';');
      const url = `${API}/country/${wbCode}/indicator/${codes}?source=2&format=json&per_page=20000&date=${FIRST}:${LAST}`;
      const { header, rows } = parse(await liveJson<unknown>(url, { cacheKey: `wb:${wbCode}:${codes}` }));
      lastUpdated = header.lastupdated ?? lastUpdated;
      for (const r of rows) {
        if (r.value === null) continue;
        const ind = byWb.get(r.indicator.id);
        if (!ind) continue;
        const s = (series[ind.code] ??= { indicator: ind.code, sourceId: 'wb_wdi', lastUpdated: header.lastupdated ?? null, points: [] });
        const year = Number(r.date);
        if (!s.points.some((p) => p.year === year)) s.points.push({ year, value: r.value, quality: ind.quality });
      }
    }),
  );
  for (const s of Object.values(series)) s.points.sort((a, b) => a.year - b.year);
  return { series, lastUpdated, mode: 'live' };
}

/** One WDI indicator for all economies → choropleth layer keyed by atlas country id. */
export async function wbLayer(ind: Indicator, wbToId: Record<string, string>): Promise<LayerDoc & { mode: 'live' | 'snapshot' }> {
  const snap = await loadOptional<LayerDoc>(`stats/layers/wb/${ind.code}.json`);
  if (snap) return { ...snap, mode: 'snapshot' };
  const url = `${API}/country/all/indicator/${ind.wb_code}?format=json&per_page=20000&date=${FIRST}:${LAST}`;
  const { header, rows } = parse(await liveJson<unknown>(url, { cacheKey: `wb:all:${ind.wb_code}` }));
  const years: number[] = [];
  for (let y = FIRST; y <= LAST; y++) years.push(y);
  const values: Record<string, Array<number | null>> = {};
  for (const r of rows) {
    const id = wbToId[r.countryiso3code];
    if (!id || r.value === null) continue;
    const arr = (values[id] ??= years.map(() => null));
    arr[Number(r.date) - FIRST] = r.value;
  }
  return { indicator: ind.code, source_id: 'wb_wdi', years, last_updated: header.lastupdated ?? null, values, mode: 'live' };
}

export function wbIndicatorUrl(wbCode: string, countryWb?: string): string {
  return countryWb ? `https://data.worldbank.org/indicator/${wbCode}?locations=${countryWb}` : `https://data.worldbank.org/indicator/${wbCode}`;
}
