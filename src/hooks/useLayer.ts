// Active statistical map layer: values for the selected year, classification and legend data.
import { useMemo } from 'react';
import type { GeoRef, Indicator, LayerDoc, Quality } from '../types';
import { ESTIMATE_LAST_YEAR, useAtlas } from '../store/atlas';
import { useAsync } from './useAsync';
import { layerQualityAt, layerYearsWithData, loadDosm, loadLayer, type DosmDoc } from '../services/stats';
import { classify, type Classification } from '../maps/palette';
import { dosmFileFor } from '../utils/geoRefs';

export interface LayerState {
  indicator: Indicator | null;
  doc: (LayerDoc & { mode?: string }) | null;
  values: Record<string, number>;
  yearUsed: number;
  quality: Quality | null;
  classification: Classification | null;
  yearsWithData: number[];
  loading: boolean;
  error: Error | null;
  /** Malaysia states / districts from OpenDOSM (when the snapshot exists and has this indicator). */
  admin: { level: 'admin1' | 'admin2'; values: Record<string, number>; year: number; quality: Quality | null; classification: Classification | null }[];
}

/** Malaysia's DOSM figures the map is showing: districts / constituencies from zoom 5 (where their
 *  fill draws over the states), states below it. Only when Malaysia is in view by selection, or the
 *  layer has no world data at all. */
export function visibleMyAdmin(L: LayerState, selection: GeoRef | null, zoom: number): LayerState['admin'][number] | undefined {
  if (selection?.countryId !== 'MYS' && L.doc) return undefined;
  const level = zoom >= 5 && L.admin.some((a) => a.level === 'admin2') ? 'admin2' : 'admin1';
  return L.admin.find((a) => a.level === level) ?? L.admin[0];
}

export function useLayer(): LayerState {
  const { catalog, layer, year, theme, regionFilter, projection, myDivision } = useAtlas();
  const ind = catalog && layer ? catalog.indicators[layer] ?? null : null;
  const st = useAsync(() => (ind && catalog ? loadLayer(ind, catalog) : Promise.resolve(null)), [ind?.code, catalog]);
  const dosm = useAsync(async () => {
    if (!ind) return null;
    const [a1, a2] = await Promise.all([loadDosm('admin1'), loadDosm(dosmFileFor(myDivision))]);
    return { a1, a2 };
  }, [ind?.code, myDivision]);

  return useMemo<LayerState>(() => {
    const doc = st.data ?? null;
    const empty: LayerState = { indicator: ind, doc, values: {}, yearUsed: year, quality: null, classification: null, yearsWithData: [], loading: st.loading, error: st.error, admin: [] };
    if (!ind || !catalog) return empty;
    const kind = ind.scale === 'diverging' ? 'diverging' : 'sequential';
    const admin: LayerState['admin'] = [];
    const add = (level: 'admin1' | 'admin2', d: DosmDoc | null | undefined) => {
      if (!d) return;
      const vals: Record<string, number> = {};
      let yy = -Infinity;
      const qn: Partial<Record<Quality, number>> = {};
      for (const [uid, u] of Object.entries(d.units)) {
        const s = u.series[ind.code];
        if (!s?.length) continue;
        // slider at its "now" end (projections off): the latest published estimate, as in the panel
        const pt = !projection && year >= ESTIMATE_LAST_YEAR ? [...s].reverse().find(([, , q]) => q !== 'PROJECTION') ?? s[s.length - 1] : [...s].reverse().find(([py]) => py <= year) ?? s[0];
        vals[uid] = pt[1];
        yy = Math.max(yy, pt[0]);
        if (pt[2]) qn[pt[2] as Quality] = (qn[pt[2] as Quality] ?? 0) + 1;
      }
      const quality = (Object.entries(qn).sort((a, b) => b[1] - a[1])[0]?.[0] as Quality | undefined) ?? null; // what most units show
      if (Object.keys(vals).length) admin.push({ level, values: vals, year: yy, quality, classification: classify(Object.values(vals), kind, theme) });
    };
    add('admin1', dosm.data?.a1);
    add('admin2', dosm.data?.a2);
    // a DOSM-only indicator (household income, Gini, …) has no world layer: Malaysia's units are the map
    if (!doc) return admin.length ? { ...empty, yearUsed: admin[0].year, quality: admin[0].quality, admin, loading: st.loading || dosm.loading } : empty;
    const yearsWithData = layerYearsWithData(doc);
    // WB layers: if the chosen year has no data at all, use the latest year with data not after it
    let y = year;
    if (!yearsWithData.includes(y)) {
      const prior = yearsWithData.filter((v) => v <= y);
      y = prior.length ? prior[prior.length - 1] : yearsWithData[0] ?? year;
    }
    if (!projection && doc.estimate_last !== undefined && y > doc.estimate_last) y = doc.estimate_last;
    const i = doc.years.indexOf(y);
    const values: Record<string, number> = {};
    const members = regionFilter ? new Set(catalog.regions[regionFilter]?.members ?? []) : null;
    for (const [id, arr] of Object.entries(doc.values)) {
      const v = arr[i];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      if (members && !members.has(id)) continue;
      values[id] = v;
    }
    const classification = classify(Object.values(values), kind, theme);
    return { indicator: ind, doc, values, yearUsed: y, quality: layerQualityAt(doc, ind, y), classification, yearsWithData, loading: st.loading, error: st.error, admin };
  }, [st.data, st.loading, st.error, dosm.data, dosm.loading, ind, catalog, year, theme, regionFilter, projection]);
}
