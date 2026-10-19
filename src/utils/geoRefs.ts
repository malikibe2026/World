import type { Catalog } from '../services/catalog';
import type { GeoRef, Lang } from '../types';

/** Malaysia below state level: districts, parliamentary constituencies, or state assembly constituencies (DUN). */
export type MyDivision = 'district' | 'parlimen' | 'dun';

/** Malaysian parliamentary constituency ids look like "MY-10-p094" (state + P code). */
export const isParlimen = (id: string | null | undefined): boolean => !!id && /^MY-\d{2}-p\d{3}$/.test(id);

/** State assembly constituency (DUN) ids look like "MY-10-n01" (state + N code; N codes repeat per state). */
export const isDun = (id: string | null | undefined): boolean => !!id && /^MY-\d{2}-n\d{2}$/.test(id);

/** The division a Malaysian admin2-depth unit belongs to. */
export const divisionOf = (id: string | null | undefined): MyDivision => (isParlimen(id) ? 'parlimen' : isDun(id) ? 'dun' : 'district');

/** File-name suffix of a division's geometry and profiles ("MYS-parlimen.topo.json"). */
export const divisionSuffix = (d: MyDivision): string => (d === 'district' ? '' : `-${d}`);

/** The state id ("MY-10") in a unit's parent chain. */
export const stateIdOf = (parents: string[]): string | undefined => parents.find((p) => /^MY-\d{2}$/.test(p));

export type DosmLevel = 'national' | 'admin1' | 'admin2' | 'parlimen' | 'dun';

/** Which DOSM file holds a division's figures. */
export const dosmFileFor = (d: MyDivision): DosmLevel => (d === 'district' ? 'admin2' : d);

/** Which DOSM file holds a unit's figures. */
export function dosmLevelFor(g: Pick<GeoRef, 'id' | 'level'>): DosmLevel {
  if (g.level === 'country') return 'national';
  if (g.level === 'admin1') return 'admin1';
  return dosmFileFor(divisionOf(g.id));
}

/** Name of a division (or one unit of it) in the interface language. */
export function divisionLabel(d: MyDivision, lang: Lang, one = false): string {
  const ms = lang === 'ms';
  if (d === 'parlimen') return ms ? (one ? 'parlimen' : 'Parlimen') : one ? 'constituency' : 'Constituencies';
  if (d === 'dun') return ms ? (one ? 'DUN' : 'DUN') : one ? 'state constituency' : 'State seats (DUN)';
  return ms ? (one ? 'daerah' : 'Daerah') : one ? 'district' : 'Districts';
}

/** Admin unit type in the interface language (the data files carry English types). */
export function adminTypeLabel(type: string | undefined, lang: Lang): string | undefined {
  if (!type || lang !== 'ms') return type;
  return ({ District: 'Daerah', State: 'Negeri', 'Federal Territory': 'Wilayah Persekutuan', 'Parliamentary constituency': 'Kawasan parlimen', 'State assembly constituency': 'Kawasan DUN' } as Record<string, string>)[type] ?? type;
}

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
