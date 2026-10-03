import type { Indicator } from '../../types';
import { useAtlas } from '../../store/atlas';
import { StatCard } from '../StatCard';
import { latest, resolveSeries, type SourcePref } from '../../hooks/resolve';
import type { LocationBundle, WbState } from '../../hooks/useLocation';
import { t } from '../../utils/i18n';

export const KEY_INDICATORS = ['population', 'population_male', 'population_female', 'density', 'births', 'deaths', 'gdp', 'gdp_per_capita'];

function shortSource(id: string | undefined, catalog: ReturnType<typeof useAtlas.getState>['catalog']): string {
  if (!id || !catalog) return '';
  const s = catalog.sources[id];
  if (id === 'un_wpp_2024') return 'UN WPP 2024';
  if (id === 'wb_wdi') return 'World Bank';
  if (id === 'dosm_opendosm') return 'DOSM';
  if (id === 'worldstat_derived') return 'Derived';
  return s?.publisher ?? id;
}

/** Headline tiles for the Location Intelligence panel. */
export function KeyStats({ b, wb, pref, codes = KEY_INDICATORS }: { b: LocationBundle; wb: WbState | null | undefined; pref: SourcePref; codes?: string[] }) {
  const { catalog, year, projection, lang } = useAtlas();
  if (!catalog) return null;
  const inds = catalog.indicators;
  return (
    <div className="stat-grid">
      {codes.map((c0) => {
        // official land-area density (FAO/WB) beats the geometry-derived one when it is available
        const code = c0 === 'density' && resolveSeries('density_wb', b, wb, inds, pref) ? 'density_wb' : c0;
        const ind: Indicator | undefined = inds[code];
        const s = resolveSeries(code, b, wb, inds, pref);
        const p = latest(s, year, projection);
        const prev = s && p ? s.points.find((x) => x.year === p.year - 1) : undefined;
        const delta = p && prev && prev.value && code !== 'density' ? { value: ((p.value - prev.value) / Math.abs(prev.value)) * 100, label: lang === 'ms' ? 'thn lepas' : 'y/y', goodWhenUp: null } : null;
        return <StatCard key={code} ind={ind} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={shortSource(s?.sourceId, catalog)} delta={code === 'population' ? delta : null} big={code === 'population'} />;
      })}
      {b.areaKm2 ? (
        <StatCard label={t(lang, 'area')} ind={inds.area_geometry_km2} value={b.areaKm2} quality="DERIVED" sourceLabel="Natural Earth / geoBoundaries" hint={inds.area_geometry_km2?.notes} />
      ) : null}
    </div>
  );
}
