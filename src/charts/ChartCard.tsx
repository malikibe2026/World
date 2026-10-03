import { useState, type ReactNode } from 'react';
import { useAtlas } from '../store/atlas';
import { t } from '../utils/i18n';

export interface TableData { columns: string[]; rows: Array<Array<string | number | null>> }

/** Chart card with a title, unit/source subtitle and a table view (every chart has a table twin). */
export function ChartCard({ title, subtitle, children, table, footer, actions }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: TableData; footer?: ReactNode; actions?: ReactNode }) {
  const lang = useAtlas((s) => s.lang);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="chart-card">
      <header className="chart-card-head">
        <div>
          <h4>{title}</h4>
          {subtitle && <div className="chart-card-sub">{subtitle}</div>}
        </div>
        <div className="chart-card-actions">
          {actions}
          {table && (
            <div className="seg seg-xs" role="tablist" aria-label={`${title} view`}>
              <button role="tab" aria-selected={view === 'chart'} className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>{t(lang, 'chart')}</button>
              <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>{t(lang, 'table')}</button>
            </div>
          )}
        </div>
      </header>
      {view === 'chart' || !table ? children : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : ''}>{v === null ? '—' : typeof v === 'number' ? v.toLocaleString(lang === 'ms' ? 'ms-MY' : 'en-GB', { maximumFractionDigits: 3 }) : v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer && <footer className="chart-card-foot">{footer}</footer>}
    </section>
  );
}
