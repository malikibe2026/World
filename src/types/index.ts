// Domain types shared across services, maps, charts and components.

export type Quality = 'OFFICIAL' | 'ESTIMATE' | 'PROJECTION' | 'DERIVED';
export type GeoLevel = 'world' | 'continent' | 'subregion' | 'country' | 'admin1' | 'admin2' | 'place';
export type Lang = 'ms' | 'en';
export type Theme = 'light' | 'dark';

export interface DataSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  distribution_url?: string;
  metadata_url?: string;
  license?: string;
  license_url?: string;
  citation?: string;
  release_date?: string;
  access?: 'snapshot' | 'live' | 'pipeline';
  default_quality?: Quality;
  notes?: string;
}

export type IndicatorFormat = 'count' | 'percent' | 'decimal' | 'currency' | 'currency_myr';
export type IndicatorCategory =
  | 'population' | 'vital' | 'economy' | 'structure' | 'labour' | 'trade' | 'social'
  | 'geography' | 'climate' | 'energy' | 'tourism';

export interface Indicator {
  code: string;
  category: IndicatorCategory;
  name_en: string;
  name_ms: string;
  unit: string;
  format: IndicatorFormat;
  decimals: number;
  source_id: string;
  inputs_source_id?: string;
  quality: Quality;
  layer: boolean;
  scale?: 'log' | 'linear' | 'diverging';
  wb_code?: string;
  original_source?: string;
  formula?: string;
  reference?: string;
  description?: string;
  notes?: string;
  dosm_dataset?: string;
}

/** One value with full provenance — the unit of everything the UI shows and exports. */
export interface Observation {
  geoId: string;
  geoName: string;
  level: GeoLevel;
  indicator: string;
  value: number | null;
  unit: string;
  year: number;
  referencePeriod: string;
  quality: Quality;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  lastUpdated: string | null;
  notes?: string;
}

/** A time series for one geography × indicator (sparse: only years with values). */
export interface Series {
  indicator: string;
  sourceId: string;
  points: Array<{ year: number; value: number; quality: Quality }>;
  lastUpdated: string | null;
  referenceConvention?: string;
}

export interface Pyramid {
  groups: string[];
  male: number[];
  female: number[];
  year: number;
  quality: Quality;
  sourceId: string;
}

export interface GeoRef {
  id: string;
  level: GeoLevel;
  name: string;
  countryId?: string | null;
  parents: string[];
  lon?: number;
  lat?: number;
  kind?: string; // for points: city, town, peak, airport, port, sea, physical, landmark
}

export interface RegionDef {
  id: string;
  level: 'world' | 'continent' | 'subregion';
  name: string;
  name_ms?: string;
  m49: number;
  members?: string[];
  continent_id?: string | null;
}

export interface CountryIndexEntry {
  id: string;
  name: string;
  iso2: string | null;
  iso3: string | null;
  wb: string | null;
  flag: string | null;
  continent_id: string | null;
  subregion: string | null;
  bbox: [number, number, number, number];
  label: [number, number];
  has_wpp: boolean;
  admin1: boolean;
  rank?: number;
  wikidata?: string | null;
}

export interface AdminUnit {
  id: string;
  name: string;
  name_local?: string | null;
  name_source?: string;
  type?: string;
  iso?: string | null;
  country: string;
  state?: string;
  wikidata?: string | null;
  area_km2: number;
  label: [number, number];
  bbox: [number, number, number, number];
  level: 'admin1' | 'admin2';
  peaks?: Array<{ name: string; elev: number | null; kind: string }>;
  rivers?: Array<{ name: string; rank: number }>;
  lakes?: Array<{ name: string; kind: string }>;
  islands?: Array<{ name: string; kind: string }>;
  landforms?: Array<{ name: string; kind: string }>;
  seas?: Array<{ name: string; kind: string }>;
  cities?: Array<{ name: string; pop: number | null; kind: string; admin1?: string }>;
  towns?: string[];
  airports?: Array<{ name: string; iata: string | null; kind: string }>;
  ports?: string[];
  highest_listed_peak?: { name: string; elev: number } | null;
  area_geometry_km2?: number | null;
}

