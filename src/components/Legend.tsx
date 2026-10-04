import { useState } from 'react';
import { useAtlas } from '../store/atlas';
import { useLayer } from '../hooks/useLayer';
import { formatValue } from '../utils/format';
import { indicatorName, t } from '../utils/i18n';
import { mapColors, type Classification } from '../maps/palette';
import { QualityBadge } from './QualityBadge';
import type { Indicator, Lang } from '../types';

function Classes({ c, ind, lang, noData }: { c: Classification; ind: Indicator; lang: Lang; noData: string }) {
  const labels = c.colors.map((_, i) => {
    const lo = i === 0 ? c.min : c.breaks[i - 1];
    const hi = i === c.colors.length - 1 ? c.max : c.breaks[i];
    return `${formatValue(lo, ind, lang, { compact: true })} – ${formatValue(hi, ind, lang, { compact: true })}`;
  });
  return (
    <ul className="legend-classes">
      {c.colors.map((col, i) => (
        <li key={i}><span className="sw" style={{ background: col }} />{labels[i]}</li>
      ))}
      <li><span className="sw sw-na" style={{ background: noData }} />{t(lang, 'legendNoData')}</li>
    </ul>
  );
}

/** Dynamic choropleth legend: indicator, year, quality, unit, classes and source. */
export function Legend() {
  const { lang, theme, catalog, selection , myDivision } = useAtlas();
  const L = useLayer();
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 700);
  if (!L.indicator || !catalog) return null;
  const ind = L.indicator;
  const src = catalog.sources[ind.source_id];
  const noData = mapColors(theme).noData;
  const myAdmin = selection?.countryId === 'MYS' ? L.admin.find((a) => a.level === (selection.level === 'admin2' ? 'admin2' : 'admin1')) : undefined;
  return (
    <div className="legend" aria-live="polite">
      <div className="legend-title">{indicatorName(lang, ind)}<button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Legend">{open ? '▾' : '▸'}</button></div>
      <div className="legend-meta">
        <span>{L.yearUsed}</span>
        {L.quality && <QualityBadge q={L.quality} small />}
        <span className="muted">{ind.unit}</span>
      </div>
      {L.loading && !L.classification && <div className="muted small">{t(lang, 'loading')}</div>}
      {L.error && <div className="fineprint warn">⚠ {t(lang, 'liveSourceFailed')}</div>}
      {open && L.classification && <Classes c={L.classification} ind={ind} lang={lang} noData={noData} />}
      {open && myAdmin?.classification && (
        <>
          <div className="legend-sub">🇲🇾 {myAdmin.level === 'admin1' ? (lang === 'ms' ? 'Negeri' : 'States') : (myDivision === 'parlimen' ? (lang === 'ms' ? 'Parlimen' : 'Constituencies') : lang === 'ms' ? 'Daerah' : 'Districts')} · DOSM · {myAdmin.year}</div>
          <Classes c={myAdmin.classification} ind={ind} lang={lang} noData={noData} />
        </>
      )}
      <div className="legend-src">
        {src?.publisher.split(',')[0]}{ind.original_source ? ` · ${ind.original_source}` : ''}{L.doc?.mode === 'live' ? ` · ${t(lang, 'liveData')}` : ''}
        {L.classification && <> · n={L.classification.count}</>}
      </div>
    </div>
  );
}
