import { useAtlas } from '../store/atlas';
import { t } from '../utils/i18n';

export function NotAvailable({ reason, compact }: { reason?: string; compact?: boolean }) {
  const lang = useAtlas((s) => s.lang);
  return (
    <div className={`na ${compact ? 'na-compact' : ''}`} role="note">
      <span className="na-label">{t(lang, 'dataNotAvailable')}</span>
      {reason && <span className="na-reason">{reason}</span>}
    </div>
  );
}
