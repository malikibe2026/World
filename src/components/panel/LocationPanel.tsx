import { MyDivisionSwitch } from '../MyDivisionSwitch';
import { adminTypeLabel } from '../../utils/geoRefs';
import { useMemo, useState, type ReactNode } from 'react';
import { useAtlas } from '../../store/atlas';
import { useHistory, useLandmarks, useLocationBundle, useWorldBank } from '../../hooks/useLocation';
import { latest, resolveSeries, type SourcePref } from '../../hooks/resolve';
import { KeyStats } from './KeyStats';
import { GeographyProfile } from './GeographyProfile';
import { LandmarkList } from './LandmarkList';
import { HistoryTimeline } from './HistoryTimeline';
import { PointCard } from './PointCard';
import { StatCard } from '../StatCard';
import { NotAvailable } from '../NotAvailable';
import { SourceNote } from '../SourceNote';
import { TrendChart, PyramidChart, DonutChart } from '../../charts/charts';
import { breakYear, dosmPyramid, lastEstimateYear, wppPyramid } from '../../services/stats';
import { ESTIMATE_LAST_YEAR } from '../../store/atlas';
import { t } from '../../utils/i18n';
import { compact } from '../../utils/format';
import type { GeoRef, Series } from '../../types';
import { Breadcrumb } from '../Breadcrumb';

function Section({ id, title, children, defaultOpen = true, extra }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  return (
    <details className="psec" open={defaultOpen} id={`sec-${id}`}>
      <summary><span>{title}</span>{extra}</summary>
      <div className="psec-body">{children}</div>
    </details>
  );
}

const VITAL = ['births', 'deaths', 'cbr', 'cdr', 'tfr', 'imr', 'e0', 'natural_increase', 'median_age', 'sex_ratio'];
const ECON = ['gdp', 'gdp_per_capita', 'gdp_growth', 'inflation', 'unemployment', 'labour_force', 'exports', 'imports', 'trade_balance', 'gni_per_capita', 'poverty', 'hh_income_median'];
const TOURISM = ['tourism_arrivals', 'tourism_receipts', 'tourism_receipts_pct_exports', 'tourism_departures'];
const SOCIAL = ['urban_pct', 'urban_population', 'rural_population', 'electricity_access', 'renewable_energy'];

