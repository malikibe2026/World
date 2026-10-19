import { MyDivisionSwitch } from '../MyDivisionSwitch';
import { adminTypeLabel, divisionOf } from '../../utils/geoRefs';
import { useMemo, useState, type ReactNode } from 'react';
import { useAtlas } from '../../store/atlas';
import { useHistory, useLandmarks, useLocationBundle, useWorldBank } from '../../hooks/useLocation';
import { latest, resolveSeries, type SourcePref } from '../../hooks/resolve';
import { KeyStats, myAgency } from './KeyStats';
import { GeographyProfile } from './GeographyProfile';
import { LandmarkList } from './LandmarkList';
import { HistoryTimeline } from './HistoryTimeline';
import { PointCard } from './PointCard';
import { StatCard } from '../StatCard';
import { QualityBadge } from '../QualityBadge';
import { NotAvailable } from '../NotAvailable';
import { SourceNote } from '../SourceNote';
import { TrendChart, PyramidChart, DonutChart } from '../../charts/charts';
import { breakYear, dosmPyramid, lastEstimateYear, wppPyramid, type DosmUnit } from '../../services/stats';
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

const VITAL = ['births', 'deaths', 'cbr', 'cdr', 'tfr', 'imr', 'e0', 'e0_male', 'e0_female', 'natural_increase', 'median_age', 'sex_ratio'];
const ECON = ['gdp', 'gdp_per_capita', 'gdp_growth', 'inflation', 'unemployment', 'labour_force', 'exports', 'imports', 'trade_balance', 'gni_per_capita', 'poverty', 'hh_income_median'];
const TOURISM = ['tourism_arrivals', 'tourism_receipts', 'tourism_receipts_pct_exports', 'tourism_departures'];
const SOCIAL = ['urban_pct', 'urban_population', 'rural_population', 'electricity_access', 'renewable_energy'];
// Malaysia below national level: DOSM household survey (HIES) and labour force survey (LFS) by area
const MY_SOCIO = ['hh_income_median', 'hh_income_mean', 'hh_expenditure_mean', 'gini_coef', 'poverty_absolute', 'unemployment', 'lfpr', 'labour_force'];
// citizen ethnic groups in DOSM's order (shares of citizens) and government schools (Ministry of Education)
const MY_ETH = ['eth_bumi_malay_pct', 'eth_bumi_other_pct', 'eth_chinese_pct', 'eth_indian_pct', 'eth_other_citizen_pct'];
const MY_GDP = ['gdp_real_myr', 'gdp_real_growth', 'gdp_real_per_capita_myr'];
const GDP_SHARES: Array<[string, string, string]> = [['gdp_share_agriculture', 'Pertanian', 'Agriculture'], ['gdp_share_mining', 'Perlombongan', 'Mining'], ['gdp_share_manufacturing', 'Pembuatan', 'Manufacturing'], ['gdp_share_construction', 'Pembinaan', 'Construction'], ['gdp_share_services', 'Perkhidmatan', 'Services']];
const MY_WAGES = ['wages_median', 'wages_mean', 'wages_median_male', 'wages_median_female', 'wages_median_real', 'wage_recipients', 'inflation', 'cpi'];
const MY_CRIME = ['crime_index', 'crime_rate', 'crime_violent', 'crime_property', 'crime_murder', 'crime_rape', 'crime_robbery', 'crime_injury', 'crime_break_in', 'crime_vehicle_theft', 'crime_theft_other'];
const MY_CROPS = ['crop_area_paddy', 'crop_prod_paddy', 'crop_area_fruit', 'crop_prod_fruit', 'crop_area_vegetables', 'crop_prod_vegetables'];
const MY_FINANCE = ['state_revenue', 'state_revenue_tax', 'state_revenue_nontax', 'state_expenditure', 'state_expenditure_operating', 'state_expenditure_development', 'state_current_balance'];
const MY_EDU = ['schools_primary', 'schools_secondary', 'students_primary', 'students_secondary', 'ptr_primary', 'ptr_secondary', 'completion_primary', 'completion_secondary_lower', 'completion_secondary_upper'];

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

          {isMys && statsLevel && b.dosm && MY_SOCIO.some((c) => b.dosm!.series[c]?.length) && (
            <Section id="socio" title={lang === 'ms' ? 'Sosioekonomi isi rumah & tenaga buruh' : 'Household economy & labour'}>
              <div className="stat-grid stat-grid-3">
                {MY_SOCIO.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'DOSM' : undefined} hint={inds[c]?.notes} />; })}
              </div>
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Pendapatan, perbelanjaan, Gini dan kemiskinan: Penyiasatan Pendapatan dan Perbelanjaan Isi Rumah (HIES, 2019/2022/2024). Tenaga buruh: Survei Tenaga Buruh (LFS). Nilai nominal.' : 'Income, expenditure, Gini and poverty: Household Income and Expenditure Survey (HIES, 2019/2022/2024). Labour: Labour Force Survey (LFS). Nominal values.'} />
            </Section>
          )}

          {isMys && b.dosm && (b.dosm.series.noncitizen_pct?.length || b.dosm.series.eth_bumi_malay_pct?.length) ? (
            <Section id="ethnic" title={lang === 'ms' ? 'Etnik & kewarganegaraan' : 'Ethnicity & citizenship'}>
              <EthnicComposition s={s} />
              <div className="stat-grid stat-grid-3 mt">
                {['pop_noncitizen', 'noncitizen_pct'].map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'DOSM' : undefined} />; })}
              </div>
              {!b.dosm.series.eth_bumi_malay_pct?.length && (
                <p className="fineprint" role="note">{lang === 'ms'
                  ? 'DOSM tidak menerbitkan pecahan etnik bagi kawasan parlimen dan DUN, hanya warganegara dan bukan warganegara. Atlas ini tidak menganggarkannya daripada data daerah.'
                  : 'DOSM does not publish an ethnic breakdown for parlimen or DUN constituencies, only citizens and non-citizens. This atlas does not estimate one from district data.'}</p>
              )}
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Anggaran Penduduk Semasa DOSM; 2020 ialah Banci. Peratus etnik dikira daripada warganegara, seperti terbitan DOSM; bukan warganegara daripada jumlah penduduk.' : 'DOSM current population estimates; 2020 is the census. Ethnic shares are of citizens, as DOSM publishes them; non-citizens are a share of the whole population.'} />
            </Section>
          ) : null}

          {isMys && b.dosm && MY_EDU.some((c) => b.dosm!.series[c]?.length) && (
            <Section id="education" title={lang === 'ms' ? 'Pendidikan (sekolah kerajaan)' : 'Education (government schools)'}>
              <div className="stat-grid stat-grid-3">
                {MY_EDU.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? 'KPM' : undefined} hint={inds[c]?.notes} />; })}
              </div>
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Kementerian Pendidikan Malaysia (EMIS), melalui data.gov.my. Sekolah kerajaan sahaja. Daerah ikut Pejabat Pendidikan Daerah (PPD): PPD yang meliputi dua daerah tidak dipecahkan, jadi daerah itu tiada angka. Kadar tamat boleh melebihi 100% kerana murid mengulang atau berpindah.' : 'Ministry of Education Malaysia (EMIS), via data.gov.my. Government schools only. Districts follow District Education Offices (PPD): an office covering two districts is not split, so those districts have no figures. Completion can exceed 100% because of repeaters and transfers.'} />
            </Section>
          )}

          {isMys && statsLevel && b.dosm && MY_GDP.some((c) => b.dosm!.series[c]?.length) && (
            <Section id="my-gdp" title={lang === 'ms' ? 'KDNK (harga malar 2015)' : 'GDP (constant 2015 prices)'}>
              <DosmCards codes={MY_GDP} s={s} />
              <GdpShares s={s} />
              <SourceNote sourceId="dosm_opendosm" note={selection.level === 'admin2'
                ? (lang === 'ms' ? 'KDNK daerah hanya diterbitkan bagi 2015–2020 (data lama). KDNK per kapita guna penduduk DOSM 2020.' : 'District GDP is published for 2015–2020 only (old data). Per capita uses DOSM 2020 population.')
                : (lang === 'ms' ? 'KDNK negeri, pendekatan pengeluaran. Putrajaya termasuk dalam Kuala Lumpur hingga 2022.' : 'State GDP, production approach. Putrajaya is included in Kuala Lumpur until 2022.')} />
            </Section>
          )}

          {isMys && b.dosm && selection.level !== 'admin2' && MY_WAGES.some((c) => b.dosm!.series[c]?.length) && (
            <Section id="my-wages" title={lang === 'ms' ? 'Upah & harga pengguna' : 'Wages & consumer prices'}>
              <CpiLatest unit={b.dosm} />
              <DosmCards codes={MY_WAGES} s={s} />
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Survei Gaji & Upah (bersama LFS): upah bulanan pekerjaan utama, sektor awam dan swasta. Upah benar pada harga 2010. Inflasi tahunan = perubahan purata IHP bulanan bagi tahun lengkap (dikira atlas).' : 'Salaries & Wages Survey (with the LFS): monthly wages from the principal job, public and private sectors. Real wages at 2010 prices. Annual inflation = change in the average monthly CPI over complete years (computed by the atlas).'} />
            </Section>
          )}

          {isMys && b.dosm && (selection.level === 'admin2' && divisionOf(selection.id) === 'district' ? (
            <Section id="my-crime" title={lang === 'ms' ? 'Jenayah' : 'Crime'} defaultOpen={false}>
              <p className="fineprint" role="note">{lang === 'ms'
                ? 'PDRM menerbitkan jenayah ikut daerah polis (IPD), yang sempadannya tidak sama dengan daerah pentadbiran (cth. Petaling mempunyai lima IPD). Lihat jadual IPD pada paparan negeri.'
                : 'The police publish crime by police district (IPD), whose boundaries differ from administrative districts (Petaling, for example, has five). See the IPD table on the state view.'}</p>
            </Section>
          ) : MY_CRIME.some((c) => b.dosm!.series[c]?.length) ? (
            <Section id="my-crime" title={lang === 'ms' ? 'Jenayah indeks' : 'Index crime'} defaultOpen={false}>
              <DosmCards codes={MY_CRIME} s={s} />
              {b.dosm.crime_ipd && <IpdTable t={b.dosm.crime_ipd} />}
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'PDRM, disusun DOSM ikut klasifikasi jenayah UNODC. Mengira jenayah dalam Sistem Laporan Polis yang disifatkan sumber sebagai jenayah sebenar; jenayah yang tidak dilaporkan tidak termasuk. W.P. Putrajaya dan W.P. Labuan diasingkan daripada Kuala Lumpur dan Sabah.' : 'Royal Malaysian Police, compiled by DOSM to the UNODC crime classification. Counts crimes in the Police Reporting System that the source describes as actual crimes; unreported crimes are not included. W.P. Putrajaya and W.P. Labuan are separated from Kuala Lumpur and Sabah.'} />
            </Section>
          ) : null)}

          {isMys && b.dosm && MY_CROPS.some((c) => b.dosm!.series[c]?.length) && (
            <Section id="my-crops" title={lang === 'ms' ? 'Pertanian (tanaman)' : 'Agriculture (crops)'} defaultOpen={false}>
              <DosmCards codes={selection.level === 'admin2' ? MY_CROPS.filter((c) => !c.includes('paddy')) : MY_CROPS} s={s} />
              {b.dosm.crops_top && <CropsTop t={b.dosm.crops_top} />}
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Jabatan Pertanian / DOSM. Tidak termasuk kelapa sawit, getah dan tanaman ladang lain. Negeri 2014–2024; daerah 2017 sahaja dan tanpa padi.' : 'Department of Agriculture / DOSM. Excludes oil palm, rubber and other plantation crops. States 2014–2024; districts 2017 only, without paddy.'} />
            </Section>
          )}

          {isMys && selection.level === 'admin1' && b.dosm && (MY_FINANCE.some((c) => b.dosm!.series[c]?.length) ? (
            <Section id="my-finance" title={lang === 'ms' ? 'Kewangan kerajaan negeri' : 'State government finance'} defaultOpen={false}>
              <DosmCards codes={MY_FINANCE} s={s} />
              <SourceNote sourceId="dosm_opendosm" note={lang === 'ms' ? 'Penyata kewangan kerajaan negeri dalam Laporan Ketua Audit Negara: angka sebenar 2022 (Sarawak 2020). Imbangan semasa = hasil − perbelanjaan mengurus (dikira atlas).' : "State financial statements in the Auditor-General's Report: actual figures for 2022 (Sarawak 2020). Current balance = revenue − operating expenditure (computed by the atlas)."} />
            </Section>
          ) : ['MY-14', 'MY-15', 'MY-16'].includes(selection.id) ? (
            <Section id="my-finance" title={lang === 'ms' ? 'Kewangan kerajaan negeri' : 'State government finance'} defaultOpen={false}>
              <p className="fineprint">{lang === 'ms' ? 'Wilayah Persekutuan tiada kerajaan negeri, jadi tiada penyata kewangan negeri.' : 'Federal territories have no state government, so there are no state accounts.'}</p>
            </Section>
          ) : null)}

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

