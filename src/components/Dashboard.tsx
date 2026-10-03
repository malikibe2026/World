import { useMemo, type ReactNode } from 'react';
import { useAtlas, type DashTab } from '../store/atlas';
import { useLayer } from '../hooks/useLayer';
import { useHistory, useLocationBundle, useWorldBank } from '../hooks/useLocation';
import { latest, resolveSeries } from '../hooks/resolve';
import { ChartCard } from '../charts/ChartCard';
import { PyramidChart, RankingChart, TreemapChart, TrendChart, type LineSpec } from '../charts/charts';
import { HistoryTimeline } from './panel/HistoryTimeline';
import { NotAvailable } from './NotAvailable';
import { SourceNote } from './SourceNote';
import { ComparePanel } from './ComparePanel';
import { dosmPyramid, wppPyramid } from '../services/stats';
import { indicatorName, t, type I18nKey } from '../utils/i18n';
import { formatValue } from '../utils/format';
import { countryRef } from '../utils/geoRefs';
import type { Indicator, Series } from '../types';

const TABS: Array<{ id: DashTab; key: I18nKey }> = [
  { id: 'overview', key: 'overview' }, { id: 'population', key: 'population' }, { id: 'vital', key: 'vitalStatistics' },
  { id: 'economy', key: 'economicIntelligence' }, { id: 'tourism', key: 'tourism' }, { id: 'history', key: 'history' }, { id: 'ranking', key: 'ranking' },
];

