import { dosmLevelFor } from '../utils/geoRefs';
// Everything the location panel and dashboard need for the current selection.
import { useMemo } from 'react';
import type { AdminUnit, CountryProfile, GeoRef, HistoryDoc, Landmark, Series, WppDoc } from '../types';
import { useAtlas } from '../store/atlas';
import { useAsync } from './useAsync';
import { findAdmin, profiles } from '../services/geo';
import { loadDosm, loadWpp, wbCountrySeries, type DosmUnit } from '../services/stats';
import { loadOptional } from '../services/http';
import { landmarksForCountry, wikidataEvents } from '../services/wikidata';

export interface LocationBundle {
  geo: GeoRef;
  country: CountryProfile | null;
  admin: AdminUnit | null;
  wpp: WppDoc | null;
  dosm: DosmUnit | null;
  dosmLevel: 'national' | 'admin1' | 'admin2' | null;
  areaKm2: number | null;
}

export function useLocationBundle(geo: GeoRef | null) {
  return useAsync<LocationBundle | null>(async () => {
    if (!geo) return null;
    const countryId = geo.level === 'country' || geo.level === 'admin1' || geo.level === 'admin2' ? geo.countryId ?? geo.id : null;
    const [country, admin, wpp, dosm] = await Promise.all([
      countryId ? profiles.country(countryId) : Promise.resolve(null),
      geo.level === 'admin1' || geo.level === 'admin2' ? findAdmin(countryId!, geo.id) : Promise.resolve(null),
      geo.level === 'country' || geo.level === 'world' || geo.level === 'continent' || geo.level === 'subregion' ? loadWpp(geo.id) : Promise.resolve(null),
      countryId === 'MYS' ? loadDosm(dosmLevelFor(geo)) : Promise.resolve(null),
    ]);
    const dosmUnit = dosm ? dosm.units[geo.level === 'country' ? 'MYS' : geo.id] ?? null : null;
    return {
      geo,
      country,
      admin,
      wpp,
      dosm: dosmUnit,
      dosmLevel: dosmUnit ? (geo.level === 'country' ? 'national' : (geo.level as 'admin1' | 'admin2')) : null,
      areaKm2: admin?.area_km2 ?? country?.area_geometry_km2 ?? null,
    };
  }, [geo?.id]);
}

export interface WbState { series: Record<string, Series>; lastUpdated: string | null; mode: 'live' | 'snapshot' }

/** World Bank indicators for a country (live API, or the pipeline snapshot if built). */
export function useWorldBank(countryId: string | null | undefined) {
  const catalog = useAtlas((s) => s.catalog);
  return useAsync<WbState | null>(async () => {
    if (!countryId || !catalog) return null;
    const c = catalog.countries[countryId];
    if (!c?.wb) return null;
    return wbCountrySeries(countryId, c.wb, catalog.indicatorList);
  }, [countryId, catalog]);
}

export function useHistory(countryId: string | null | undefined, wikidataQid: string | null | undefined) {
  return useAsync<{ doc: HistoryDoc | null; events: HistoryDoc['events']; mode: 'curated' | 'wikidata' } | null>(async () => {
    if (!countryId) return null;
    const doc = await loadOptional<HistoryDoc>(`history/${countryId}.json`);
    if (doc) return { doc, events: doc.events, mode: 'curated' };
    if (!wikidataQid) return { doc: null, events: [], mode: 'wikidata' };
    return { doc: null, events: await wikidataEvents(wikidataQid), mode: 'wikidata' };
  }, [countryId, wikidataQid]);
}

export function useLandmarks(countryId: string | null | undefined, wikidataQid: string | null | undefined) {
  const { catalog, setLandmarks } = useAtlas();
  const st = useAsync<{ items: Landmark[]; mode: 'snapshot' | 'live'; retrievedAt: string | null } | null>(async () => {
    if (!countryId || !catalog) { setLandmarks([]); return null; }
    const r = await landmarksForCountry(countryId, wikidataQid ?? null, catalog.landmarkCategories);
    setLandmarks(r.items);
    return r;
  }, [countryId, wikidataQid, catalog]);
  return st;
}

/** Sorted list helper used by several panels. */
export function useMemoSorted<T>(xs: T[] | undefined, key: (x: T) => number) {
  return useMemo(() => (xs ? [...xs].sort((a, b) => key(b) - key(a)) : []), [xs, key]);
}