/** Stat tiles for DOSM-snapshot indicators, labelled with the agency that produced each one. */
function DosmCards({ codes, s }: { codes: string[]; s: (c: string) => Series | null }) {
  const { catalog, year } = useAtlas();
  const inds = catalog!.indicators;
  return (
    <div className="stat-grid stat-grid-3">
      {codes.map((c) => { const ss = s(c); const p = latest(ss, year); return <StatCard key={c} ind={inds[c]} value={p?.value} year={p?.year} quality={p?.quality} sourceLabel={ss ? (ss.sourceId === 'dosm_opendosm' ? myAgency(inds[c]) : sourceShort(ss.sourceId)) : undefined} hint={inds[c]?.notes} />; })}
    </div>
  );
}

/** GDP by sector (constant prices), one year. */
function GdpShares({ s }: { s: (c: string) => Series | null }) {
  const { lang, year } = useAtlas();
  const first = latest(s('gdp_share_services'), year);
  if (!first) return null;
  const items = GDP_SHARES.map(([c, ms, en]) => {
    const v = s(c)?.points.find((p) => p.year === first.year)?.value;
    return v === undefined ? null : { name: `${lang === 'ms' ? ms : en} · ${v.toFixed(1)}%`, value: v };
  }).filter((x): x is { name: string; value: number } => x !== null);
  return (
    <div className="mt">
      <div className="mini-title">{lang === 'ms' ? 'Struktur ekonomi' : 'Economic structure'} · {first.year} <span className="muted">(% {lang === 'ms' ? 'KDNK, harga malar' : 'of GDP, constant prices'})</span></div>
      <DonutChart items={items} lang={lang} height={180} />
    </div>
  );
}