export function LocationPanel() {
  const { selection, point, lang, catalog, year, projection, addCompare, removeCompare, compare, setModal, setDashTab, select } = useAtlas();
  const bundle = useLocationBundle(selection);
  const countryId = selection && ['country', 'admin1', 'admin2'].includes(selection.level) ? selection.countryId ?? selection.id : null;
  const wb = useWorldBank(selection?.level === 'country' ? countryId : null);
  const qid = bundle.data?.country?.wikidata ?? null;
  const hist = useHistory(selection?.level === 'country' ? countryId : null, qid);
  const lms = useLandmarks(countryId, qid);
  const [pref, setPref] = useState<SourcePref>('dosm');

  if (point) return <PointCard p={point} />;
  if (!catalog) return null;
  if (!selection) return <Welcome />;

  const b = bundle.data && bundle.data.geo.id === selection.id ? bundle.data : null;
  const inds = catalog.indicators;
  const s = (code: string): Series | null => resolveSeries(code, b, wb.data, inds, pref);
  const flag = countryId ? catalog.countries[countryId]?.flag : null;
  const inCompare = compare.some((c) => c.id === selection.id);
  const isMys = countryId === 'MYS';
  const dosmLoaded = catalog.manifest.available.dosm_snapshot;
  const statsLevel = selection.level === 'admin1' || selection.level === 'admin2';
  const pyr = b?.dosm && pref === 'dosm' ? dosmPyramid(b.dosm, year) : b?.wpp ? wppPyramid(b.wpp, Math.min(year, projection ? 2100 : 2024)) : null;

  const levelLabel = { world: t(lang, 'world'), continent: t(lang, 'continent'), subregion: t(lang, 'subregion'), country: t(lang, 'country'), admin1: adminTypeLabel(b?.admin?.type, lang) ?? (lang === 'ms' ? 'Negeri / wilayah' : 'State / province'), admin2: adminTypeLabel(b?.admin?.type, lang) ?? (lang === 'ms' ? 'Daerah' : 'District'), place: '' }[selection.level];

  return (
    <div className="loc">
      <Breadcrumb />
      <header className="loc-head">
        <div className="loc-title">
          {flag && <span className="loc-flag" aria-hidden="true">{flag}</span>}
          <div>
            <h2>{selection.name}</h2>
            <div className="loc-level">{levelLabel}{b?.country && selection.level !== 'country' ? ` · ${b.country.name}` : ''}</div>
          </div>
        </div>
        <div className="loc-actions">
          {(selection.level === 'country' || statsLevel) && (
            <button className="btn btn-sm" onClick={() => (inCompare ? removeCompare(selection.id) : addCompare(selection))} aria-pressed={inCompare} title={t(lang, inCompare ? 'removeFromCompare' : 'addToCompare')}>
              {inCompare ? '✓' : '+'} {t(lang, 'compare')}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setModal('download')}>⤓ {t(lang, 'download')}</button>
          <button className="icon-btn" onClick={() => select(null)} aria-label={t(lang, 'close')}>×</button>
        </div>
      </header>

      {isMys && (
        <div className="my-mode">
          <div className="my-mode-title">🇲🇾 {t(lang, 'malaysiaMode')} <span className="muted">· {t(lang, 'malaysiaModeHint')}</span></div>
          <MyDivisionSwitch />
          {b?.dosm ? (
            <div className="seg seg-xs" role="radiogroup" aria-label={t(lang, 'source')}>
              <button className={pref === 'dosm' ? 'on' : ''} onClick={() => setPref('dosm')} role="radio" aria-checked={pref === 'dosm'}>DOSM</button>
              {selection.level === 'country' && <button className={pref === 'un' ? 'on' : ''} onClick={() => setPref('un')} role="radio" aria-checked={pref === 'un'}>UN WPP</button>}
            </div>
          ) : (
            <p className="fineprint">{!dosmLoaded ? t(lang, 'dosmNotLoaded') : ''} {selection.level === 'country' ? t(lang, 'unWppVsDosm') : ''}</p>
          )}
        </div>
      )}

      {bundle.loading && !b ? <div className="muted small pad">{t(lang, 'loading')}</div> : null}

      {b && (
        <>
          {statsLevel && !b.dosm ? (
            <NotAvailable reason={isMys ? t(lang, 'dosmNotLoaded') : lang === 'ms' ? 'Tiada statistik rasmi terbuka yang diselaraskan untuk tahap pentadbiran ini dalam snapshot.' : 'No harmonised open official statistics for this administrative level in the snapshot.'} />
          ) : null}
          {b.dosm?.breaks?.length ? (
            <p className="fineprint warn pad" role="note">⚠ {lang === 'ms'
              ? `Perubahan sempadan: mulai ${breakYear(b.dosm)}, DOSM menerbitkan angka ${b.dosm.name} mengikut sempadan baharu, kerana sebahagian kawasannya dipindahkan ke daerah baharu (daerah baharu di negeri ini mulai ${breakYear(b.dosm)}: ${b.dosm.breaks[0].new_districts.join(', ')}). Angka ${breakYear(b.dosm)} ke atas tidak boleh dibandingkan terus dengan tahun sebelumnya (perubahan ${b.dosm.breaks[0].change_pct}% ialah perubahan definisi, bukan penduduk). Sempadan di peta masih sempadan lama, jadi kepadatan tidak dikira bagi tahun tersebut.`
              : `Boundary change: from ${breakYear(b.dosm)}, DOSM publishes ${b.dosm.name} on its new boundary, as part of its area moved to new districts (new districts in this state from ${breakYear(b.dosm)}: ${b.dosm.breaks[0].new_districts.join(', ')}). Figures from ${breakYear(b.dosm)} are not comparable with earlier years (the ${b.dosm.breaks[0].change_pct}% change is a redefinition, not a population change). The map still shows the old boundary, so density is not computed for those years.`}</p>
          ) : null}
          {(!statsLevel || b.dosm) && <KeyStats b={b} wb={wb.data} pref={pref} codes={selection.level === 'country' || b.dosm ? undefined : ['population', 'population_male', 'population_female', 'births', 'deaths', 'tfr', 'e0', 'median_age']} />}
          {wb.error && selection.level === 'country' && <p className="fineprint warn pad">⚠ {t(lang, 'liveSourceFailed')} (World Bank API). {lang === 'ms' ? 'Indikator ekonomi dipaparkan sebagai "Data tidak tersedia".' : 'Economic indicators show as “Data not available”.'}</p>}

          {(b.wpp || b.dosm) && (
            <Section id="trend" title={t(lang, 'populationTrend')} extra={<button className="link small" onClick={(e) => { e.preventDefault(); setDashTab('population'); }}>{lang === 'ms' ? 'Analisis ›' : 'Analyse ›'}</button>}>
              {s('population') ? (
                <>
                  <TrendChart lang={lang} ind={inds.population} height={170} yearMarker={year} lines={[{ name: t(lang, 'population'), series: s('population')!, area: true, breakYear: s('population')!.sourceId === 'dosm_opendosm' ? breakYear(b.dosm) ?? undefined : undefined }]} maxYear={projection ? 2100 : Math.max(ESTIMATE_LAST_YEAR, lastEstimateYear(s('population')) ?? ESTIMATE_LAST_YEAR)} />
                  <SourceNote sourceId={s('population')!.sourceId} note={projection ? t(lang, 'estimateVsProjection') : undefined} />
                </>
              ) : <NotAvailable compact />}
            </Section>
          )}

          {pyr && (
            <Section id="pyramid" title={`${t(lang, 'populationPyramid')} · ${pyr.year}`}>
              <PyramidChart lang={lang} groups={pyr.groups} male={pyr.male} female={pyr.female} height={250} labels={{ male: t(lang, 'male'), female: t(lang, 'female') }} />
              <SourceNote sourceId={pyr.sourceId} quality={pyr.quality} year={pyr.year} />
            </Section>
          )}

          {(b.wpp || b.dosm || wb.data) && (
            <Section id="vital" title={t(lang, 'vitalStatistics')}>
              <div className="stat-grid stat-grid-3">
                {VITAL.map((c) => { const ss = s(c); const p = latest(ss, year, projection); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? sourceShort(ss.sourceId) : undefined} />; })}
                {['marriages_male', 'divorces'].map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'DOSM' : undefined} hint={inds[c]?.notes} />; })}
              </div>
            </Section>
          )}

          {selection.level === 'country' && (
            <Section id="economy" title={t(lang, 'economicIntelligence')} extra={<button className="link small" onClick={(e) => { e.preventDefault(); setDashTab('economy'); }}>{lang === 'ms' ? 'Analisis ›' : 'Analyse ›'}</button>}>
              {wb.loading && !wb.data ? <div className="muted small">{t(lang, 'loading')}</div> : (
                <>
                  <div className="stat-grid stat-grid-3">
                    {ECON.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? sourceShort(ss.sourceId) : undefined} hint={inds[c]?.original_source} />; })}
                  </div>
                  <StructureDonut s={s} />
                  {wb.data && <SourceNote sourceId="wb_wdi" lastUpdated={wb.data.lastUpdated} live={wb.data.mode === 'live'} note={lang === 'ms' ? 'Setiap siri WDI menyimpan penyusun asalnya (cth. ILO, UN Tourism, IMF).' : 'Each WDI series keeps its original compiler (e.g. ILO, UN Tourism, IMF).'} />}
                </>
              )}
            </Section>
          )}

          {selection.level === 'country' && (
            <Section id="social" title={lang === 'ms' ? 'Sosial & tenaga' : 'Society & energy'} defaultOpen={false}>
              <div className="stat-grid stat-grid-3">
                {SOCIAL.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'World Bank' : undefined} hint={inds[c]?.original_source} />; })}
              </div>
            </Section>
          )}

          {(b.country || b.admin) && (
            <Section id="cities" title={t(lang, 'majorCities')}>
              <CityList cities={(b.admin ?? b.country)!.cities ?? []} />
            </Section>
          )}

          {countryId && (
            <Section id="landmarks" title={t(lang, 'topLandmarks')}>
              <LandmarkList items={lms.data?.items ?? []} loading={lms.loading} error={lms.error} />
            </Section>
          )}

          {selection.level === 'country' && (
            <Section id="tourism" title={t(lang, 'tourism')} defaultOpen={false}>
              <div className="stat-grid">
                {TOURISM.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'UN Tourism via WB' : undefined} />; })}
              </div>
            </Section>
          )}

          {(b.country || b.admin) && (
            <Section id="geo" title={t(lang, 'geographyProfile')} defaultOpen={selection.level !== 'country'}>
              <GeographyProfile country={b.country} admin={b.admin} wb={wb.data} />
            </Section>
          )}

          {selection.level === 'country' && (
            <Section id="history" title={t(lang, 'history')} extra={<button className="link small" onClick={(e) => { e.preventDefault(); setDashTab('history'); }}>{lang === 'ms' ? 'Penjelajah ›' : 'Explorer ›'}</button>}>
              <HistoryTimeline doc={hist.data?.doc ?? null} events={hist.data?.events ?? []} mode={hist.data?.mode ?? 'curated'} compact loading={hist.loading} error={hist.error} />
            </Section>
          )}

          {(selection.level === 'world' || selection.level === 'continent' || selection.level === 'subregion') && <RegionMembers geo={selection} />}

          <Section id="sources" title={t(lang, 'sources')} defaultOpen={false}>
            <UsedSources ids={[...new Set([b.dosm ? 'dosm_opendosm' : null, b.wpp ? 'un_wpp_2024' : null, wb.data ? 'wb_wdi' : null, 'natural_earth', isMys ? 'geoboundaries' : null, lms.data?.items.length ? 'wikidata' : null, hist.data?.mode === 'curated' ? 'worldstat_curated' : null, 'worldstat_derived'].filter(Boolean) as string[])]} />
            <button className="link small" onClick={() => setModal('sources')}>{t(lang, 'sourcesTitle')} ›</button>
          </Section>
        </>
      )}
    </div>
  );
}

