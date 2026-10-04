import { useAtlas, type Basemap, type OverlayKey } from '../store/atlas';
import { indicatorName, t, type I18nKey } from '../utils/i18n';
import { SearchBox } from './SearchBox';
import { TimeMachine } from './TimeMachine';
import { streetBasemap, satelliteBasemap, terrainBasemap } from '../maps/basemaps';

const LAYER_GROUPS: Array<{ key: I18nKey; codes: string[] }> = [
  { key: 'population', codes: ['population', 'density', 'population_male', 'population_female', 'sex_ratio', 'median_age', 'pop_0_14_pct', 'pop_65_plus_pct', 'growth_rate'] },
  { key: 'vitalStatistics', codes: ['cbr', 'cdr', 'tfr', 'e0', 'imr'] },
  { key: 'economicIntelligence', codes: ['gdp', 'gdp_per_capita', 'gdp_growth', 'inflation', 'unemployment'] },
  { key: 'urban', codes: ['urban_pct'] },
  { key: 'tourism', codes: ['tourism_arrivals'] },
  { key: 'climate', codes: ['precipitation'] },
];

const OVERLAYS: Array<{ k: OverlayKey; en: string; ms: string }> = [
  { k: 'admin1', en: 'State / province boundaries', ms: 'Sempadan negeri / wilayah' },
  { k: 'admin2', en: 'District boundaries', ms: 'Sempadan daerah' },
  { k: 'capitals', en: 'Capitals', ms: 'Ibu negara' },
  { k: 'cities', en: 'Major cities', ms: 'Bandar utama' },
  { k: 'villages', en: 'Villages & settlements (Malaysia, zoom in)', ms: 'Kampung & penempatan (Malaysia, zum dekat)' },
  { k: 'rivers', en: 'Rivers', ms: 'Sungai' },
  { k: 'lakes', en: 'Lakes', ms: 'Tasik' },
  { k: 'peaks', en: 'Mountains', ms: 'Gunung' },
  { k: 'physical', en: 'Islands & landforms', ms: 'Pulau & bentuk muka bumi' },
  { k: 'seas', en: 'Oceans & seas', ms: 'Lautan & laut' },
  { k: 'roads', en: 'Main roads', ms: 'Jalan utama' },
  { k: 'urban', en: 'Metropolitan areas', ms: 'Kawasan metropolitan' },
  { k: 'airports', en: 'Airports', ms: 'Lapangan terbang' },
  { k: 'ports', en: 'Ports', ms: 'Pelabuhan' },
  { k: 'landmarks', en: 'Landmarks (Wikidata)', ms: 'Mercu tanda (Wikidata)' },
  { k: 'elevation', en: 'Elevation map (hillshade)', ms: 'Peta ketinggian (bayang bukit)' },
];

export function Sidebar() {
  const { lang, catalog, layer, setLayer, basemap, setBasemap, globe, setGlobe, overlays, toggleOverlay, regionFilter, setRegionFilter } = useAtlas();
  if (!catalog) return null;
  const terms: Record<Basemap, string> = { statistical: '', street: streetBasemap('light').terms, satellite: satelliteBasemap().terms, terrain: terrainBasemap().terms };
  return (
    <aside className="sidebar" aria-label={t(lang, 'layers')}>
      <div className="sb-search"><SearchBox /></div>

      <section className="sb-sec">
        <h3>{t(lang, 'indicatorLayer')}</h3>
        <button className={`layer-opt ${!layer ? 'on' : ''}`} onClick={() => setLayer(null)}>{t(lang, 'none')}</button>
        {LAYER_GROUPS.map((g) => (
          <div key={g.key} className="layer-group">
            <div className="layer-group-title">{t(lang, g.key)}</div>
            {g.codes.filter((c) => catalog.indicators[c]).map((c) => {
              const ind = catalog.indicators[c];
              return (
                <button key={c} className={`layer-opt ${layer === c ? 'on' : ''}`} onClick={() => setLayer(c)} title={`${ind.unit} · ${ind.source_id === 'wb_wdi' ? 'World Bank WDI' : ind.source_id === 'un_wpp_2024' || ind.inputs_source_id === 'un_wpp_2024' ? 'UN WPP 2024' : ind.source_id}`}>
                  <span>{indicatorName(lang, ind)}</span>
                  <span className="layer-src">{ind.source_id === 'wb_wdi' ? 'WB' : 'UN'}</span>
                </button>
              );
            })}
          </div>
        ))}
        <button className={`layer-opt ${overlays.elevation ? 'on' : ''}`} onClick={() => toggleOverlay('elevation')}>
          <span>{lang === 'ms' ? 'Peta ketinggian' : 'Elevation map'}</span><span className="layer-src">AWS</span>
        </button>
      </section>

      <section className="sb-sec">
        <h3>{t(lang, 'timeMachine')}</h3>
        <TimeMachine />
      </section>

      <section className="sb-sec">
        <h3>{t(lang, 'filters')}</h3>
        <label className="field">
          <span>{t(lang, 'region')}</span>
          <select value={regionFilter ?? ''} onChange={(e) => setRegionFilter(e.target.value || null)}>
            <option value="">{t(lang, 'allRegions')}</option>
            {catalog.regionList.filter((r) => r.level === 'continent').map((r) => (
              <option key={r.id} value={r.id}>{lang === 'ms' ? r.name_ms ?? r.name : r.name}</option>
            ))}
            <optgroup label={t(lang, 'subregion')}>
              {catalog.subregions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>
          </select>
        </label>
      </section>

      <section className="sb-sec">
        <h3>{t(lang, 'basemap')}</h3>
        <div className="seg seg-wrap" role="radiogroup" aria-label={t(lang, 'basemap')}>
          {(['statistical', 'street', 'satellite', 'terrain'] as Basemap[]).map((b) => (
            <button key={b} role="radio" aria-checked={basemap === b} className={basemap === b ? 'on' : ''} onClick={() => setBasemap(b)}>{t(lang, b)}</button>
          ))}
        </div>
        {basemap !== 'statistical' && <p className="fineprint">{lang === 'ms' ? 'Jubin pihak ketiga — tertakluk kepada ' : 'Third-party tiles — subject to '}<a href={terms[basemap]} target="_blank" rel="noreferrer">{lang === 'ms' ? 'terma penyedia' : 'provider terms'}</a>.</p>}
        <div className="seg mt" role="radiogroup" aria-label="Projection">
          <button role="radio" aria-checked={globe} className={globe ? 'on' : ''} onClick={() => setGlobe(true)}>🌐 {t(lang, 'globe')}</button>
          <button role="radio" aria-checked={!globe} className={!globe ? 'on' : ''} onClick={() => setGlobe(false)}>▭ {t(lang, 'flat')}</button>
        </div>
      </section>

      <section className="sb-sec">
        <h3>{t(lang, 'overlays')}</h3>
        <div className="checks">
          {OVERLAYS.filter((o) => o.k !== 'elevation').map((o) => (
            <label key={o.k} className="check">
              <input type="checkbox" checked={overlays[o.k]} onChange={() => toggleOverlay(o.k)} />
              <span>{lang === 'ms' ? o.ms : o.en}</span>
            </label>
          ))}
        </div>
      </section>
    </aside>
  );
}
