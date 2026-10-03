import type { AdminUnit, CountryProfile } from '../../types';
import { useAtlas } from '../../store/atlas';
import { formatCoord, full } from '../../utils/format';
import { t } from '../../utils/i18n';
import { NotAvailable } from '../NotAvailable';
import { SourceNote } from '../SourceNote';
import { latest } from '../../hooks/resolve';
import type { WbState } from '../../hooks/useLocation';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const list = (xs: string[] | undefined, lang: 'ms' | 'en') => (xs && xs.length ? xs.join(', ') : <span className="muted">{t(lang, 'dataNotAvailable')}</span>);

/** Geographic profile: names, type, hierarchy, area, coordinates, time zone, physical features. */
export function GeographyProfile({ country, admin, wb }: { country: CountryProfile | null; admin: AdminUnit | null; wb?: WbState | null }) {
  const { lang, catalog, year } = useAtlas();
  const p = admin ?? country;
  if (!p) return <NotAvailable />;
  const label = admin ? admin.label : country!.label;
  const typeLabel = admin ? admin.type ?? (admin.level === 'admin1' ? 'Admin-1' : 'Admin-2') : country!.type;
  const precip = latest(wb?.series.precipitation, year);
  const forest = latest(wb?.series.forest_pct, year);
  const land = latest(wb?.series.land_area, year);
  const rents = latest(wb?.series.natural_resource_rents, year);
  const seaNames = p.seas?.map((s) => s.name);
  return (
    <div>
      <dl className="kv">
        {country && !admin && <Row k={t(lang, 'officialName')}>{country.name_official}{country.name_local?.length ? <span className="muted"> · {country.name_local.filter((n) => n !== country.name_official).slice(0, 2).join(' · ')}</span> : null}</Row>}
        {admin?.name_local && admin.name_local !== admin.name && <Row k={t(lang, 'officialName')}>{admin.name_local}</Row>}
        <Row k={t(lang, 'areaType')}>{typeLabel}</Row>
        {country && <Row k={t(lang, 'country')}>{country.flag} {country.name}</Row>}
        {country && <Row k={t(lang, 'continent')}>{country.continent ?? '—'}{country.subregion ? ` · ${country.subregion}` : ''}</Row>}
        {country && !admin && <Row k={t(lang, 'capital')}>{country.capital.length ? country.capital.join(', ') : '—'}</Row>}
        <Row k={t(lang, 'area')}>
          {p.area_geometry_km2 ? `${full(p.area_geometry_km2, lang)} km²` : '—'} <span className="muted">({t(lang, 'derived').toLowerCase()})</span>
          {!admin && land ? <span className="muted"> · {lang === 'ms' ? 'tanah' : 'land'} {full(land.value, lang)} km² (FAO, {land.year})</span> : null}
        </Row>
        <Row k={t(lang, 'coordinates')}>{formatCoord(label[0], label[1])}</Row>
        {country && <Row k={t(lang, 'timezone')}>{country.timezones.length ? [...new Set(country.timezones.map((z) => `UTC${z.utc}`))].join(', ') : '—'}</Row>}
        <Row k={t(lang, 'elevation')}>{p.highest_listed_peak ? `${p.highest_listed_peak.name} · ${full(p.highest_listed_peak.elev, lang)} m` : <span className="muted">{t(lang, 'dataNotAvailable')}</span>}</Row>
        <Row k={t(lang, 'mountains')}>{list(p.peaks?.slice(0, 5).map((x) => (x.elev ? `${x.name} (${full(x.elev, lang)} m)` : x.name)), lang)}</Row>
        <Row k={t(lang, 'rivers')}>{list(p.rivers?.slice(0, 6).map((x) => x.name), lang)}</Row>
        <Row k={t(lang, 'lakes')}>{list(p.lakes?.slice(0, 5).map((x) => x.name), lang)}</Row>
        <Row k={t(lang, 'islands')}>{list(p.islands?.slice(0, 6).map((x) => x.name), lang)}</Row>
        <Row k={t(lang, 'seas')}>{list(seaNames?.slice(0, 6), lang)}</Row>
        <Row k={t(lang, 'landforms')}>{list(p.landforms?.slice(0, 6).map((x) => x.name), lang)}</Row>
        <Row k={t(lang, 'climate')}>
          {precip ? <>{lang === 'ms' ? 'Purata kerpasan' : 'Average precipitation'} {full(precip.value, lang)} mm/{lang === 'ms' ? 'tahun' : 'yr'} <span className="muted">(FAO via World Bank, {precip.year})</span></> : <span className="muted">{t(lang, 'dataNotAvailable')}</span>}
        </Row>
        <Row k={t(lang, 'naturalResources')}>
          {rents || forest ? (
            <>
              {rents && <>{lang === 'ms' ? 'Sewa sumber asli' : 'Natural resource rents'} {rents.value.toFixed(1)}% {lang === 'ms' ? 'KDNK' : 'of GDP'} ({rents.year})</>}
              {rents && forest ? ' · ' : ''}
              {forest && <>{lang === 'ms' ? 'Hutan' : 'Forest'} {forest.value.toFixed(1)}% {lang === 'ms' ? 'tanah' : 'of land'} ({forest.year})</>}
              <span className="muted"> (World Bank)</span>
            </>
          ) : <span className="muted">{t(lang, 'dataNotAvailable')}</span>}
        </Row>
        {country && !admin && (
          <>
            <Row k={t(lang, 'languages')}>{list(country.languages, lang)}</Row>
            <Row k={t(lang, 'currency')}>{country.currencies.length ? country.currencies.map((c) => `${c.name} (${c.code})`).join(', ') : '—'}</Row>
            <Row k={t(lang, 'callingCode')}>{country.calling_code || '—'} · {country.tld.join(' ')}</Row>
            <Row k={t(lang, 'landlocked')}>{country.landlocked === null ? '—' : country.landlocked ? t(lang, 'yes') : t(lang, 'no')}</Row>
            <Row k={t(lang, 'neighbours')}>{country.borders.length ? country.borders.map((b) => catalog?.countries[b]?.name ?? b).join(', ') : '—'}</Row>
          </>
        )}
        {p.airports?.length ? <Row k={t(lang, 'airports')}>{p.airports.slice(0, 5).map((a) => (a.iata ? `${a.name} (${a.iata})` : a.name)).join(', ')}</Row> : null}
        {p.ports?.length ? <Row k={t(lang, 'ports')}>{p.ports.slice(0, 6).join(', ')}</Row> : null}
        {admin?.towns?.length ? <Row k={t(lang, 'towns')}>{admin.towns.slice(0, 24).join(', ')}{admin.towns.length > 24 ? ' …' : ''}</Row> : null}
      </dl>
      <SourceNote sourceId="natural_earth" note={lang === 'ms' ? 'Ciri fizikal diterbitkan daripada geometri Natural Earth (puncak/sungai yang tersenarai sahaja); bandar & zon masa: Natural Earth, IANA.' : 'Physical features derived from Natural Earth geometry (listed peaks/rivers only); towns: GeoNames; time zones: IANA.'} />
    </div>
  );
}
