// Statistics service: one place that turns every source (UN WPP snapshot, World Bank live or
// snapshot, OpenDOSM snapshot) into Series / Observation objects that carry their provenance.
import type { GeoLevel, Indicator, LayerDoc, Observation, Pyramid, Quality, Series, WppDoc } from '../types';
import type { Catalog } from './catalog';
import { loadOptional } from './http';
import { wbCountrySeries, wbIndicatorUrl, wbLayer } from './worldbank';
import { wppQuality } from '../utils/quality';

const STOCKS = new Set(['population', 'population_male', 'population_female', 'sex_ratio', 'median_age', 'pop_0_14', 'pop_15_64', 'pop_65_plus', 'pop_0_14_pct', 'pop_15_64_pct', 'pop_65_plus_pct', 'density']);

export const isStock = (code: string) => STOCKS.has(code);

// ---------------------------------------------------------------------------------------------
// UN WPP
// ---------------------------------------------------------------------------------------------
export function loadWpp(geoId: string): Promise<WppDoc | null> {
  return loadOptional<WppDoc>(`stats/wpp/${geoId}.json`);
}

export function wppSeries(doc: WppDoc, code: string, ind?: Indicator): Series | null {
  const arr = doc.series[code];
  if (!arr) return null;
  const last = isStock(code) ? doc.estimate_last.stock : doc.estimate_last.flow;
  const derived = ind?.quality === 'DERIVED';
  const points = doc.years
    .map((year, i) => ({ year, value: arr[i] as number, quality: wppQuality(year, last, derived && year <= last) as Quality }))
    .filter((p) => p.value !== null && p.value !== undefined);
  // derived values in projection years stay PROJECTION (derived from projected inputs)
  return { indicator: code, sourceId: 'un_wpp_2024', lastUpdated: '2024-07-11', points, referenceConvention: isStock(code) ? '1 January' : 'calendar year' };
}

export function wppPyramid(doc: WppDoc, year: number): Pyramid | null {
  const i = doc.years.indexOf(year);
  if (i < 0 || !doc.pyramid.male[i]) return null;
  return { groups: doc.pyramid.groups, male: doc.pyramid.male[i]!, female: doc.pyramid.female[i]!, year, quality: wppQuality(year, doc.estimate_last.stock), sourceId: 'un_wpp_2024' };
}

/** Density derived from WPP population and the geometric area of the boundary. */
export function densitySeries(pop: Series | null, areaKm2: number | null | undefined): Series | null {
  if (!pop || !areaKm2) return null;
  return {
    indicator: 'density', sourceId: 'worldstat_derived', lastUpdated: pop.lastUpdated, referenceConvention: pop.referenceConvention,
    points: pop.points.map((p) => ({ year: p.year, value: p.value / areaKm2, quality: p.quality === 'PROJECTION' ? 'PROJECTION' : 'DERIVED' })),
  };
}

// ---------------------------------------------------------------------------------------------
// OpenDOSM snapshot (Malaysia national / states / districts)
// ---------------------------------------------------------------------------------------------
export interface DosmUnit {
  name: string;
  series: Record<string, Array<[number, number, Quality]>>;
  datasets: Record<string, string>;
  pyramid?: { groups: string[]; years: number[]; male: number[][]; female: number[][]; dataset: string };
  ethnicity?: Record<string, Record<string, number>>;
  gdp_sectors?: Record<string, Array<{ code: string; name_en: string; value: number }>>;
}
export interface DosmDoc { source_id: string; level: string; units: Record<string, DosmUnit> }

export function loadDosm(level: 'national' | 'admin1' | 'admin2'): Promise<DosmDoc | null> {
  return loadOptional<DosmDoc>(`stats/my/${level}.json`);
}

export function dosmSeries(unit: DosmUnit | undefined, code: string): Series | null {
  const arr = unit?.series[code];
  if (!arr?.length) return null;
  return { indicator: code, sourceId: 'dosm_opendosm', lastUpdated: null, points: arr.map(([year, value, quality]) => ({ year, value, quality })), referenceConvention: isStock(code) ? 'mid-year' : 'calendar year' };
}

export function dosmPyramid(unit: DosmUnit | undefined, year: number): Pyramid | null {
  const p = unit?.pyramid;
  if (!p) return null;
  let i = p.years.indexOf(year);
  if (i < 0) i = p.years.length - 1; // latest available (UI shows the year)
  return { groups: p.groups, male: p.male[i], female: p.female[i], year: p.years[i], quality: [1970, 1980, 1991, 2000, 2010, 2020].includes(p.years[i]) ? 'OFFICIAL' : 'ESTIMATE', sourceId: 'dosm_opendosm' };
}

// ---------------------------------------------------------------------------------------------
// Layers for the choropleth / time machine / rankings
// ---------------------------------------------------------------------------------------------
const layerCache = new Map<string, Promise<(LayerDoc & { mode?: string }) | null>>();

