// Registry metadata loaded once at start: sources, indicators, regions, country index, manifest.
import type { CountryIndexEntry, DataSource, Indicator, LandmarkCategory, RegionDef } from '../types';
import { loadData, loadOptional } from './http';

export interface Manifest {
  snapshot_built_at: string;
  run_id: string;
  datasets: Array<Record<string, unknown> & { source_id: string }>;
  available: { wpp: boolean; wb_snapshot: boolean; dosm_snapshot: boolean; landmarks_snapshot: boolean };
}

export interface Catalog {
  sources: Record<string, DataSource>;
  indicators: Record<string, Indicator>;
  indicatorList: Indicator[];
  regions: Record<string, RegionDef>;
  regionList: RegionDef[];
  subregions: RegionDef[];
  countries: Record<string, CountryIndexEntry>;
  countryList: CountryIndexEntry[];
  manifest: Manifest;
  landmarkCategories: LandmarkCategory[];
  qualityFlags: Record<string, string[]>;
  dosmCatalogue: Record<string, DosmDatasetMeta> | null;
}

export interface DosmDatasetMeta {
  title_en: string;
  title_ms: string;
  description_en?: string;
  methodology_en?: string;
  caveat_en?: string;
  last_updated?: string;
  next_update?: string;
  link_csv?: string;
  metadata_url?: string;
  frequency?: string;
  geography?: string[];
  dataset_begin?: number;
  dataset_end?: number;
}

let catalog: Catalog | null = null;

export async function loadCatalog(): Promise<Catalog> {
  if (catalog) return catalog;
  const [sources, indicators, regions, countries, manifest, lc, flags, dosm] = await Promise.all([
    loadData<DataSource[]>('meta/sources.json'),
    loadData<Indicator[]>('meta/indicators.json'),
    loadData<{ regions: RegionDef[]; subregions: RegionDef[] }>('meta/regions.json'),
    loadData<CountryIndexEntry[]>('meta/countries.json'),
    loadData<Manifest>('manifest.json'),
    loadData<{ categories: LandmarkCategory[] }>('meta/landmark_categories.json'),
    loadOptional<Record<string, string[]>>('quality/flags.json'),
    loadOptional<{ datasets: Record<string, DosmDatasetMeta> }>('stats/my/catalogue.json'),
  ]);
  catalog = {
    sources: Object.fromEntries(sources.map((s) => [s.id, s])),
    indicators: Object.fromEntries(indicators.map((i) => [i.code, i])),
    indicatorList: indicators,
    regions: Object.fromEntries([...regions.regions, ...regions.subregions].map((r) => [r.id, r])),
    regionList: regions.regions,
    subregions: regions.subregions,
    countries: Object.fromEntries(countries.map((c) => [c.id, c])),
    countryList: countries,
    manifest,
    landmarkCategories: lc.categories,
    qualityFlags: flags ?? {},
    dosmCatalogue: dosm?.datasets ?? null,
  };
  return catalog;
}

export function getCatalog(): Catalog {
  if (!catalog) throw new Error('catalog not loaded');
  return catalog;
}
