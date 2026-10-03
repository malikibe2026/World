// Active statistical map layer: values for the selected year, classification and legend data.
import { useMemo } from 'react';
import type { Indicator, LayerDoc, Quality } from '../types';
import { useAtlas } from '../store/atlas';
import { useAsync } from './useAsync';
import { layerQualityAt, layerYearsWithData, loadDosm, loadLayer, type DosmDoc } from '../services/stats';
import { classify, type Classification } from '../maps/palette';

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
  admin: { level: 'admin1' | 'admin2'; values: Record<string, number>; year: number; classification: Classification | null }[];
}

export function useLayer(): LayerState {
  const { catalog, layer, year, theme, regionFilter, projection } = useAtlas();
  const ind = catalog && layer ? catalog.indicators[layer] ?? null : null;
  const st = useAsync(() => (ind && catalog ? loadLayer(ind, catalog) : Promise.resolve(null)), [ind?.code, catalog]);
  const dosm = useAsync(async () => {
    if (!ind) return null;
    const [a1, a2] = await Promise.all([loadDosm('admin1'), loadDosm('admin2')]);
    return { a1, a2 };
  }, [ind?.code]);

  return useMemo<LayerState>(() => {
    const doc = st.data ?? null;
    const empty: LayerState = { indicator: ind, doc, values: {}, yearUsed: year, quality: null, classification: null, yearsWithData: [], loading: st.loading, error: st.error, admin: [] };
    if (!doc || !ind || !catalog) return empty;
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
    const kind = ind.scale === 'diverging' ? 'diverging' : 'sequential';
    const classification = classify(Object.values(values), kind, theme);
    const admin: LayerState['admin'] = [];
    const add = (level: 'admin1' | 'admin2', d: DosmDoc | null | undefined) => {
      if (!d) return;
      const vals: Record<string, number> = {};
      let yy = -Infinity;
      for (const [uid, u] of Object.entries(d.units)) {
        const s = u.series[ind.code];
        if (!s?.length) continue;
        const pt = [...s].reverse().find(([py]) => py <= year) ?? s[0];
        vals[uid] = pt[1];
        yy = Math.max(yy, pt[0]);
      }
      if (Object.keys(vals).length) admin.push({ level, values: vals, year: yy, classification: classify(Object.values(vals), kind, theme) });
    };
    add('admin1', dosm.data?.a1);
    add('admin2', dosm.data?.a2);
    return { indicator: ind, doc, values, yearUsed: y, quality: layerQualityAt(doc, ind, y), classification, yearsWithData, loading: st.loading, error: st.error, admin };
  }, [st.data, st.loading, st.error, dosm.data, ind, catalog, year, theme, regionFilter, projection]);
}
