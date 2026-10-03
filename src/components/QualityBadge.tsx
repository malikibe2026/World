import type { Quality } from '../types';
import { useAtlas } from '../store/atlas';
import { QUALITY_LABEL, t } from '../utils/i18n';

const ICON: Record<Quality, string> = { OFFICIAL: '●', ESTIMATE: '◐', PROJECTION: '◌', DERIVED: '◇' };
const TITLE: Record<Quality, { en: string; ms: string }> = {
  OFFICIAL: { en: 'Published official statistic', ms: 'Statistik rasmi diterbitkan' },
  ESTIMATE: { en: 'Official or modelled estimate', ms: 'Anggaran rasmi atau model' },
  PROJECTION: { en: 'Official projection (not an observation)', ms: 'Unjuran rasmi (bukan cerapan)' },
  DERIVED: { en: 'Computed by WorldStat from official inputs', ms: 'Dikira oleh WorldStat daripada input rasmi' },
};

/** OFFICIAL / ESTIMATE / PROJECTION / DERIVED — icon + label, never colour alone. */
export function QualityBadge({ q, small }: { q: Quality; small?: boolean }) {
  const lang = useAtlas((s) => s.lang);
  return (
    <span className={`qbadge q-${q.toLowerCase()} ${small ? 'qbadge-sm' : ''}`} title={TITLE[q][lang]}>
      <span aria-hidden="true">{ICON[q]}</span> {t(lang, QUALITY_LABEL[q] as never)}
    </span>
  );
}