export interface CountryProfile {
  id: string;
  level: 'country';
  name: string;
  name_official: string;
  name_local: string[];
  type: string;
  sovereign: string;
  continent: string | null;
  continent_id: string | null;
  subregion: string | null;
  capital: string[];
  capital_point: { name: string; pop: number | null } | null;
  timezones: Array<{ name: string; utc: string | null; dst: string | null }>;
  languages: string[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
  calling_code: string;
  tld: string[];
  landlocked: boolean | null;
  borders: string[];
  flag: string | null;
  iso2: string | null;
  iso3: string | null;
  m49: number | null;
  wb: string | null;
  wikidata: string | null;
  has_wpp: boolean;
  admin1_count: number;
  label: [number, number];
  bbox: [number, number, number, number];
  area_geometry_km2: number | null;
  peaks: Array<{ name: string; elev: number | null; kind: string; wikidata?: string }>;
  highest_listed_peak: { name: string; elev: number } | null;
  rivers: Array<{ name: string; rank: number }>;
  lakes: Array<{ name: string; kind: string }>;
  islands: Array<{ name: string; kind: string; wikidata?: string }>;
  landforms: Array<{ name: string; kind: string; wikidata?: string }>;
  seas: Array<{ name: string; kind: string }>;
  cities: Array<{ name: string; pop: number | null; kind: string; admin1?: string }>;
  airports: Array<{ name: string; iata: string | null; kind: string }>;
  ports: string[];
  climate: null | string;
  natural_resources: null | string;
  source_ids: string[];
}

export interface WppDoc {
  id: string;
  name: string;
  m49: number;
  source_id: string;
  years: number[];
  estimate_last: { stock: number; flow: number };
  series: Record<string, Array<number | null>>;
  pyramid: { groups: string[]; male: Array<number[] | null>; female: Array<number[] | null> };
}

export interface LayerDoc {
  indicator: string;
  source_id: string;
  years: number[];
  estimate_last?: number;
  last_updated?: string | null;
  values: Record<string, Array<number | null>>;
}

export interface Landmark {
  id: string;
  name: string;
  description: string | null;
  coord: [number, number];
  categories: string[];
  sitelinks: number;
  image: string | null;
  inception: string | null;
  wikipedia: string | null;
}

export interface LandmarkCategory {
  id: string;
  emoji: string;
  name_en: string;
  name_ms: string;
  classes: string[];
  heritage_designation?: string;
}

export interface HistoryEvent {
  id: string;
  era: string;
  year: number;
  end_year?: number;
  date?: string;
  precision: 'day' | 'year' | 'circa' | 'century';
  title_en: string;
  title_ms: string;
  summary_en: string;
  summary_ms: string;
  coord?: [number, number];
  place?: string;
  contested?: boolean;
  interpretations_en?: string[];
  interpretations_ms?: string[];
  refs: Array<{ title: string; url: string }>;
}

export interface HistoryDoc {
  id: string;
  source_id: string;
  last_reviewed?: string;
  editor_note_en?: string;
  editor_note_ms?: string;
  eras: Array<{ id: string; name_en: string; name_ms: string; start: number; end: number }>;
  events: HistoryEvent[];
}

export type SearchEntryType =
  | 'continent' | 'country' | 'admin1' | 'admin2' | 'city' | 'town' | 'village'
  | 'peak' | 'physical' | 'sea' | 'airport' | 'port' | 'landmark';

export interface SearchEntry {
  type: SearchEntryType;
  id: string;
  name: string;
  alt: string[];
  country: string | null;
  parents: string[];
  lon: number | null;
  lat: number | null;
  importance: number;
}

export interface QualityIssue {
  check: 'missing_values' | 'duplicate_records' | 'outliers' | 'year_mismatch' | 'geographic_mismatch' | 'unit_mismatch';
  severity: 'info' | 'warning' | 'error';
  geo_id?: string;
  indicator?: string;
  year?: number;
  value?: number | string;
  message: string;
}
