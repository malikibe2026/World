import { dosmLevelFor } from '../utils/geoRefs';
import { useMemo, useState } from 'react';
import { useAtlas } from '../store/atlas';
import { useAsync } from '../hooks/useAsync';
import { resolveSeries } from '../hooks/resolve';
import type { LocationBundle, WbState } from '../hooks/useLocation';
import { findAdmin, profiles } from '../services/geo';
import { loadDosm, loadWpp, wbCountrySeries } from '../services/stats';
import { alignYears } from '../utils/quality';
import { ChartCard } from '../charts/ChartCard';
import { CompareBars, TrendChart } from '../charts/charts';
import { NotAvailable } from './NotAvailable';
import { QualityBadge } from './QualityBadge';
import { indicatorName, t } from '../utils/i18n';
import type { GeoRef, Series } from '../types';

const DEFAULT = ['population', 'density', 'gdp_per_capita', 'gdp_growth', 'unemployment', 'cbr', 'cdr', 'tfr', 'e0', 'median_age', 'pop_65_plus_pct', 'urban_pct', 'tourism_arrivals'];

async function loadOne(g: GeoRef, catalog: NonNullable<ReturnType<typeof useAtlas.getState>['catalog']>): Promise<{ b: LocationBundle; wb: WbState | null }> {
  const cid = g.countryId ?? g.id;
  const [country, admin, wpp, dosm] = await Promise.all([
    g.level === 'country' || g.level === 'admin1' || g.level === 'admin2' ? profiles.country(cid) : Promise.resolve(null),
    g.level === 'admin1' || g.level === 'admin2' ? findAdmin(cid, g.id) : Promise.resolve(null),
    g.level === 'admin1' || g.level === 'admin2' ? Promise.resolve(null) : loadWpp(g.id),
    cid === 'MYS' ? loadDosm(dosmLevelFor(g)) : Promise.resolve(null),
  ]);
  const unit = dosm?.units[g.level === 'country' ? 'MYS' : g.id] ?? null;
  const c = catalog.countries[cid];
  const wb = g.level === 'country' && c?.wb ? await wbCountrySeries(cid, c.wb, catalog.indicatorList).catch(() => null) : null;
  return { b: { geo: g, country, admin, wpp, dosm: unit, dosmLevel: null, areaKm2: admin?.area_km2 ?? country?.area_geometry_km2 ?? null }, wb };
}

/** Country / area comparison on matching reference years (differences are flagged). */
export function ComparePanel() {
  const { compare, removeCompare, clearCompare, catalog, lang, year, projection } = useAtlas();
  const [focus, setFocus] = useState('population');
  const data = useAsync(async () => (catalog ? Promise.all(compare.map((g) => loadOne(g, catalog))) : []), [compare.map((c) => c.id).join(','), catalog]);

  const series = useMemo(() => {
    const out: Record<string, Record<string, Series | undefined>> = {};
    if (!catalog || !data.data) return out;
    for (const code of DEFAULT) {
      out[code] = {};
      for (const d of data.data) out[code][d.b.geo.id] = resolveSeries(code, d.b, d.wb, catalog.indicators, 'dosm') ?? undefined;
    }
    return out;
  }, [data.data, catalog]);

  if (!catalog) return null;
  if (!compare.length) return <div className="dash-empty">{t(lang, 'compareEmpty')}</div>;
  const inds = catalog.indicators;
  const colorOf = (id: string) => compare.findIndex((c) => c.id === id);
  const prefer = projection ? year : Math.min(year, 2024);

  return (
    <div className="compare">
      <div className="compare-head">
        <div className="chips">
          {compare.map((g, i) => (
            <span key={g.id} className="chip chip-solid">
              <span className="sw" style={{ background: `var(--series-${(i % 8) + 1})` }} />
              {g.countryId ? catalog.countries[g.countryId]?.flag : ''} {g.name}
              <button className="chip-x" onClick={() => removeCompare(g.id)} aria-label={`${t(lang, 'removeFromCompare')}: ${g.name}`}>×</button>
            </span>
          ))}
          <button className="link small" onClick={clearCompare}>{t(lang, 'clear')}</button>
        </div>
        <p className="fineprint">{t(lang, 'compareYearNote')}</p>
      </div>
      {data.loading && !data.data ? <div className="dash-empty">{t(lang, 'loading')}</div> : (
        <>
          <div className="dash-grid">
            {DEFAULT.map((code) => {
              const al = alignYears(series[code] ?? {}, prefer);
              const items = compare.map((g) => ({ g, v: al.values[g.id] })).filter((x) => x.v);
              const mismatch = al.issues.some((i) => i.check === 'year_mismatch');
              return (
                <ChartCard key={code} title={indicatorName(lang, inds[code])} subtitle={<>{inds[code]?.unit} · {mismatch ? <span className="warn">⚠ {t(lang, 'differentYears')}</span> : al.year ?? '—'}</>}
                  table={{ columns: [t(lang, 'location'), t(lang, 'value'), t(lang, 'year'), t(lang, 'quality')], rows: compare.map((g) => [g.name, al.values[g.id]?.value ?? null, al.values[g.id]?.year ?? null, al.values[g.id]?.quality ?? null]) }}
                  actions={<button className={`link small ${focus === code ? 'on' : ''}`} onClick={() => setFocus(code)}>{lang === 'ms' ? 'Trend' : 'Trend'}</button>}>
                  {items.length ? (
                    <>
                      <CompareBars lang={lang} ind={inds[code]} items={items.map(({ g, v }) => ({ id: g.id, name: g.name, value: v!.value, year: mismatch ? v!.year : undefined, color: colorOf(g.id) }))} height={170} />
                      <div className="compare-q">{[...new Set(items.map((x) => x.v!.quality))].map((q) => <QualityBadge key={q} q={q} small />)}</div>
                    </>
                  ) : <NotAvailable compact />}
                </ChartCard>
              );
            })}
          </div>
          <ChartCard title={`${indicatorName(lang, inds[focus])} — ${lang === 'ms' ? 'trend' : 'trend'}`} subtitle={inds[focus]?.unit}>
            {compare.some((g) => series[focus]?.[g.id]) ? (
              <TrendChart lang={lang} ind={inds[focus]} maxYear={projection ? 2100 : 2030} yearMarker={year}
                lines={compare.filter((g) => series[focus]?.[g.id]).map((g) => ({ name: g.name, series: series[focus]![g.id]!, color: colorOf(g.id) }))} height={260} />
            ) : <NotAvailable compact />}
          </ChartCard>
          <p className="fineprint">{lang === 'ms' ? 'Warna mengikut lokasi (bukan kedudukan). Sumber setiap nilai ditunjukkan dalam paparan jadual dan eksport.' : 'Colours follow the place (not its rank). Each value’s source is in the table view and in exports.'}</p>
        </>
      )}
    </div>
  );
}
