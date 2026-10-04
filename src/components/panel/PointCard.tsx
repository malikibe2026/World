import { isParlimen } from '../../utils/geoRefs';
import { useAtlas, type PointSelection } from '../../store/atlas';
import { useAsync } from '../../hooks/useAsync';
import { commonsPage, commonsThumb, wikipediaSummary } from '../../services/wikidata';
import { formatCoord, full } from '../../utils/format';
import { t } from '../../utils/i18n';
import { QualityBadge } from '../QualityBadge';
import { Breadcrumb } from '../Breadcrumb';
import { useLocationBundle } from '../../hooks/useLocation';
import { KeyStats } from './KeyStats';

const KIND_LABEL: Record<PointSelection['kind'], { en: string; ms: string; emoji: string }> = {
  landmark: { en: 'Landmark', ms: 'Mercu tanda', emoji: '📍' },
  city: { en: 'City', ms: 'Bandar', emoji: '🏙️' },
  town: { en: 'Town', ms: 'Pekan', emoji: '🏘️' },
  village: { en: 'Village / settlement', ms: 'Kampung / penempatan', emoji: '🏡' },
  peak: { en: 'Mountain / peak', ms: 'Gunung / puncak', emoji: '🏔️' },
  airport: { en: 'Airport', ms: 'Lapangan terbang', emoji: '✈️' },
  port: { en: 'Port', ms: 'Pelabuhan', emoji: '⚓' },
  sea: { en: 'Sea / ocean', ms: 'Laut / lautan', emoji: '🌊' },
  physical: { en: 'Physical feature', ms: 'Ciri fizikal', emoji: '🗺️' },
  event: { en: 'Historical event', ms: 'Peristiwa sejarah', emoji: '📜' },
};

/**
 * Towns and villages have no statistics of their own: show the enclosing district's (or state's)
 * DOSM headline figures, and say plainly that they are not village figures.
 */
function ParentStats({ kind }: { kind: PointSelection['kind'] }) {
  const { selection, lang, setPoint } = useAtlas();
  const bundle = useLocationBundle(selection && (selection.level === 'admin1' || selection.level === 'admin2') ? selection : null);
  const b = bundle.data;
  if (!selection || !b) return null;
  const ms = lang === 'ms';
  const what = kind === 'village' ? (ms ? 'kampung' : 'village') : ms ? 'pekan' : 'town';
  const area = selection.level === 'admin2' ? (isParlimen(selection.id) ? (ms ? 'parlimen' : 'constituency') : ms ? 'daerah' : 'district') : ms ? 'negeri' : 'state';
  return (
    <section className="point-parent" aria-label={selection.name}>
      <h3>{ms ? `Statistik ${area}: ${selection.name}` : `${selection.name} (${area}) statistics`}</h3>
      <p className="fineprint">{ms ? `Statistik peringkat ${what} tidak tersedia daripada sumber rasmi terbuka. Angka di bawah ialah bagi ${area} ${selection.name}.` : `No open official statistics exist at ${what} level. Figures below are for the ${area} of ${selection.name}.`}</p>
      <KeyStats b={b} wb={null} pref="dosm" codes={['population', 'population_male', 'population_female', 'births', 'deaths']} />
      <button className="btn" onClick={() => setPoint(null)}>{ms ? `Profil penuh ${selection.name} →` : `Full profile of ${selection.name} →`}</button>
    </section>
  );
}

