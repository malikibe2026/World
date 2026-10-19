import { ESTIMATE_LAST_YEAR, useAtlas } from '../store/atlas';
import { useLayer } from '../hooks/useLayer';
import { t } from '../utils/i18n';
import { QualityBadge } from './QualityBadge';
import { shortSource } from './panel/KeyStats';

/**
 * The year of the data on the map, not just the slider's position. With projections off and the
 * slider at its "now" end, the map shows each source's latest published value — DOSM 2026 for
 * Malaysia, UN WPP 2024 for the world, the latest WB year for economic layers — so the chip says
 * "Latest" with that year and source, and keeps the world year beside it when the two differ.
 */
export function YearChip() {
  const { year, projection, selection, lang, catalog } = useAtlas();
  const L = useLayer();
  const atNow = !projection && year >= ESTIMATE_LAST_YEAR && !!L.indicator;
  const my = selection?.countryId === 'MYS' ? L.admin.find((a) => a.level === (selection.level === 'admin2' ? 'admin2' : 'admin1')) : undefined;
  const shown = atNow ? my?.year ?? L.yearUsed : year;
  // the source that sets the year: a derived layer (density) takes its inputs' source
  const source = atNow ? (my ? 'DOSM' : shortSource(L.indicator?.inputs_source_id ?? L.indicator?.source_id, catalog) || null) : null;
  const quality = year > ESTIMATE_LAST_YEAR ? 'PROJECTION' : atNow ? my?.quality ?? L.quality ?? 'ESTIMATE' : L.quality ?? 'ESTIMATE';
  const worldYear = atNow && my && L.yearUsed !== my.year ? L.yearUsed : null;
  const title = atNow
    ? t(lang, 'chipLatestTitle').replace('{slider}', String(year))
    : t(lang, 'chipYearTitle');
  return (
    <div className="year-chip" title={title}>
      <span className="year-chip-y">{shown}</span>
      {atNow && <span className="year-chip-tag">{t(lang, 'latest')}</span>}
      <QualityBadge q={quality} small />
      {source && <span className="year-chip-src">{source}</span>}
      {worldYear !== null && <span className="year-chip-sub">{t(lang, 'world')} {worldYear}</span>}
    </div>
  );
}
