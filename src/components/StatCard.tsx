import type { Indicator, Quality } from '../types';
import { useAtlas } from '../store/atlas';
import { formatValue } from '../utils/format';
import { indicatorName, t } from '../utils/i18n';
import { QualityBadge } from './QualityBadge';

interface Props {
  ind?: Indicator;
  label?: string;
  value: number | null | undefined;
  year?: number | null;
  quality?: Quality | null;
  sourceLabel?: string;
  hint?: string;
  big?: boolean;
  delta?: { value: number; label: string; goodWhenUp?: boolean | null } | null;
}

const showUnit = (u: string) => !['persons', 'current US$', 'annual %'].includes(u) && !u.startsWith('% of') && !u.startsWith('births per') && !u.startsWith('deaths per');

/** Stat tile: label · value · reference year · quality · source. Missing values say so. */
export function StatCard({ ind, label, value, year, quality, sourceLabel, hint, big, delta }: Props) {
  const lang = useAtlas((s) => s.lang);
  const name = label ?? indicatorName(lang, ind);
  const missing = value === null || value === undefined || !Number.isFinite(value);
  return (
    <div className={`stat ${big ? 'stat-big' : ''} ${missing ? 'stat-missing' : ''}`} title={hint}>
      <div className="stat-label">{name}</div>
      {!missing && ind && showUnit(ind.unit) && <div className="stat-unit">{ind.unit}</div>}
      {missing ? (
        <div className="stat-na">{t(lang, 'dataNotAvailable')}</div>
      ) : (
        <div className="stat-value">{formatValue(value!, ind, lang, { compact: true })}</div>
      )}
      {!missing && delta && (
        <div className={`stat-delta ${delta.goodWhenUp === null || delta.goodWhenUp === undefined ? '' : (delta.value >= 0) === delta.goodWhenUp ? 'up-good' : 'up-bad'}`}>
          {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}% {delta.label}
        </div>
      )}
      <div className="stat-meta">
        {!missing && year ? <span>{year}</span> : null}
        {!missing && quality ? <QualityBadge q={quality} small /> : null}
        {!missing && sourceLabel ? <span className="stat-src">{sourceLabel}</span> : null}
      </div>
    </div>
  );
}