/** Latest month of the CPI (the current year is not averaged until it is complete). */
function CpiLatest({ unit }: { unit: DosmUnit }) {
  const { lang } = useAtlas();
  const c = unit.cpi_latest;
  if (!c) return null;
  const month = new Date(`${c.month}-01T00:00:00Z`).toLocaleDateString(lang === 'ms' ? 'ms-MY' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="stat mb">
      <div className="stat-label">{lang === 'ms' ? 'Inflasi terkini (tahun ke tahun)' : 'Latest inflation (year on year)'}</div>
      <div className="stat-value">{c.inflation_yoy === null ? '—' : `${c.inflation_yoy.toFixed(1)}%`}</div>
      <div className="stat-meta"><span>{month}</span><QualityBadge q="OFFICIAL" small /><span className="stat-src">DOSM · IHP {c.index.toFixed(1)} (2010 = 100)</span></div>
    </div>
  );
}

/** Crimes by police district (IPD) for a state, latest year. */
function IpdTable({ t: tb }: { t: NonNullable<DosmUnit['crime_ipd']> }) {
  const { lang } = useAtlas();
  const ms = lang === 'ms';
  return (
    <div className="mt">
      <div className="mini-title">{ms ? 'Ikut daerah polis (IPD)' : 'By police district (IPD)'} · {tb.year}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>IPD</th><th className="num">{ms ? 'Kekerasan' : 'Violent'}</th><th className="num">{ms ? 'Harta benda' : 'Property'}</th><th className="num">{ms ? 'Jumlah' : 'Total'}</th></tr></thead>
          <tbody>{tb.rows.map(([n, v, p]) => <tr key={n}><td>{n}</td><td className="num">{compact(v, lang)}</td><td className="num">{compact(p, lang)}</td><td className="num">{compact(v + p, lang)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** A district's largest crops by planted area (the district crop survey is 2017 only). */
function CropsTop({ t: tb }: { t: NonNullable<DosmUnit['crops_top']> }) {
  const { lang } = useAtlas();
  const ms = lang === 'ms';
  const name = (sp: string) => sp.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="mt">
      <div className="mini-title">{ms ? 'Tanaman utama ikut keluasan' : 'Main crops by planted area'} · {tb.year}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>{ms ? 'Tanaman' : 'Crop'}</th><th className="num">{ms ? 'Hektar' : 'Hectares'}</th><th className="num">{ms ? 'Tan' : 'Tonnes'}</th></tr></thead>
          <tbody>{tb.rows.map(([sp, a, p]) => <tr key={sp}><td>{name(sp)}</td><td className="num">{a === null ? '—' : compact(a, lang)}</td><td className="num">{p === null ? '—' : compact(p, lang)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Ethnic composition of citizens (DOSM groups), all from one year so the shares add up. */
function EthnicComposition({ s }: { s: (c: string) => Series | null }) {
  const { lang, year } = useAtlas();
  const first = latest(s(MY_ETH[0]), year);
  if (!first) return null;
  const names: Record<string, [string, string]> = {
    eth_bumi_malay_pct: ['Bumiputera Melayu', 'Bumiputera Malay'], eth_bumi_other_pct: ['Bumiputera lain', 'Other Bumiputera'],
    eth_chinese_pct: ['Cina', 'Chinese'], eth_indian_pct: ['India', 'Indian'], eth_other_citizen_pct: ['Lain-lain', 'Others'],
  };
  const items = MY_ETH.map((c) => {
    const v = s(c)?.points.find((p) => p.year === first.year)?.value;
    return v === undefined ? null : { name: `${names[c][lang === 'ms' ? 0 : 1]} · ${v.toFixed(1)}%`, value: v };
  }).filter((x): x is { name: string; value: number } => x !== null);
  return (
    <div>
      <div className="mini-title">{lang === 'ms' ? 'Komposisi etnik warganegara' : 'Ethnic composition of citizens'} · {first.year} <span className="muted">(% {lang === 'ms' ? 'warganegara' : 'of citizens'})</span></div>
      <DonutChart items={items} lang={lang} height={190} />
    </div>
  );
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