function sourceShort(id: string) {
  return id === 'un_wpp_2024' ? 'UN WPP 2024' : id === 'wb_wdi' ? 'World Bank' : id === 'dosm_opendosm' ? 'DOSM' : id === 'worldstat_derived' ? 'Derived' : id;
}

function StructureDonut({ s }: { s: (c: string) => Series | null }) {
  const { lang, year } = useAtlas();
  const ag = latest(s('agriculture_va'), year), ind = latest(s('industry_va'), year), man = latest(s('manufacturing_va'), year), ser = latest(s('services_va'), year);
  if (!ag || !ind || !ser) return <NotAvailable compact reason={lang === 'ms' ? 'Struktur ekonomi (nilai ditambah % KDNK)' : 'Economic structure (value added, % of GDP)'} />;
  const years = new Set([ag.year, ind.year, ser.year]);
  const otherInd = man && man.year === ind.year ? Math.max(0, ind.value - man.value) : null;
  const rest = Math.max(0, 100 - ag.value - ind.value - ser.value);
  const items = [
    { name: lang === 'ms' ? 'Pertanian' : 'Agriculture', value: ag.value },
    ...(man && otherInd !== null ? [{ name: lang === 'ms' ? 'Pembuatan' : 'Manufacturing', value: man.value }, { name: lang === 'ms' ? 'Industri lain (lombong, pembinaan, utiliti)' : 'Other industry (mining, construction, utilities)', value: otherInd }] : [{ name: lang === 'ms' ? 'Industri' : 'Industry', value: ind.value }]),
    { name: lang === 'ms' ? 'Perkhidmatan' : 'Services', value: ser.value },
    ...(rest > 0.5 ? [{ name: lang === 'ms' ? 'Cukai bersih / tidak diagih' : 'Net taxes / unallocated', value: rest }] : []),
  ];
  return (
    <div className="mt">
      <div className="mini-title">{lang === 'ms' ? 'Struktur ekonomi' : 'Economic structure'} · {[...years].join('/')} <span className="muted">({lang === 'ms' ? '% KDNK, nilai ditambah' : '% of GDP, value added'})</span></div>
      <DonutChart lang={lang} items={items} height={170} />
      {years.size > 1 && <p className="fineprint warn">⚠ {t(lang, 'differentYears')}</p>}
      <p className="fineprint">{lang === 'ms' ? '"Industri lain" dan "cukai bersih" diterbitkan (DERIVED) sebagai baki daripada siri rasmi pada tahun yang sama.' : '“Other industry” and “net taxes” are DERIVED as residuals of official series for the same year.'}</p>
    </div>
  );
}

