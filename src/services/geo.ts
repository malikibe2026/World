// Geometry loading. TopoJSON files are converted to GeoJSON once and memoised; admin layers
// are fetched per country only when the map needs them (never the whole world at once).
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { AdminUnit, CountryProfile } from '../types';
import { loadData, loadOptional } from './http';

const fcCache = new Map<string, Promise<FeatureCollection>>();

function topo(path: string): Promise<FeatureCollection> {
  if (!fcCache.has(path)) {
    fcCache.set(
      path,
      loadData<Topology>(path).then((t) => {
        const key = Object.keys(t.objects)[0];
        const fc = feature(t, t.objects[key]) as unknown as FeatureCollection<Geometry>;
        return fc;
      }),
    );
  }
  return fcCache.get(path)!;
}

function plain(path: string): Promise<FeatureCollection> {
  if (!fcCache.has(path)) fcCache.set(path, loadData<FeatureCollection>(path));
  return fcCache.get(path)!;
}

export const geo = {
  world: (res: '110m' | '50m' | '10m') => topo(`geo/world-${res}.topo.json`),
  admin1: (countryId: string) => topo(`geo/admin1/${countryId}.topo.json`),
  admin2: (countryId: string) => topo(`geo/admin2/${countryId}.topo.json`),
  cities: () => plain('geo/places/cities.json'),
  peaks: () => plain('geo/physical/peaks.json'),
  physicalLabels: () => plain('geo/physical/regions.json'),
  marine: () => plain('geo/physical/marine.json'),
  rivers: (res: '50m' | '10m') => topo(`geo/physical/rivers-${res}.topo.json`),
  lakes: (res: '50m' | '10m') => topo(`geo/physical/lakes-${res}.topo.json`),
  airports: () => plain('geo/infra/airports.json'),
  ports: () => plain('geo/infra/ports.json'),
  roads: () => topo('geo/infra/roads.topo.json'),
  urban: () => topo('geo/infra/urban.topo.json'),
};

export interface AdminProfiles {
  country: string;
  admin1: AdminUnit[];
  admin2?: AdminUnit[];
}

export const profiles = {
  country: (id: string) => loadOptional<CountryProfile>(`profiles/${id}.json`),
  admin: (countryId: string) => loadOptional<AdminProfiles>(`profiles/admin/${countryId}.json`),
};

/** Find an admin unit (admin1 or admin2) by id within its country's profile file. */
export async function findAdmin(countryId: string, id: string): Promise<AdminUnit | null> {
  const doc = await profiles.admin(countryId);
  if (!doc) return null;
  return doc.admin1.find((u) => u.id === id) ?? doc.admin2?.find((u) => u.id === id) ?? null;
}

/** Country id that owns an admin id ("MY-10" → MYS, "JPN-1860" → JPN, "MY-10-hulu-langat" → MYS). */
export function countryOfAdmin(adminId: string): string | null {
  if (adminId.startsWith('MY-')) return 'MYS';
  const m = /^([A-Z]{3})-/.exec(adminId);
  return m ? m[1] : null;
}
