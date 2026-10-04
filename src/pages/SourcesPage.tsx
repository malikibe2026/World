import { useMemo, useState } from 'react';
import { useAtlas } from '../store/atlas';
import { useAsync } from '../hooks/useAsync';
import { loadOptional } from '../services/http';
import { Modal } from '../components/Modal';
import { formatDate } from '../utils/format';
import { indicatorName, t } from '../utils/i18n';
import type { QualityIssue } from '../types';
import { QualityBadge } from '../components/QualityBadge';

/** Data sources & provenance: registry, indicator dictionary, dataset versions, DOSM catalogue. */
export function SourcesPage() {
  const { lang, catalog, setModal } = useAtlas();
  const [tab, setTab] = useState<'sources' | 'indicators' | 'datasets' | 'dosm'>('sources');
  if (!catalog) return null;
  const m = catalog.manifest;
  return (
    <Modal title={t(lang, 'sourcesTitle')} onClose={() => setModal(null)} wide>
      <p className="fineprint mb">{lang === 'ms'
        ? 'WorldStat Atlas ialah projek bebas dan bukan laman rasmi mana-mana agensi. Penggunaan data DOSM, UN, World Bank dan lain-lain tidak bermaksud agensi tersebut menyokong atau mengesahkan laman ini.'
        : 'WorldStat Atlas is an independent project, not an official site of any agency. Use of DOSM, UN, World Bank or other data does not imply that those agencies endorse this site.'}</p>
      <div className="seg mb" role="tablist">
        {(['sources', 'indicators', 'datasets', 'dosm'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {k === 'sources' ? t(lang, 'sources') : k === 'indicators' ? (lang === 'ms' ? 'Kamus indikator' : 'Indicator dictionary') : k === 'datasets' ? (lang === 'ms' ? 'Versi dataset' : 'Dataset versions') : 'OpenDOSM'}
          </button>
        ))}
      </div>
      {tab === 'sources' && (
        <div className="cards">
          {Object.values(catalog.sources).map((s) => (
            <article key={s.id} className="src-card">
              <h4><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></h4>
              <div className="muted">{s.publisher}</div>
              <div className="src-tags">
                <span className="tag">{s.license}</span>
                <span className="tag">{s.access === 'live' ? (lang === 'ms' ? 'API langsung' : 'live API') : s.access === 'pipeline' ? 'pipeline' : 'snapshot'}</span>
                {s.default_quality && <QualityBadge q={s.default_quality} small />}
              </div>
              {s.notes && <p className="small">{s.notes}</p>}
              {s.citation && <p className="fineprint">{s.citation}</p>}
            </article>
          ))}
        </div>
      )}
      {tab === 'indicators' && (
        <div className="table-wrap tall">
          <table className="data-table">
            <thead><tr><th>Code</th><th>{t(lang, 'indicator')}</th><th>{t(lang, 'unit')}</th><th>{t(lang, 'source')}</th><th>{t(lang, 'quality')}</th><th>{t(lang, 'methodology')}</th></tr></thead>
            <tbody>
              {catalog.indicatorList.map((i) => (
                <tr key={i.code}>
                  <td><code>{i.code}</code>{i.wb_code ? <div className="fineprint">{i.wb_code}</div> : null}</td>
                  <td>{indicatorName(lang, i)}</td>
                  <td>{i.unit}</td>
                  <td>{catalog.sources[i.source_id]?.publisher.split(',')[0]}{i.original_source ? <div className="fineprint">{i.original_source}</div> : null}</td>
                  <td><QualityBadge q={i.quality} small /></td>
                  <td className="small">{[i.formula, i.reference ? `ref: ${i.reference}` : null, i.notes].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'datasets' && (
        <div>
          <p className="muted">{lang === 'ms' ? 'Snapshot dibina' : 'Snapshot built'}: {formatDate(m.snapshot_built_at, lang)} · run <code>{m.run_id}</code></p>
          <ul className="ds-list">
            {m.datasets.map((d, i) => (
              <li key={i}>
                <b>{catalog.sources[d.source_id]?.name ?? d.source_id}</b> {d.version ? <span className="muted">— {String(d.version)}</span> : null} {d.mode ? <span className="tag">{String(d.mode)}</span> : null}
                {Array.isArray(d.files) && <div className="fineprint">{(d.files as Array<{ file: string; sha256: string }>).map((f) => `${f.file} · sha256 ${f.sha256?.slice(0, 12)}…`).join(' | ')}</div>}
              </li>
            ))}
          </ul>
          <PipelineLog />
        </div>
      )}
      {tab === 'dosm' && (
        <div>
          {!catalog.manifest.available.dosm_snapshot && <p className="fineprint warn">⚠ {t(lang, 'dosmNotLoaded')}</p>}
          {catalog.dosmCatalogue ? (
            <div className="table-wrap tall">
              <table className="data-table">
                <thead><tr><th>Dataset</th><th>{lang === 'ms' ? 'Tajuk' : 'Title'}</th><th>{lang === 'ms' ? 'Liputan' : 'Coverage'}</th><th>{t(lang, 'lastUpdated')}</th><th>{lang === 'ms' ? 'Kemas kini seterusnya' : 'Next update'}</th></tr></thead>
                <tbody>
                  {Object.entries(catalog.dosmCatalogue).map(([id, d]) => (
                    <tr key={id}>
                      <td><a href={`https://open.dosm.gov.my/data-catalogue/${id}`} target="_blank" rel="noreferrer"><code>{id}</code></a></td>
                      <td>{lang === 'ms' ? d.title_ms : d.title_en}<div className="fineprint">{d.geography?.join(', ')} · {d.frequency}</div></td>
                      <td>{d.dataset_begin}–{d.dataset_end}</td>
                      <td>{d.last_updated}</td>
                      <td>{d.next_update}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">{t(lang, 'dataNotAvailable')}</p>}
        </div>
      )}
    </Modal>
  );
}

function PipelineLog() {
  const { lang } = useAtlas();
  const log = useAsync(() => loadOptional<{ run_id: string; counts: Record<string, number>; steps: Record<string, { status: string }>; errors: Array<{ step: string; message: string; context?: Record<string, unknown> }> }>('logs/latest.json'), []);
  if (!log.data) return null;
  return (
    <div className="mt">
      <h4>{t(lang, 'pipelineRun')} <code>{log.data.run_id}</code></h4>
      <div className="chips">
        {Object.entries(log.data.steps).map(([k, v]) => <span key={k} className={`chip ${v.status === 'ok' ? '' : 'chip-warn'}`}>{k}: {v.status}</span>)}
      </div>
      {log.data.errors.length > 0 && (
        <details className="mt">
          <summary>{log.data.errors.length} {lang === 'ms' ? 'ralat diimport (lihat log)' : 'import errors (see log)'}</summary>
          <ul className="small">{log.data.errors.slice(0, 30).map((e, i) => <li key={i}><code>{e.step}</code> {e.message} {e.context?.dataset ? `· ${String(e.context.dataset)}` : ''}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Data quality report produced by the pipeline's Data Quality Engine. */
export function QualityPage() {
  const { lang, setModal, catalog } = useAtlas();
  const rep = useAsync(() => loadOptional<{ generated_at: string; checks: string[]; summary: Record<string, Record<string, number>>; issues: QualityIssue[]; issues_total: number }>('quality/report.json'), []);
  const [check, setCheck] = useState<string | null>(null);
  const issues = useMemo(() => (rep.data?.issues ?? []).filter((i) => !check || i.check === check), [rep.data, check]);
  return (
    <Modal title={t(lang, 'qualityReport')} onClose={() => setModal(null)} wide>
      {!rep.data ? <p className="muted">{t(lang, 'loading')}</p> : (
        <>
          <p className="muted">{formatDate(rep.data.generated_at, lang)} · {rep.data.issues_total} {t(lang, 'issues').toLowerCase()}</p>
          <div className="qc-grid">
            {rep.data.checks.map((c) => {
              const s = rep.data!.summary[c] ?? {};
              const n = Object.values(s).reduce((a, b) => a + b, 0);
              return (
                <button key={c} className={`qc ${check === c ? 'on' : ''}`} onClick={() => setCheck(check === c ? null : c)}>
                  <span className="qc-name">{c.replace('_', ' ')}</span>
                  <span className="qc-n">{n || '✓'}</span>
                  <span className="qc-sev">{n ? Object.entries(s).map(([k, v]) => `${v} ${k}`).join(' · ') : t(lang, 'noIssues')}</span>
                </button>
              );
            })}
          </div>
          <div className="table-wrap tall">
            <table className="data-table">
              <thead><tr><th>{t(lang, 'checks')}</th><th>{t(lang, 'severity')}</th><th>{t(lang, 'location')}</th><th>{t(lang, 'indicator')}</th><th>{t(lang, 'year')}</th><th>{t(lang, 'value')}</th><th>Message</th></tr></thead>
              <tbody>
                {issues.slice(0, 600).map((i, k) => (
                  <tr key={k}><td>{i.check}</td><td>{i.severity}</td><td>{i.geo_id ? catalog?.countries[i.geo_id]?.name ?? i.geo_id : ''}</td><td>{i.indicator ?? ''}</td><td>{i.year ?? ''}</td><td className="num">{i.value ?? ''}</td><td className="small">{i.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fineprint">{lang === 'ms' ? 'Outlier ditanda untuk semakan, tidak dibuang: kejutan sebenar (perang, pandemik, aliran pelarian) juga menghasilkan outlier.' : 'Outliers are flagged for review, never removed: real shocks (wars, pandemics, refugee flows) also produce them.'}</p>
        </>
      )}
    </Modal>
  );
}
