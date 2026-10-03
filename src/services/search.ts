// Smart search: detects whether a query names a location, a landmark or a statistic
// ("population Malaysia", "kadar kelahiran Jepun", "Mount Fuji", "Kajang").
import Fuse from 'fuse.js';
import type { SearchEntry, SearchEntryType } from '../types';
import { loadData, loadOptional } from './http';

type Row = [SearchEntryType, string, string, string[], string | null, string[], number | null, number | null, number];
interface IndexDoc { fields: string[]; entries: Row[] }

let core: SearchEntry[] | null = null;
let places: SearchEntry[] | null = null;
let fuse: Fuse<SearchEntry> | null = null;

const toEntry = (r: Row): SearchEntry => ({ type: r[0], id: r[1], name: r[2], alt: r[3], country: r[4], parents: r[5], lon: r[6], lat: r[7], importance: r[8] });

export async function loadSearchIndex(): Promise<void> {
  if (!core) {
    const d = await loadData<IndexDoc>('search/index.json');
    core = d.entries.map(toEntry);
  }
  if (!places) {
    loadOptional<IndexDoc>('search/places.json').then((d) => {
      places = d ? d.entries.map(toEntry) : [];
      fuse = null;
    });
  }
}

export function norm(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Phrase → indicator code. Longest phrase wins. Both languages, plus common synonyms.
const INDICATOR_PHRASES: Array<[string, string]> = [
  ['population density', 'density'], ['kepadatan penduduk', 'density'], ['density', 'density'], ['kepadatan', 'density'],
  ['male population', 'population_male'], ['penduduk lelaki', 'population_male'],
  ['female population', 'population_female'], ['penduduk perempuan', 'population_female'],
  ['population', 'population'], ['penduduk', 'population'], ['populasi', 'population'],
  ['crude birth rate', 'cbr'], ['birth rate', 'cbr'], ['kadar kelahiran', 'cbr'],
  ['crude death rate', 'cdr'], ['death rate', 'cdr'], ['kadar kematian', 'cdr'],
  ['infant mortality', 'imr'], ['kematian bayi', 'imr'],
  ['births', 'births'], ['kelahiran', 'births'], ['deaths', 'deaths'], ['kematian', 'deaths'],
  ['total fertility', 'tfr'], ['fertility', 'tfr'], ['kesuburan', 'tfr'], ['tfr', 'tfr'],
  ['life expectancy', 'e0'], ['jangka hayat', 'e0'],
  ['median age', 'median_age'], ['umur median', 'median_age'],
  ['sex ratio', 'sex_ratio'], ['nisbah jantina', 'sex_ratio'],
  ['ageing', 'pop_65_plus_pct'], ['aging', 'pop_65_plus_pct'], ['penuaan', 'pop_65_plus_pct'], ['warga emas', 'pop_65_plus_pct'],
  ['gdp per capita', 'gdp_per_capita'], ['kdnk per kapita', 'gdp_per_capita'], ['gdp growth', 'gdp_growth'], ['pertumbuhan kdnk', 'gdp_growth'],
  ['gdp', 'gdp'], ['kdnk', 'gdp'], ['inflation', 'inflation'], ['inflasi', 'inflation'],
  ['unemployment', 'unemployment'], ['pengangguran', 'unemployment'], ['labour force', 'labour_force'], ['tenaga buruh', 'labour_force'],
  ['exports', 'exports'], ['eksport', 'exports'], ['imports', 'imports'], ['import', 'imports'], ['trade balance', 'trade_balance'],
  ['tourist arrivals', 'tourism_arrivals'], ['tourism', 'tourism_arrivals'], ['pelancong', 'tourism_arrivals'], ['pelancongan', 'tourism_arrivals'],
  ['urbanisation', 'urban_pct'], ['urbanization', 'urban_pct'], ['urban population', 'urban_pct'], ['pembandaran', 'urban_pct'],
  ['poverty', 'poverty'], ['kemiskinan', 'poverty'], ['gini', 'gini'], ['household income', 'hh_income_median'], ['pendapatan isi rumah', 'hh_income_median'],
  ['growth rate', 'growth_rate'], ['kadar pertumbuhan', 'growth_rate'], ['migration', 'net_migration'], ['migrasi', 'net_migration'],
  ['precipitation', 'precipitation'], ['rainfall', 'precipitation'], ['hujan', 'precipitation'],
];
const PHRASES = INDICATOR_PHRASES.map(([p, c]) => [norm(p), c] as const).sort((a, b) => b[0].length - a[0].length);

// Malay exonyms for common country queries (search only; display names stay as in the registry).
const MS_ALIASES: Record<string, string> = {
  jepun: 'JPN', 'amerika syarikat': 'USA', amerika: 'USA', china: 'CHN', 'negara china': 'CHN', india: 'IND', thailand: 'THA', siam: 'THA',
  filipina: 'PHL', singapura: 'SGP', 'korea selatan': 'KOR', 'korea utara': 'PRK', perancis: 'FRA', jerman: 'DEU', sepanyol: 'ESP',
  itali: 'ITA', belanda: 'NLD', 'arab saudi': 'SAU', mesir: 'EGY', turki: 'TUR', rusia: 'RUS', britain: 'GBR', 'united kingdom': 'GBR',
  england: 'GBR', brunei: 'BRN', kemboja: 'KHM', burma: 'MMR', myanmar: 'MMR', vietnam: 'VNM', 'new zealand': 'NZL', 'selandia baru': 'NZL',
};

export interface ParsedQuery { indicator: string | null; locationText: string; raw: string }

export function parseQuery(q: string): ParsedQuery {
  const n = ` ${norm(q)} `;
  for (const [p, code] of PHRASES) {
    const i = n.indexOf(` ${p} `);
    if (i >= 0) {
      const rest = (n.slice(0, i) + ' ' + n.slice(i + p.length + 2)).replace(/\b(of|in|di|bagi|untuk|negara|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
      return { indicator: code, locationText: rest, raw: q };
    }
  }
  return { indicator: null, locationText: norm(q), raw: q };
}

function scoreEntry(e: SearchEntry, q: string): number {
  const name = norm(e.name);
  let s = 0;
  if (name === q) s = 100;
  else if (name.startsWith(q)) s = 75 - Math.min(20, name.length - q.length);
  else if (` ${name}`.includes(` ${q}`)) s = 55;
  else if (name.includes(q)) s = 35;
  else {
    for (const a of e.alt) {
      const an = norm(a);
      if (an === q) { s = 90; break; }
      if (an.startsWith(q)) s = Math.max(s, 60);
    }
  }
  if (!s) return 0;
  const typeBoost: Partial<Record<SearchEntryType, number>> = { country: 30, continent: 28, admin1: 18, admin2: 14, city: 10, town: 4, peak: 6, physical: 3, sea: 3, airport: 0, port: -6 };
  return s + (typeBoost[e.type] ?? 0) + e.importance * 0.3;
}

export function searchLocal(q: string, limit = 12): SearchEntry[] {
  const nq = norm(q);
  if (!core || nq.length < 2) return [];
  const alias = MS_ALIASES[nq];
  const pool = places ? core.concat(places) : core;
  const scored: Array<[number, SearchEntry]> = [];
  for (const e of pool) {
    let s = scoreEntry(e, nq);
    if (alias && e.type === 'country' && e.id === alias) s = 200;
    if (s > 0) scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  let out = scored.slice(0, limit).map(([, e]) => e);
  if (out.length === 0 && nq.length >= 4) {
    fuse ??= new Fuse(pool, { keys: ['name', 'alt'], threshold: 0.25, ignoreLocation: true, minMatchCharLength: 3 });
    const fz = fuse.search(nq, { limit }).map((r) => r.item);
    out = [...out, ...fz.filter((f) => !out.includes(f))].slice(0, limit);
  }
  return out;
}

export function findById(id: string): SearchEntry | undefined {
  return core?.find((e) => e.id === id) ?? places?.find((e) => e.id === id);
}
