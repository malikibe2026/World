import { useAtlas } from '../store/atlas';
import { formatDate } from '../utils/format';
import { t } from '../utils/i18n';
import type { Quality } from '../types';
import { QualityBadge } from './QualityBadge';

interface Props {
  sourceId: string;
  year?: number | string | null;
  quality?: Quality | null;
  url?: string;
  lastUpdated?: string | null;
  note?: string;
  live?: boolean;
}

/** Small provenance line under every number: source · reference year · quality · last updated. */
export function SourceNote({ sourceId, year, quality, url, lastUpdated, note, live }: Props) {
  const { catalog, lang } = useAtlas();
  const src = catalog?.sources[sourceId];
  return (
    <div className="source-note">
      {quality && <QualityBadge q={quality} small />}
      {year !== undefined && year !== null && <span>{t(lang, 'referenceYear')}: {year}</span>}
      <span>
        {t(lang, 'source')}:{' '}
        <a href={url || src?.url} target="_blank" rel="noreferrer">{src ? src.publisher.split(',')[0] : sourceId}</a>
        {src?.name && sourceId !== 'worldstat_derived' ? ` — ${src.name}` : ''}
        {live ? ` (${t(lang, 'liveData')})` : ''}
      </span>
      {lastUpdated && <span>{t(lang, 'lastUpdated')}: {formatDate(lastUpdated, lang)}</span>}
      {note && <span className="source-note-extra">{note}</span>}
    </div>
  );
}