/** Card for a point on the map: landmark (Wikidata), city, peak, airport, port or history event. */
export function PointCard({ p }: { p: PointSelection }) {
  const { lang, catalog, setPoint } = useAtlas();
  const lm = p.landmark;
  const summary = useAsync(() => (lm?.wikipedia ? wikipediaSummary(lm.wikipedia) : Promise.resolve(null)), [lm?.wikipedia]);
  const k = KIND_LABEL[p.kind];
  const cats = lm ? lm.categories.map((c) => catalog?.landmarkCategories.find((x) => x.id === c)).filter(Boolean) : [];
  const props = p.props ?? {};
  return (
    <article className="point-card">
      <Breadcrumb />
      <button className="back" onClick={() => setPoint(null)}>← {t(lang, 'back')}</button>
      <div className="point-kind"><span aria-hidden="true">{cats[0]?.emoji ?? k.emoji}</span> {lang === 'ms' ? k.ms : k.en}</div>
      <h2 className="point-name">{p.name}</h2>
      {lm?.image && (
        <figure className="point-img">
          <img src={commonsThumb(lm.image, 640)} alt={p.name} loading="lazy" />
          <figcaption><a href={commonsPage(lm.image)} target="_blank" rel="noreferrer">{t(lang, 'imageCredit')}</a></figcaption>
        </figure>
      )}
      {lm?.description && <p className="point-desc">{lm.description}</p>}
      {summary.data?.extract && (
        <p className="point-summary">
          {summary.data.extract} <a href={summary.data.url} target="_blank" rel="noreferrer">{t(lang, 'readMore')} — Wikipedia (CC BY-SA)</a>
        </p>
      )}
      <dl className="kv">
        <div className="kv-row"><dt>{t(lang, 'coordinates')}</dt><dd>{formatCoord(p.lon, p.lat)}</dd></div>
        {cats.length > 0 && <div className="kv-row"><dt>{t(lang, 'category')}</dt><dd>{cats.map((c) => `${c!.emoji} ${lang === 'ms' ? c!.name_ms : c!.name_en}`).join(' · ')}</dd></div>}
        {lm?.inception && <div className="kv-row"><dt>{t(lang, 'inception')}</dt><dd>{lm.inception.startsWith('-') ? lm.inception.slice(0, 6) : lm.inception.slice(0, 4)}</dd></div>}
        {lm && <div className="kv-row"><dt>{t(lang, 'importance')}</dt><dd>{lang === 'ms' ? `Dirujuk dalam ${lm.sitelinks} edisi Wikimedia` : `Covered by ${lm.sitelinks} Wikimedia language editions`}</dd></div>}
        {p.kind === 'peak' && props.elev ? <div className="kv-row"><dt>{lang === 'ms' ? 'Ketinggian' : 'Elevation'}</dt><dd>{full(Number(props.elev), lang)} m <span className="muted">(Natural Earth)</span></dd></div> : null}
        {p.kind === 'city' && props.pop ? <div className="kv-row"><dt>{t(lang, 'population')}</dt><dd>~{full(Number(props.pop), lang)} <QualityBadge q="ESTIMATE" small /> <span className="muted">Natural Earth (compiled, urban agglomeration)</span></dd></div> : null}
        {p.kind === 'city' && props.admin1 ? <div className="kv-row"><dt>{lang === 'ms' ? 'Negeri / wilayah' : 'State / province'}</dt><dd>{String(props.admin1)}</dd></div> : null}
        {p.kind === 'village' && props.fcode ? <div className="kv-row"><dt>{lang === 'ms' ? 'Jenis' : 'Type'}</dt><dd>{props.fcode === 'PPLX' ? (lang === 'ms' ? 'Bahagian kawasan berpenghuni (cth. taman, seksyen)' : 'Section of a populated place') : lang === 'ms' ? 'Penempatan berpenghuni' : 'Populated place'} <span className="muted">(GeoNames {String(props.fcode)})</span></dd></div> : null}
        {p.kind === 'airport' && props.iata ? <div className="kv-row"><dt>IATA</dt><dd>{String(props.iata)} · {String(props.kind ?? '')}</dd></div> : null}
        {p.kind === 'event' && props.place ? <div className="kv-row"><dt>{t(lang, 'location')}</dt><dd>{String(props.place)} <span className="muted">({lang === 'ms' ? 'lokasi anggaran' : 'approximate location'})</span></dd></div> : null}
      </dl>
      {(p.kind === 'village' || p.kind === 'town') && p.countryId === 'MYS' && <ParentStats kind={p.kind} />}
      <div className="point-links">
        {lm && <a href={`https://www.wikidata.org/wiki/${lm.id}`} target="_blank" rel="noreferrer">Wikidata {lm.id}</a>}
        {lm?.wikipedia && <a href={lm.wikipedia} target="_blank" rel="noreferrer">Wikipedia</a>}
        <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`} target="_blank" rel="noreferrer">OpenStreetMap</a>
      </div>
      <p className="fineprint">{lm ? t(lang, 'wikidataNote') : p.kind === 'town' || p.kind === 'village' ? (lang === 'ms' ? 'Titik daripada GeoNames (CC BY 4.0).' : 'Point from GeoNames (CC BY 4.0).') : p.kind === 'event' ? (lang === 'ms' ? 'Lokasi anggaran daripada garis masa kurasi.' : 'Approximate location from the curated timeline.') : lang === 'ms' ? 'Titik daripada Natural Earth (domain awam).' : 'Point from Natural Earth (public domain).'}</p>
    </article>
  );
}