export function Dashboard() {
  const { lang, dashTab, setDashTab, dashOpen, togglePanel, compare } = useAtlas();
  return (
    <section className={`dash ${dashOpen ? 'open' : 'closed'}`} aria-label="Charts & statistical analysis">
      <div className="dash-bar">
        <div className="tabs" role="tablist">
          {TABS.map((tb) => (
            <button key={tb.id} role="tab" aria-selected={dashTab === tb.id} className={`tab ${dashTab === tb.id ? 'on' : ''}`} onClick={() => setDashTab(tb.id)}>{t(lang, tb.key)}</button>
          ))}
          <button role="tab" aria-selected={dashTab === 'compare'} className={`tab ${dashTab === 'compare' ? 'on' : ''}`} onClick={() => setDashTab('compare')}>
            {t(lang, 'compare')}{compare.length ? <span className="tab-count">{compare.length}</span> : null}
          </button>
        </div>
        <button className="icon-btn" onClick={() => togglePanel('dash')} aria-expanded={dashOpen} aria-label="Toggle dashboard">{dashOpen ? '▾' : '▴'}</button>
      </div>
      {dashOpen && <div className="dash-body"><DashContent /></div>}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="dash-grid">{children}</div>;
}

function DashContent() {
  const { dashTab, selection, catalog, lang, year, projection } = useAtlas();
  const bundle = useLocationBundle(selection);
  const countryId = selection?.level === 'country' ? selection.id : null;
  const wb = useWorldBank(countryId);
  const hist = useHistory(countryId, bundle.data?.country?.wikidata);
  if (!catalog) return null;
  if (dashTab === 'compare') return <ComparePanel />;
  if (dashTab === 'ranking' || (!selection && dashTab === 'overview')) return <RankingTab />;
  if (!selection) return <div className="dash-empty">{t(lang, 'selectArea')}</div>;
  const b = bundle.data?.geo.id === selection.id ? bundle.data : null;
  if (!b) return <div className="dash-empty">{t(lang, 'loading')}</div>;
  const inds = catalog.indicators;
  if ((selection.level === 'admin1' || selection.level === 'admin2') && !b.dosm && dashTab !== 'history') {
    return (
      <div className="dash-empty">
        <NotAvailable reason={selection.countryId === 'MYS' ? t(lang, 'dosmNotLoaded') : lang === 'ms' ? 'Tiada statistik rasmi terbuka yang diselaraskan untuk tahap pentadbiran ini. Profil geografi tersedia dalam panel lokasi.' : 'No harmonised open official statistics for this administrative level. The geographic profile is in the location panel.'} />
      </div>
    );
  }
  const s = (c: string): Series | null => resolveSeries(c, b, wb.data, inds, 'dosm');
  const maxYear = projection ? 2100 : 2024;
  const line = (codes: string[], opts: { title: string; ind?: Indicator; names?: string[]; area?: boolean; maxYear?: number }) => {
    const lines: LineSpec[] = codes.map((c, i) => ({ name: opts.names?.[i] ?? indicatorName(lang, inds[c]), series: s(c)! })).filter((l) => l.series && l.series.points.length);
    const ind = opts.ind ?? inds[codes[0]];
    if (!lines.length) return <ChartCard key={opts.title} title={opts.title}><NotAvailable compact /></ChartCard>;
    const yrs = [...new Set(lines.flatMap((l) => l.series.points.map((p) => p.year)))].filter((y) => y <= (opts.maxYear ?? maxYear)).sort((a, b2) => a - b2);
    return (
      <ChartCard key={opts.title} title={opts.title} subtitle={<>{ind?.unit}</>}
        table={{ columns: [t(lang, 'year'), ...lines.map((l) => l.name), t(lang, 'quality')], rows: yrs.map((y) => [y, ...lines.map((l) => l.series.points.find((p) => p.year === y)?.value ?? null), lines[0].series.points.find((p) => p.year === y)?.quality ?? null]) }}
        footer={<SourceNote sourceId={lines[0].series.sourceId} lastUpdated={lines[0].series.lastUpdated} note={lines.some((l) => l.series.points.some((p) => p.quality === 'PROJECTION' && p.year <= (opts.maxYear ?? maxYear))) ? t(lang, 'estimateVsProjection') : undefined} />}>
        <TrendChart lang={lang} ind={ind} lines={lines.map((l) => ({ ...l, area: opts.area }))} yearMarker={year} maxYear={opts.maxYear ?? maxYear} />
      </ChartCard>
    );
  };

  if (dashTab === 'overview' || dashTab === 'population') {
    const pyr = b.dosm ? dosmPyramid(b.dosm, year) : b.wpp ? wppPyramid(b.wpp, Math.min(year, maxYear)) : null;
    return (
      <Grid>
        {line(['population'], { title: t(lang, 'populationTrend'), area: true })}
        {line(['population_male', 'population_female'], { title: `${t(lang, 'male')} / ${t(lang, 'female')}`, names: [t(lang, 'male'), t(lang, 'female')], ind: inds.population })}
        {line(['pop_0_14_pct', 'pop_15_64_pct', 'pop_65_plus_pct'], { title: t(lang, 'ageGroups'), names: ['0–14', '15–64', '65+'], ind: inds.pop_0_14_pct })}
        {pyr ? (
          <ChartCard title={`${t(lang, 'populationPyramid')} · ${pyr.year}`} subtitle={`% ${lang === 'ms' ? 'daripada jumlah' : 'of total'}`}
            table={{ columns: [lang === 'ms' ? 'Umur' : 'Age', t(lang, 'male'), t(lang, 'female')], rows: pyr.groups.map((g, i) => [g, pyr.male[i], pyr.female[i]]) }}
            footer={<SourceNote sourceId={pyr.sourceId} quality={pyr.quality} year={pyr.year} />}>
            <PyramidChart lang={lang} groups={pyr.groups} male={pyr.male} female={pyr.female} labels={{ male: t(lang, 'male'), female: t(lang, 'female') }} height={260} />
          </ChartCard>
        ) : <ChartCard title={t(lang, 'populationPyramid')}><NotAvailable compact /></ChartCard>}
        {line(['median_age'], { title: t(lang, 'medianAge') })}
        {line(['growth_rate'], { title: indicatorName(lang, inds.growth_rate) })}
        {line(['density'], { title: indicatorName(lang, inds.density) })}
        {line(['urban_pct'], { title: indicatorName(lang, inds.urban_pct), maxYear: 2030 })}
      </Grid>
    );
  }
  if (dashTab === 'vital') {
    return (
      <Grid>
        {line(['births', 'deaths'], { title: `${t(lang, 'births')} / ${t(lang, 'deaths')}`, names: [t(lang, 'births'), t(lang, 'deaths')] })}
        {line(['cbr', 'cdr'], { title: `${indicatorName(lang, inds.cbr)} / ${indicatorName(lang, inds.cdr)}` })}
        {line(['tfr'], { title: indicatorName(lang, inds.tfr) })}
        {line(['e0_male', 'e0_female', 'e0'], { title: indicatorName(lang, inds.e0), names: [t(lang, 'male'), t(lang, 'female'), lang === 'ms' ? 'Keseluruhan' : 'Both sexes'] })}
        {line(['imr'], { title: indicatorName(lang, inds.imr), maxYear: 2030 })}
        {line(['natural_increase', 'net_migration'], { title: `${indicatorName(lang, inds.natural_increase)} / ${indicatorName(lang, inds.net_migration)}`, ind: inds.natural_increase })}
        {line(['marriages_male', 'marriages_female'], { title: lang === 'ms' ? 'Perkahwinan (DOSM)' : 'Marriages (DOSM)', maxYear: 2030 })}
        {line(['srb'], { title: indicatorName(lang, inds.srb) })}
      </Grid>
    );
  }
  if (dashTab === 'economy') {
    if (wb.loading && !wb.data) return <div className="dash-empty">{t(lang, 'loading')}</div>;
    if (!wb.data && !b.dosm) return <div className="dash-empty"><NotAvailable reason={wb.error ? `${t(lang, 'liveSourceFailed')} (World Bank API)` : undefined} /></div>;
    const ag = latest(s('agriculture_va'), year), ind = latest(s('industry_va'), year), man = latest(s('manufacturing_va'), year), ser = latest(s('services_va'), year);
    const tree = ag && ind && ser ? [
      { name: lang === 'ms' ? 'Pertanian' : 'Agriculture', value: ag.value },
      ...(man && man.year === ind.year ? [{ name: lang === 'ms' ? 'Pembuatan' : 'Manufacturing', value: man.value }, { name: lang === 'ms' ? 'Industri lain' : 'Other industry', value: Math.max(0, ind.value - man.value) }] : [{ name: lang === 'ms' ? 'Industri' : 'Industry', value: ind.value }]),
      { name: lang === 'ms' ? 'Perkhidmatan' : 'Services', value: ser.value },
    ] : null;
    return (
      <Grid>
        {line(['gdp'], { title: indicatorName(lang, inds.gdp), maxYear: 2030, area: true })}
        {line(['gdp_growth'], { title: indicatorName(lang, inds.gdp_growth), maxYear: 2030 })}
        {line(['gdp_per_capita'], { title: indicatorName(lang, inds.gdp_per_capita), maxYear: 2030 })}
        {line(['inflation'], { title: indicatorName(lang, inds.inflation), maxYear: 2030 })}
        {line(['unemployment'], { title: indicatorName(lang, inds.unemployment), maxYear: 2030 })}
        {line(['exports', 'imports'], { title: `${t(lang, 'trade')}: ${indicatorName(lang, inds.exports)} / ${indicatorName(lang, inds.imports)}`, ind: inds.exports, maxYear: 2030 })}
        {line(['trade_balance'], { title: indicatorName(lang, inds.trade_balance), maxYear: 2030 })}
        <ChartCard title={t(lang, 'economicStructure')} subtitle={tree ? `% ${lang === 'ms' ? 'KDNK' : 'of GDP'} · ${[...new Set([ag!.year, ind!.year, ser!.year])].join('/')}` : undefined}
          table={tree ? { columns: [lang === 'ms' ? 'Sektor' : 'Sector', '%'], rows: tree.map((x) => [x.name, x.value]) } : undefined}
          footer={<SourceNote sourceId="wb_wdi" lastUpdated={wb.data?.lastUpdated} />}>
          {tree ? <TreemapChart items={tree} height={220} /> : <NotAvailable compact />}
        </ChartCard>
        {line(['labour_force'], { title: indicatorName(lang, inds.labour_force), maxYear: 2030 })}
        {line(['poverty', 'gini'], { title: `${indicatorName(lang, inds.poverty)}`, maxYear: 2030 })}
        {line(['electricity_access', 'renewable_energy'], { title: t(lang, 'energy'), ind: inds.electricity_access, maxYear: 2030 })}
        {line(['mineral_rents', 'oil_rents'], { title: lang === 'ms' ? 'Perlombongan & minyak (sewa, % KDNK)' : 'Mining & oil (rents, % of GDP)', ind: inds.mineral_rents, maxYear: 2030 })}
      </Grid>
    );
  }
  if (dashTab === 'tourism') {
    return (
      <Grid>
        {line(['tourism_arrivals'], { title: indicatorName(lang, inds.tourism_arrivals), maxYear: 2030, area: true })}
        {line(['tourism_receipts'], { title: indicatorName(lang, inds.tourism_receipts), maxYear: 2030 })}
        {line(['tourism_receipts_pct_exports'], { title: indicatorName(lang, inds.tourism_receipts_pct_exports), maxYear: 2030 })}
        {line(['tourism_departures'], { title: indicatorName(lang, inds.tourism_departures), maxYear: 2030 })}
      </Grid>
    );
  }
  if (dashTab === 'history') {
    if (selection.level !== 'country') return <div className="dash-empty">{t(lang, 'selectArea')}</div>;
    return (
      <div className="dash-history">
        <HistoryTimeline doc={hist.data?.doc ?? null} events={hist.data?.events ?? []} mode={hist.data?.mode ?? 'curated'} loading={hist.loading} error={hist.error} />
      </div>
    );
  }
  return null;
}

/** Ranking of the active map layer (respects the region filter and the time machine year). */
function RankingTab() {
  const { lang, catalog, selection, select } = useAtlas();
  const L = useLayer();
  const rows = useMemo(() => {
    if (!catalog) return [];
    return Object.entries(L.values).map(([id, value]) => ({ id, name: catalog.countries[id]?.name ?? id, value, highlight: id === selection?.id })).sort((a, b) => b.value - a.value);
  }, [L.values, catalog, selection?.id]);
  if (!catalog) return null;
  if (!L.indicator) return <div className="dash-empty">{lang === 'ms' ? 'Pilih lapisan peta statistik di bar sisi untuk melihat kedudukan.' : 'Choose a statistical map layer in the sidebar to see rankings.'}</div>;
  const top = rows.slice(0, 15);
  const bottom = rows.slice(-15).reverse();
  const selIdx = selection ? rows.findIndex((r) => r.id === selection.id) : -1;
  const onSelect = (id: string) => select(countryRef(catalog, id), { bbox: catalog.countries[id]?.bbox });
  const sub = <>{L.indicator.unit} · {L.yearUsed} {selIdx >= 0 ? <> · <b>{selection!.name}</b>: #{selIdx + 1} / {rows.length} ({formatValue(rows[selIdx].value, L.indicator, lang, { compact: true })})</> : null}</>;
  const table = { columns: ['#', t(lang, 'country'), t(lang, 'value')], rows: rows.map((r, i) => [i + 1, r.name, r.value]) };
  return (
    <Grid>
      <ChartCard title={`${t(lang, 'ranking')}: ${indicatorName(lang, L.indicator)} — ${lang === 'ms' ? 'tertinggi' : 'highest'}`} subtitle={sub} table={table}
        footer={<SourceNote sourceId={L.indicator.source_id} quality={L.quality} year={L.yearUsed} lastUpdated={L.doc?.last_updated} live={L.doc?.mode === 'live'} />}>
        <RankingChart items={top} ind={L.indicator} lang={lang} onSelect={onSelect} />
      </ChartCard>
      <ChartCard title={`${t(lang, 'ranking')}: ${indicatorName(lang, L.indicator)} — ${lang === 'ms' ? 'terendah' : 'lowest'}`} subtitle={sub}>
        <RankingChart items={bottom} ind={L.indicator} lang={lang} onSelect={onSelect} />
      </ChartCard>
    </Grid>
  );
}