function CityList({ cities }: { cities: Array<{ name: string; pop: number | null; kind: string; admin1?: string }> }) {
  const lang = useAtlas((s) => s.lang);
  if (!cities.length) return <NotAvailable compact />;
  return (
    <>
      <ol className="city-list">
        {cities.slice(0, 10).map((c) => (
          <li key={c.name}>
            <span className="city-name">{c.kind === 'capital' ? '★ ' : ''}{c.name}</span>
            <span className="city-pop">{c.pop ? `~${compact(c.pop, lang)}` : '—'}</span>
          </li>
        ))}
      </ol>
      <p className="fineprint">{lang === 'ms' ? 'Penduduk bandar: anggaran himpunan Natural Earth (aglomerasi bandar), bukan angka banci rasmi.' : 'City populations: Natural Earth compiled estimates (urban agglomeration), not official census figures.'}</p>
    </>
  );
}

function UsedSources({ ids }: { ids: string[] }) {
  const { catalog } = useAtlas();
  if (!catalog) return null;
  return (
    <ul className="src-list">
      {ids.map((id) => {
        const s = catalog.sources[id];
        if (!s) return null;
        return (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.publisher}</a> — {s.name}
            <span className="muted"> · {s.license}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RegionMembers({ geo }: { geo: GeoRef }) {
  const { catalog, lang, select, year } = useAtlas();
  const members = useMemo(() => {
    if (!catalog) return [];
    const ids = geo.id === 'WORLD' ? catalog.countryList.filter((c) => c.has_wpp).map((c) => c.id) : catalog.regions[geo.id]?.members ?? [];
    return ids.map((id) => catalog.countries[id]).filter(Boolean);
  }, [catalog, geo.id]);
  void year;
  return (
    <Section id="members" title={`${t(lang, 'members')} (${members.length})`}>
      <div className="chips">
        {members.slice(0, 80).map((c) => (
          <button key={c.id} className="chip" onClick={() => select({ id: c.id, level: 'country', name: c.name, countryId: c.id, parents: ['WORLD', ...(c.continent_id ? [c.continent_id] : [])] }, { bbox: c.bbox })}>
            {c.flag} {c.name}
          </button>
        ))}
      </div>
    </Section>
  );
}

function Welcome() {
  const { lang, catalog, select } = useAtlas();
  if (!catalog) return null;
  return (
    <div className="welcome">
      <h2>{t(lang, 'welcomeTitle')}</h2>
      <p>{t(lang, 'welcomeBody')}</p>
      <div className="welcome-actions">
        <button className="btn btn-primary" onClick={() => select({ id: 'WORLD', level: 'world', name: t(lang, 'world'), parents: [] })}>🌐 {t(lang, 'worldTotals')}</button>
        <button className="btn" onClick={() => { const c = catalog.countries.MYS; select({ id: 'MYS', level: 'country', name: c.name, countryId: 'MYS', parents: ['WORLD', 'UN_935'] }, { bbox: c.bbox }); }}>🇲🇾 Malaysia</button>
      </div>
      <div className="welcome-continents">
        {catalog.regionList.filter((r) => r.level === 'continent').map((r) => (
          <button key={r.id} className="chip" onClick={() => select({ id: r.id, level: 'continent', name: lang === 'ms' ? r.name_ms ?? r.name : r.name, parents: ['WORLD'] })}>{lang === 'ms' ? r.name_ms ?? r.name : r.name}</button>
        ))}
      </div>
      <p className="fineprint">{t(lang, 'keyboardHint')} · {t(lang, 'zoomHint')}</p>
    </div>
  );
}
