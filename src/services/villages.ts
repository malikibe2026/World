// Malaysian villages / settlements (GeoNames points). Loaded per state, only when the map is
// zoomed in far enough to show them, so the country-wide set is never fetched at once.
import type { Feature, FeatureCollection, Point } from 'geojson';
import { loadOptional } from './http';

type Item = [number, string, string, number, number, string, string | null, (string | null)?]; // gid, name, fcode, lon, lat, district, parlimen, dun
interface StateDoc { state: string; items: Item[] }
export interface VillageIndex {
  source_url: string;
  data_as_of: string | null; // newest GeoNames modification date
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
      (d?.items ?? []).map(([gid, name, fcode, lon, lat, district, parlimen, dun]) => ({
        type: 'Feature',
        id: gid,
        properties: { gid, name, fcode, state: id, district, district_name: idx.names?.[district] ?? district, parlimen: parlimen ?? null, parlimen_name: parlimen ? idx.names?.[parlimen] ?? parlimen : null, dun: dun ?? null, dun_name: dun ? idx.names?.[dun] ?? dun : null, state_name: idx.states[id]?.name ?? id },
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

/** The constituency (parlimen or DUN) a GeoNames settlement lies in (Malaysia), from its state's file.
 *  A DUN also returns the parlimen around it, for its parent chain. */
export async function settlementConstituency(gid: number, stateId: string, division: 'parlimen' | 'dun'): Promise<{ id: string; name: string; parlimen: string | null } | null> {
  const idx = await villageIndex();
  if (!idx?.states[stateId]) return null;
  const p = (await stateFeatures(stateId, idx)).find((x) => x.properties?.gid === gid)?.properties;
  const id = p?.[division] as string | null | undefined;
  return id ? { id, name: String(p![`${division}_name`] ?? id), parlimen: (p!.parlimen as string | null) ?? null } : null;
}
