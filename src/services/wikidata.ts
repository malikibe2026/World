// Wikidata / Wikipedia (live). Landmarks are crowd-sourced reference data (CC0) — the UI labels
// them as such and never mixes them with official statistics.
import type { HistoryEvent, Landmark, LandmarkCategory } from '../types';
import { liveJson, loadOptional } from './http';

const SPARQL = 'https://query.wikidata.org/sparql';

export function landmarkQuery(countryQid: string, categories: LandmarkCategory[], limit = 150): string {
  const values = categories.flatMap((c) => c.classes.map((q) => `(wd:${q} "${c.id}")`)).join(' ');
  const heritage = categories.find((c) => c.heritage_designation);
  const union = heritage ? `UNION { ?item wdt:P1435 wd:${heritage.heritage_designation} . BIND("${heritage.id}" AS ?cat) }` : '';
  return `SELECT ?item ?itemLabel ?itemDescription ?coord ?cat ?image ?sitelinks ?inception ?article WHERE {
  { VALUES (?class ?cat) { ${values} } ?item wdt:P31 ?class . } ${union}
  ?item wdt:P17 wd:${countryQid} ; wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ms,id" }
} ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
}

interface Binding { [k: string]: { value: string } | undefined }

function parsePoint(wkt: string): [number, number] | null {
  const m = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(wkt);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export async function landmarksForCountry(countryId: string, countryQid: string | null, categories: LandmarkCategory[]): Promise<{ items: Landmark[]; mode: 'snapshot' | 'live'; retrievedAt: string | null }> {
  const snap = await loadOptional<{ items: Landmark[]; retrieved_at: string }>(`landmarks/${countryId}.json`);
  if (snap) return { items: snap.items, mode: 'snapshot', retrievedAt: snap.retrieved_at };
  if (!countryQid) return { items: [], mode: 'live', retrievedAt: null };
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(landmarkQuery(countryQid, categories))}`;
  const doc = await liveJson<{ results: { bindings: Binding[] } }>(url, { cacheKey: `wd:lm:${countryQid}`, timeoutMs: 45000, init: { headers: { Accept: 'application/sparql-results+json' } } });
  const items = new Map<string, Landmark>();
  for (const b of doc.results.bindings) {
    const qid = b.item!.value.split('/').pop()!;
    const coord = parsePoint(b.coord!.value);
    if (!coord) continue;
    let it = items.get(qid);
    if (!it) {
      it = {
        id: qid, name: b.itemLabel?.value ?? qid, description: b.itemDescription?.value ?? null, coord, categories: [],
        sitelinks: Number(b.sitelinks?.value ?? 0), image: b.image?.value ? decodeURIComponent(b.image.value.split('/').pop()!) : null,
        inception: b.inception?.value ?? null, wikipedia: b.article?.value ?? null,
      };
      items.set(qid, it);
    }
    const cat = b.cat?.value;
    if (cat && !it.categories.includes(cat)) it.categories.push(cat);
  }
  return { items: [...items.values()], mode: 'live', retrievedAt: new Date().toISOString() };
}

export function commonsThumb(file: string, width = 480): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
}

export interface WikiSummary { title: string; extract: string; url: string; thumbnail?: string }

export async function wikipediaSummary(articleUrl: string): Promise<WikiSummary | null> {
  const title = decodeURIComponent(articleUrl.split('/wiki/')[1] ?? '');
  if (!title) return null;
  const d = await liveJson<{ title: string; extract: string; content_urls?: { desktop?: { page?: string } } }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { cacheKey: `wp:${title}` },
  );
  return { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page ?? articleUrl };
}

/** Free-text landmark search (Eiffel Tower, Mount Fuji …) via Wikidata entity search. */
export async function searchEntities(q: string, lang: 'en' | 'ms'): Promise<Array<{ id: string; label: string; description?: string }>> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&type=item&limit=7&language=${lang}&uselang=${lang}&search=${encodeURIComponent(q)}`;
  const d = await liveJson<{ search: Array<{ id: string; label: string; description?: string }> }>(url, { cacheKey: `wd:s:${lang}:${q}`, timeoutMs: 8000 });
  return d.search ?? [];
}

/** Coordinates + country for one entity (to place a searched landmark on the map). */
export async function entityLocation(qid: string): Promise<{ lon: number; lat: number; countryQid: string | null; label: string; description: string | null; image: string | null; wikipedia: string | null } | null> {
  const q = `SELECT ?coord ?country ?itemLabel ?itemDescription ?image ?article WHERE {
    BIND(wd:${qid} AS ?item) ?item wdt:P625 ?coord . OPTIONAL { ?item wdt:P17 ?country }
    OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ms" } } LIMIT 1`;
  const d = await liveJson<{ results: { bindings: Binding[] } }>(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { cacheKey: `wd:loc:${qid}`, timeoutMs: 20000 });
  const b = d.results.bindings[0];
  if (!b?.coord) return null;
  const pt = parsePoint(b.coord.value);
  if (!pt) return null;
  return {
    lon: pt[0], lat: pt[1], countryQid: b.country?.value.split('/').pop() ?? null, label: b.itemLabel?.value ?? qid,
    description: b.itemDescription?.value ?? null, image: b.image?.value ? decodeURIComponent(b.image.value.split('/').pop()!) : null, wikipedia: b.article?.value ?? null,
  };
}

/**
 * Generic timeline for countries without a curated history: notable dated events located in the
 * country (wars, battles, treaties, disasters …), ranked by sitelinks. Clearly labelled as Wikidata.
 */
export async function wikidataEvents(countryQid: string): Promise<HistoryEvent[]> {
  const q = `SELECT ?e ?eLabel ?eDescription ?date ?coord ?article ?sitelinks WHERE {
    VALUES ?cls { wd:Q198 wd:Q178561 wd:Q131569 wd:Q3839081 wd:Q8065 wd:Q124734 wd:Q10931 }
    ?e wdt:P31 ?cls ; wdt:P17 wd:${countryQid} ; wikibase:sitelinks ?sitelinks .
    { ?e wdt:P585 ?date } UNION { ?e wdt:P580 ?date }
    OPTIONAL { ?e wdt:P625 ?coord }
    OPTIONAL { ?article schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
    FILTER(?sitelinks >= 8)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } ORDER BY DESC(?sitelinks) LIMIT 40`;
  const d = await liveJson<{ results: { bindings: Binding[] } }>(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { cacheKey: `wd:ev:${countryQid}`, timeoutMs: 45000 });
  const seen = new Set<string>();
  const out: HistoryEvent[] = [];
  for (const b of d.results.bindings) {
    const id = b.e!.value.split('/').pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const dt = b.date!.value;
    const year = Number(dt.startsWith('-') ? '-' + dt.slice(1).split('-')[0] : dt.split('-')[0]);
    const pt = b.coord ? parsePoint(b.coord.value) : null;
    out.push({
      id, era: 'wikidata', year, date: dt.slice(0, 10), precision: 'year',
      title_en: b.eLabel?.value ?? id, title_ms: b.eLabel?.value ?? id,
      summary_en: b.eDescription?.value ?? '', summary_ms: b.eDescription?.value ?? '',
      coord: pt ?? undefined, refs: [{ title: 'Wikidata', url: `https://www.wikidata.org/wiki/${id}` }, ...(b.article ? [{ title: 'Wikipedia', url: b.article.value }] : [])],
    });
  }
  return out.sort((a, b) => a.year - b.year);
}
