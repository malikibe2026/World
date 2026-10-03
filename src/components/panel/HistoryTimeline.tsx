import { useMemo, useState } from 'react';
import type { HistoryDoc, HistoryEvent } from '../../types';
import { useAtlas } from '../../store/atlas';
import { t } from '../../utils/i18n';
import { yearLabel } from '../../utils/format';
import { NotAvailable } from '../NotAvailable';

function dateLabel(e: HistoryEvent, lang: 'ms' | 'en') {
  if (e.precision === 'day' && e.date) return new Intl.DateTimeFormat(lang === 'ms' ? 'ms-MY' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(e.date));
  const y = yearLabel(e.year, lang);
  if (e.precision === 'circa') return `${t(lang, 'circa')} ${y}`;
  if (e.precision === 'century') return lang === 'ms' ? `abad ke-${Math.floor(e.year / 100) + 1}` : `${Math.floor(e.year / 100) + 1}th century`;
  return e.end_year ? `${y}–${e.end_year}` : y;
}

/** History explorer: eras → events, contested events flagged with their interpretations. */
export function HistoryTimeline({ doc, events, mode, compact, loading, error }: { doc: HistoryDoc | null; events: HistoryEvent[]; mode: 'curated' | 'wikidata'; compact?: boolean; loading?: boolean; error?: Error | null }) {
  const { lang, setPoint } = useAtlas();
  const [era, setEra] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const xs = era ? events.filter((e) => e.era === era) : events;
    return compact ? xs.slice(-6) : xs;
  }, [events, era, compact]);
  if (loading && !events.length) return <div className="muted small">{t(lang, 'loading')}</div>;
  if (error && !events.length) return <NotAvailable compact reason={`${t(lang, 'liveSourceFailed')} (Wikidata)`} />;
  if (!events.length) return <NotAvailable compact />;
  return (
    <div className={`timeline ${compact ? 'timeline-compact' : ''}`}>
      {doc && !compact && (
        <div className="era-strip" role="tablist">
          <button className={`era ${!era ? 'on' : ''}`} onClick={() => setEra(null)}>{lang === 'ms' ? 'Semua' : 'All'}</button>
          {doc.eras.map((e) => (
            <button key={e.id} className={`era ${era === e.id ? 'on' : ''}`} onClick={() => setEra(e.id)} role="tab" aria-selected={era === e.id}>
              {lang === 'ms' ? e.name_ms : e.name_en}
            </button>
          ))}
        </div>
      )}
      <ol className="tl">
        {shown.map((e) => (
          <li key={e.id} className={`tl-item ${e.contested ? 'tl-contested' : ''}`}>
            <div className="tl-date">{dateLabel(e, lang)}</div>
            <div className="tl-body">
              <button className="tl-title" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                {lang === 'ms' ? e.title_ms : e.title_en}
                {e.contested && <span className="tl-flag" title={t(lang, 'contested')}>⚖︎ {t(lang, 'contested')}</span>}
              </button>
              {(open === e.id || !compact) && (
                <div className="tl-detail">
                  <p>{lang === 'ms' ? e.summary_ms : e.summary_en}</p>
                  {e.contested && (e.interpretations_en?.length || e.interpretations_ms?.length) ? (
                    <ul className="tl-interp">
                      {(lang === 'ms' ? e.interpretations_ms : e.interpretations_en)?.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  ) : null}
                  <div className="tl-links">
                    {e.coord && <button className="link" onClick={() => setPoint({ kind: 'event', name: lang === 'ms' ? e.title_ms : e.title_en, lon: e.coord![0], lat: e.coord![1], props: { place: e.place, year: e.year } })}>📍 {t(lang, 'showOnMap')}{e.place ? ` — ${e.place}` : ''}</button>}
                    {e.refs.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer">{r.title}</a>)}
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="fineprint">
        {mode === 'curated'
          ? (lang === 'ms' ? doc?.editor_note_ms : doc?.editor_note_en)
          : lang === 'ms' ? 'Garis masa automatik daripada Wikidata (perang, pertempuran, perjanjian, bencana yang bertarikh). Sumber orang ramai — semak rujukan.' : 'Automatic timeline from Wikidata (dated wars, battles, treaties, disasters). Crowd-sourced — check the references.'}
      </p>
    </div>
  );
}
