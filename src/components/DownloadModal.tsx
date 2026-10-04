import { isParlimen } from '../utils/geoRefs';
import { useState } from 'react';
import type { Geometry } from 'geojson';
import { useAtlas } from '../store/atlas';
import { useLayer } from '../hooks/useLayer';
import { useLocationBundle, useWorldBank } from '../hooks/useLocation';
import { resolveSeries } from '../hooks/resolve';
import { pointAt, toObservation } from '../services/stats';
import { buildMeta, downloadBlob, fileStem, toCSV, toGeoJSON, toJSON, toPDF, toPNG, toRows, toXLSX, type ExportRow } from '../services/export';
import { geo } from '../services/geo';
import { mapHandle } from '../maps/MapView';
import { sbLogDownload } from '../services/supabase';
import { indicatorName, t } from '../utils/i18n';
import type { Observation } from '../types';
import { Modal } from './Modal';

type Fmt = 'csv' | 'xlsx' | 'json' | 'geojson' | 'png' | 'pdf';

export function DownloadModal() {
  const { lang, catalog, selection, year, projection, setModal, theme } = useAtlas();
  const L = useLayer();
  const bundle = useLocationBundle(selection);
  const wb = useWorldBank(selection?.level === 'country' ? selection.id : null);
  const [series, setSeries] = useState<'year' | 'all'>('year');
  const [busy, setBusy] = useState<Fmt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!catalog) return null;

  const collect = (): Observation[] => {
    const out: Observation[] = [];
    if (selection && bundle.data?.geo.id === selection.id) {
      const g = { id: selection.id, name: selection.name, level: selection.level, wb: catalog.countries[selection.countryId ?? '']?.wb };
      for (const ind of catalog.indicatorList) {
        const s = resolveSeries(ind.code, bundle.data, wb.data, catalog.indicators, 'dosm');
        if (!s) continue;
        const pts = series === 'all' ? s.points.filter((p) => projection || p.quality !== 'PROJECTION') : [pointAt(s, year, { allowProjection: projection })].filter(Boolean);
        for (const p of pts) out.push(toObservation(catalog, g, s, p!));
      }
    } else if (L.indicator && L.doc) {
      // world view: current map layer for every country, current year
      for (const [id, v] of Object.entries(L.values)) {
        const c = catalog.countries[id];
        out.push(toObservation(catalog, { id, name: c?.name ?? id, level: 'country', wb: c?.wb },
          { indicator: L.indicator.code, sourceId: L.indicator.source_id, lastUpdated: L.doc.last_updated ?? null, points: [], referenceConvention: L.doc.estimate_last !== undefined && ['population', 'population_male', 'population_female', 'sex_ratio', 'median_age', 'pop_0_14_pct', 'pop_65_plus_pct', 'density'].includes(L.indicator.code) ? '1 January' : undefined },
          { year: L.yearUsed, value: v, quality: L.quality ?? L.indicator.quality }));
      }
    }
    return out;
  };

  const scopeLabel = selection ? `${selection.name} (${selection.level})` : L.indicator ? `${indicatorName(lang, L.indicator)} · ${lang === 'ms' ? 'semua negara' : 'all countries'} · ${L.yearUsed}` : '';
  const stemName = selection ? selection.id : `world_${L.indicator?.code ?? 'map'}`;

  const run = async (fmt: Fmt) => {
    setBusy(fmt);
    setErr(null);
    try {
      const obs = collect();
      const rows: ExportRow[] = toRows(obs, catalog, lang);
      const title = selection ? `WorldStat Atlas — ${selection.name}` : `WorldStat Atlas — ${L.indicator ? indicatorName(lang, L.indicator) : ''} ${L.yearUsed}`;
      const meta = buildMeta(catalog, rows, title, scopeLabel);
      const stem = fileStem(stemName, series === 'all' && selection ? 'timeseries' : String(year));
      if (fmt === 'csv') downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), `${stem}.csv`);
      if (fmt === 'json') downloadBlob(new Blob([toJSON(rows, meta)], { type: 'application/json' }), `${stem}.json`);
      if (fmt === 'xlsx') downloadBlob(await toXLSX(rows, meta), `${stem}.xlsx`);
      if (fmt === 'geojson') {
        let geom: Geometry | null = null;
        if (selection?.level === 'country') geom = (await geo.world('50m')).features.find((f) => f.properties?.id === selection.id)?.geometry ?? null;
        else if (selection?.level === 'admin1' && selection.countryId) geom = (await geo.admin1(selection.countryId)).features.find((f) => f.properties?.id === selection.id)?.geometry ?? null;
        else if (selection?.level === 'admin2' && selection.countryId) geom = (await geo.admin2(selection.countryId, isParlimen(selection.id) ? 'parlimen' : 'district')).features.find((f) => f.properties?.id === selection.id)?.geometry ?? null;
        if (!selection && L.indicator) {
          const w = await geo.world('50m');
          const byId = new Map(rows.map((r) => [r.location_id, r]));
          const fc = { type: 'FeatureCollection', metadata: meta, features: w.features.map((f) => ({ ...f, properties: { ...f.properties, ...(byId.get(String(f.properties?.id)) ?? { value: null }) } })) };
          downloadBlob(new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }), `${stem}.geojson`);
        } else {
          downloadBlob(new Blob([toGeoJSON(rows, meta, geom, { id: selection?.id, name: selection?.name, level: selection?.level })], { type: 'application/geo+json' }), `${stem}.geojson`);
        }
      }
      if (fmt === 'png' || fmt === 'pdf') {
        const dataUrl = await mapHandle.capture();
        if (fmt === 'png') {
          if (!dataUrl) throw new Error('map capture failed');
          const img = new Image();
          img.src = dataUrl;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d')!.drawImage(img, 0, 0);
          const sub = L.indicator ? `${indicatorName(lang, L.indicator)} · ${L.yearUsed} · ${L.quality ?? ''} · ${L.indicator.unit}` : '';
          const src = [...new Set(meta.sources.map((s) => s.publisher.split(',')[0]))].join(' · ');
          downloadBlob(await toPNG(c, title, sub, `${t(lang, 'source')}: ${src || 'Natural Earth'} · WorldStat Atlas · ${new Date().toISOString().slice(0, 10)}`, theme === 'dark'), `${stem}.png`);
        } else {
          downloadBlob(await toPDF(rows.slice(0, 400), meta, dataUrl, lang), `${stem}.pdf`);
        }
      }
      void sbLogDownload(selection?.id ?? null, fmt, [...new Set(rows.map((r) => r.indicator_code))], rows.length);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const formats: Array<{ f: Fmt; label: string; desc: string }> = [
    { f: 'csv', label: 'CSV', desc: lang === 'ms' ? 'Jadual, UTF-8' : 'Table, UTF-8' },
    { f: 'xlsx', label: 'Excel', desc: lang === 'ms' ? 'Data + helaian metadata' : 'Data + metadata sheet' },
    { f: 'json', label: 'JSON', desc: lang === 'ms' ? 'Metadata + rekod' : 'Metadata + records' },
    { f: 'geojson', label: 'GeoJSON', desc: lang === 'ms' ? 'Geometri + statistik' : 'Geometry + statistics' },
    { f: 'png', label: 'PNG', desc: lang === 'ms' ? 'Imej peta + sumber' : 'Map image + sources' },
    { f: 'pdf', label: 'PDF', desc: lang === 'ms' ? 'Laporan ringkas' : 'Short report' },
  ];
  const nRows = collect().length;
  return (
    <Modal title={`⤓ ${t(lang, 'download')}`} onClose={() => setModal(null)}>
      <p className="muted">{selection ? t(lang, 'exportScope') : t(lang, 'exportWorld')}: <b>{scopeLabel || '—'}</b></p>
      {selection && (
        <div className="seg mb" role="radiogroup">
          <button className={series === 'year' ? 'on' : ''} onClick={() => setSeries('year')} role="radio" aria-checked={series === 'year'}>{lang === 'ms' ? `Tahun ${year} (terkini ≤)` : `Year ${year} (latest ≤)`}</button>
          <button className={series === 'all' ? 'on' : ''} onClick={() => setSeries('all')} role="radio" aria-checked={series === 'all'}>{lang === 'ms' ? 'Siri masa penuh' : 'Full time series'}</button>
        </div>
      )}
      <div className="dl-grid">
        {formats.map((x) => (
          <button key={x.f} className="dl-btn" disabled={busy !== null || (!nRows && x.f !== 'png')} onClick={() => run(x.f)}>
            <span className="dl-fmt">{busy === x.f ? '…' : x.label}</span>
            <span className="dl-desc">{x.desc}</span>
          </button>
        ))}
      </div>
      <p className="fineprint">{nRows} {lang === 'ms' ? 'rekod' : 'records'} · {lang === 'ms' ? 'Setiap rekod: lokasi, indikator, nilai, unit, tahun rujukan, kualiti, sumber, URL sumber, kemas kini terakhir, nota metodologi.' : 'Each record: location, indicator, value, unit, reference year, quality, source, source URL, last updated, methodology notes.'}</p>
      {err && <p className="fineprint warn">⚠ {err}</p>}
    </Modal>
  );
}