export function loadLayer(ind: Indicator, cat: Catalog): Promise<(LayerDoc & { mode?: string }) | null> {
  if (!layerCache.has(ind.code)) {
    let p: Promise<(LayerDoc & { mode?: string }) | null>;
    if (ind.source_id === 'un_wpp_2024' || ind.inputs_source_id === 'un_wpp_2024') {
      p = ind.code === 'density' ? densityLayer(cat) : loadOptional<LayerDoc>(`stats/layers/${ind.code}.json`);
    } else if (ind.wb_code) {
      const wbToId = Object.fromEntries(cat.countryList.filter((c) => c.wb).map((c) => [c.wb!, c.id]));
      p = wbLayer(ind, wbToId);
    } else {
      p = Promise.resolve(null);
    }
    layerCache.set(ind.code, p.catch((e) => { layerCache.delete(ind.code); throw e; }));
  }
  return layerCache.get(ind.code)!;
}

async function densityLayer(cat: Catalog): Promise<LayerDoc | null> {
  const pop = await loadOptional<LayerDoc>('stats/layers/population.json');
  const areas = await loadOptional<Record<string, number>>('meta/areas.json');
  if (!pop || !areas) return null;
  void cat;
  const values: Record<string, Array<number | null>> = {};
  for (const [id, arr] of Object.entries(pop.values)) {
    const a = areas[id];
    if (!a) continue;
    values[id] = arr.map((v) => (v === null ? null : v / a));
  }
  return { ...pop, indicator: 'density', source_id: 'worldstat_derived', values };
}

export function layerValueAt(layer: LayerDoc, geoId: string, year: number): number | null {
  const i = layer.years.indexOf(year);
  if (i < 0) return null;
  const v = layer.values[geoId]?.[i];
  return v === undefined ? null : v;
}

export function layerQualityAt(layer: LayerDoc, ind: Indicator, year: number): Quality {
  if (layer.estimate_last !== undefined) {
    if (year > layer.estimate_last) return 'PROJECTION';
    return ind.quality === 'DERIVED' ? 'DERIVED' : 'ESTIMATE';
  }
  return ind.quality;
}

/** Years that have at least one value — used to clamp the time machine for WB layers. */
export function layerYearsWithData(layer: LayerDoc): number[] {
  const ys: number[] = [];
  layer.years.forEach((y, i) => {
    for (const arr of Object.values(layer.values)) if (arr[i] !== null && arr[i] !== undefined) { ys.push(y); return; }
  });
  return ys;
}

// ---------------------------------------------------------------------------------------------
// Observations: what the UI shows and exports
// ---------------------------------------------------------------------------------------------
export function sourceUrlFor(cat: Catalog, ind: Indicator | undefined, sourceId: string, wbCountry?: string | null): string {
  if (sourceId === 'wb_wdi' && ind?.wb_code) return wbIndicatorUrl(ind.wb_code, wbCountry ?? undefined);
  if (sourceId === 'dosm_opendosm' && ind?.dosm_dataset) return `https://open.dosm.gov.my/data-catalogue/${ind.dosm_dataset.split(' ')[0]}`;
  return cat.sources[sourceId]?.url ?? '';
}

export function toObservation(cat: Catalog, geo: { id: string; name: string; level: GeoLevel; wb?: string | null }, s: Series, point: { year: number; value: number; quality: Quality }): Observation {
  const ind = cat.indicators[s.indicator];
  // DERIVED indicators cite WorldStat as the computing party and the official input source
  const derived = ind?.source_id === 'worldstat_derived';
  const src = cat.sources[derived ? 'worldstat_derived' : s.sourceId];
  const input = derived ? cat.sources[ind?.inputs_source_id ?? s.sourceId] : undefined;
  const ref = s.referenceConvention === '1 January' ? `${point.year}-01-01` : s.referenceConvention === 'mid-year' ? `mid-year ${point.year}` : String(point.year);
  return {
    geoId: geo.id,
    geoName: geo.name,
    level: geo.level,
    indicator: s.indicator,
    value: point.value,
    unit: ind?.unit ?? '',
    year: point.year,
    referencePeriod: ref,
    quality: point.quality,
    sourceId: derived ? 'worldstat_derived' : s.sourceId,
    sourceName: derived ? `${src?.name ?? 'WorldStat Atlas derived'} (inputs: ${input ? `${input.publisher} — ${input.name}` : s.sourceId})` : src ? `${src.publisher} — ${src.name}` : s.sourceId,
    sourceUrl: derived && input ? input.url : sourceUrlFor(cat, ind, s.sourceId, geo.wb),
    lastUpdated: s.lastUpdated,
    notes: [ind?.description, ind?.reference ? `Reference: ${ind.reference}` : undefined, ind?.formula ? `Formula: ${ind.formula}` : undefined, ind?.notes, ind?.original_source ? `Original source: ${ind.original_source}` : undefined].filter(Boolean).join(' · ') || undefined,
  };
}

/** Value at a year, or the latest value not after it (the returned point carries the year used). */
export function pointAt(s: Series | null | undefined, year: number, opts: { exact?: boolean; allowProjection?: boolean } = {}) {
  if (!s?.points.length) return null;
  const ok = (p: { quality: Quality }) => opts.allowProjection || p.quality !== 'PROJECTION';
  const exact = s.points.find((p) => p.year === year && ok(p));
  if (exact || opts.exact) return exact ?? null;
  const prior = s.points.filter((p) => p.year <= year && ok(p));
  return prior.length ? prior[prior.length - 1] : null;
}

export { wbCountrySeries };
