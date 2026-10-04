// Malaysian villages / settlements (GeoNames points). Loaded per state, only when the map is
// zoomed in far enough to show them, so the country-wide set is never fetched at once.
import type { Feature, FeatureCollection, Point } from 'geojson';
import { loadOptional } from './http';

type Item = [number, string, string, number, number, string]; // gid, name, fcode, lon, lat, district
interface StateDoc { state: string; items: Item[] }
export interface VillageIndex {
  source_url: string;
  retrieved_at: string | null;
  states: Record<string, { name: string; count: number; bbox: [number, number, number, number] }>;
  names: Record<string, string>;
}

let indexP: Promise<VillageIndex | null> | null = null;
const stateP = new Map<string, Promise<Feature<Point>[]>>();

export function villageIndex(): Promise<VillageIndex | null> {
  if (!indexP) indexP = loadOptional<VillageIndex>('geo/places/my/index.json');
  return indexP;
}

function stateFeatures(id: string, idx: VillageIndex): Promise<Feature<Point>[]> {
  if (!stateP.has(id)) {
    stateP.set(id, loadOptional<StateDoc>(`geo/places/my/${id}.json`).then((d) =>
      (d?.items ?? []).map(([gid, name, fcode, lon, lat, district]) => ({
        type: 'Feature',
        id: gid,
        properties: { gid, name, fcode, state: id, district, district_name: idx.names?.[district] ?? district, state_name: idx.states[id]?.name ?? id },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })),
    ));
  }
  return stateP.get(id)!;
}

/**
 * Loads the states whose extent intersects the view (west, south, east, north) and returns every
 * state loaded so far, so panning never drops points already on the map. null = nothing new.
 */
export async function villagesInView(view: [number, number, number, number]): Promise<FeatureCollection<Point> | null> {
  const idx = await villageIndex();
  if (!idx) return null;
  const [w, s, e, n] = view;
  const ids = Object.entries(idx.states).filter(([, v]) => v.bbox[0] <= e && v.bbox[2] >= w && v.bbox[1] <= n && v.bbox[3] >= s).map(([k]) => k);
  if (ids.every((id) => stateP.has(id))) return null;
  for (const id of ids) stateFeatures(id, idx);
  const parts = await Promise.all([...stateP.values()]);
  return { type: 'FeatureCollection', features: parts.flat() };
}
