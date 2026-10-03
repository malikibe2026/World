import { useEffect } from 'react';
import { ESTIMATE_LAST_YEAR, MAX_YEAR, MIN_YEAR, useAtlas } from '../store/atlas';
import { t } from '../utils/i18n';
import { QualityBadge } from './QualityBadge';

/** 1950 ━━━━━━━━━●━━━━ 2024 (+ official projections to 2100, clearly separated). */
export function TimeMachine() {
  const { year, setYear, projection, setProjection, playing, setPlaying, lang } = useAtlas();
  const max = projection ? MAX_YEAR : ESTIMATE_LAST_YEAR;

  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => {
      const s = useAtlas.getState();
      const top = s.projection ? MAX_YEAR : ESTIMATE_LAST_YEAR;
      if (s.year >= top) { s.setPlaying(false); return; }
      s.setYear(s.year + (s.year < 1960 ? 2 : 1));
    }, 420);
    return () => clearInterval(h);
  }, [playing]);

  const estPct = ((ESTIMATE_LAST_YEAR - MIN_YEAR) / (max - MIN_YEAR)) * 100;
  return (
    <div className="tm">
      <div className="tm-head">
        <span className="tm-year">{year}</span>
        <QualityBadge q={year > ESTIMATE_LAST_YEAR ? 'PROJECTION' : 'ESTIMATE'} small />
        <button className="btn btn-sm" onClick={() => { if (!playing && year >= max) setYear(MIN_YEAR); setPlaying(!playing); }} aria-pressed={playing}>
          {playing ? `❚❚ ${t(lang, 'pause')}` : `▶ ${t(lang, 'play')}`}
        </button>
      </div>
      <div className="tm-track" style={{ ['--est' as string]: `${estPct}%` }}>
        <input type="range" min={MIN_YEAR} max={max} step={1} value={Math.min(year, max)} onChange={(e) => setYear(Number(e.target.value))} aria-label={t(lang, 'year')} aria-valuetext={`${year}${year > ESTIMATE_LAST_YEAR ? ' (projection)' : ''}`} />
      </div>
      <div className="tm-scale"><span>{MIN_YEAR}</span>{projection && <span className="tm-split" style={{ left: `${estPct}%` }}>{ESTIMATE_LAST_YEAR}</span>}<span>{max}</span></div>
      <label className="check">
        <input type="checkbox" checked={projection} onChange={(e) => setProjection(e.target.checked)} />
        <span>{t(lang, 'projectionMode')} <span className="muted">(UN WPP 2024, {lang === 'ms' ? 'varian sederhana' : 'medium variant'})</span></span>
      </label>
    </div>
  );
}
