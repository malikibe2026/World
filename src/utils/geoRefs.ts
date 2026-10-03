import type { Catalog } from '../services/catalog';
import type { GeoRef, Lang } from '../types';

/** Bounding box of a region from its members (skips members that wrap the antimeridian). */
export function regionBBox(cat: Catalog, regionId: string): [number, number, number, number] | undefined {
  const ids = regionId === 'WORLD' ? cat.countryList.map((c) => c.id) : cat.regions[regionId]?.members ?? [];
  let b: [number, number, number, number] | undefined;
  for (const id of ids) {
    const c = cat.countries[id];
    if (!c || c.bbox[2] - c.bbox[0] > 180) continue;
    b = b ? [Math.min(b[0], c.bbox[0]), Math.min(b[1], c.bbox[1]), Math.max(b[2], c.bbox[2]), Math.max(b[3], c.bbox[3])] : [...c.bbox];
  }
  return b;
}

export function regionRef(cat: Catalog, id: string, lang: Lang): GeoRef {
  if (id === 'WORLD') return { id, level: 'world', name: lang === 'ms' ? 'Dunia' : 'World', parents: [] };
  const r = cat.regions[id];
  return { id, level: r?.level === 'subregion' ? 'subregion' : 'continent', name: (lang === 'ms' ? r?.name_ms : undefined) ?? r?.name ?? id, parents: ['WORLD'] };
}

export function countryRef(cat: Catalog, id: string): GeoRef {
  const c = cat.countries[id];
  return { id, level: 'country', name: c?.name ?? id, countryId: id, parents: ['WORLD', ...(c?.continent_id ? [c.continent_id] : [])] };
}
