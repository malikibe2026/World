// Picks the right source for an indicator at the current location, in priority order:
// Malaysia → OpenDOSM (when loaded, unless the user switched to UN) · UN WPP · World Bank WDI.
import type { Indicator, Quality, Series } from '../types';
import type { LocationBundle, WbState } from './useLocation';
import { densitySeries, dosmSeries, pointAt, wppSeries } from '../services/stats';

export type SourcePref = 'dosm' | 'un';

export function resolveSeries(code: string, b: LocationBundle | null | undefined, wb: WbState | null | undefined, inds: Record<string, Indicator>, pref: SourcePref = 'dosm'): Series | null {
  if (!b) return null;
  const ind = inds[code];
  if (b.dosm && pref === 'dosm') {
    const s = dosmSeries(b.dosm, code);
    if (s) return s;
    if (code === 'density') {
      const p = dosmSeries(b.dosm, 'population');
      const d = densitySeries(p, b.areaKm2);
      if (d) return d;
    }
  }
  if (b.wpp) {
    if (code === 'density') return densitySeries(wppSeries(b.wpp, 'population', inds.population), b.areaKm2);
    const s = wppSeries(b.wpp, code, ind);
    if (s && s.points.length) return s;
  }
  if (wb?.series[code]) return wb.series[code];
  if (code === 'trade_balance' && wb?.series.exports && wb.series.imports) {
    const imp = new Map(wb.series.imports.points.map((p) => [p.year, p.value]));
    const points = wb.series.exports.points.filter((p) => imp.has(p.year)).map((p) => ({ year: p.year, value: p.value - imp.get(p.year)!, quality: 'DERIVED' as Quality }));
    return { indicator: 'trade_balance', sourceId: 'worldstat_derived', lastUpdated: wb.lastUpdated, points };
  }
  return null;
}

export function latest(s: Series | null | undefined, year: number, allowProjection = false) {
  return pointAt(s, year, { allowProjection });
}
