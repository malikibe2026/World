// Download Center: CSV, Excel, JSON, GeoJSON, PNG, PDF.
// Every row carries location, indicator, value, unit, reference year, source and last updated.
import type { Feature, Geometry } from 'geojson';
import type { Lang, Observation } from '../types';
import type { Catalog } from './catalog';

export interface ExportRow {
  location: string;
  location_id: string;
  geographic_level: string;
  indicator: string;
  indicator_code: string;
  value: number | null;
  unit: string;
  reference_year: number;
  reference_period: string;
  quality: string;
  source: string;
  source_url: string;
  last_updated: string;
  methodology_notes: string;
}

export interface ExportMeta {
  title: string;
  scope: string;
  generatedAt: string;
  snapshot: string;
  appUrl: string;
  sources: Array<{ id: string; name: string; publisher: string; url: string; license?: string; citation?: string }>;
}

export const EXPORT_COLUMNS: Array<keyof ExportRow> = [
  'location', 'location_id', 'geographic_level', 'indicator', 'indicator_code', 'value', 'unit', 'reference_year',
  'reference_period', 'quality', 'source', 'source_url', 'last_updated', 'methodology_notes',
];

export function toRows(obs: Observation[], cat: Catalog, lang: Lang): ExportRow[] {
  return obs.map((o) => {
    const ind = cat.indicators[o.indicator];
    return {
      location: o.geoName,
      location_id: o.geoId,
      geographic_level: o.level,
      indicator: ind ? (lang === 'ms' ? ind.name_ms : ind.name_en) : o.indicator,
      indicator_code: o.indicator,
      value: o.value,
      unit: o.unit,
      reference_year: o.year,
      reference_period: o.referencePeriod,
      quality: o.quality,
      source: o.sourceName,
      source_url: o.sourceUrl,
      last_updated: o.lastUpdated ?? cat.manifest.snapshot_built_at,
      methodology_notes: o.notes ?? '',
    };
  });
}

export function buildMeta(cat: Catalog, rows: ExportRow[], title: string, scope: string): ExportMeta {
  const used = new Set<string>();
  for (const r of rows) {
    const o = r.indicator_code ? cat.indicators[r.indicator_code] : undefined;
    if (o) { used.add(o.source_id); if (o.inputs_source_id) used.add(o.inputs_source_id); }
  }
  return {
    title,
    scope,
    generatedAt: new Date().toISOString(),
    snapshot: cat.manifest.snapshot_built_at,
    appUrl: typeof location !== 'undefined' ? location.href : '',
    sources: [...used].map((id) => cat.sources[id]).filter(Boolean).map((s) => ({ id: s.id, name: s.name, publisher: s.publisher, url: s.url, license: s.license, citation: s.citation })),
  };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const r of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM: Excel opens UTF-8 (ā, é, ğ) correctly
}

export function toJSON(rows: ExportRow[], meta: ExportMeta): string {
  return JSON.stringify({ meta, data: rows }, null, 2);
}

export function toGeoJSON(rows: ExportRow[], meta: ExportMeta, geometry: Geometry | null, props: Record<string, unknown>): string {
  const f: Feature = { type: 'Feature', geometry: geometry ?? (null as unknown as Geometry), properties: { ...props, statistics: rows } };
  return JSON.stringify({ type: 'FeatureCollection', metadata: meta, features: [f] });
}

export async function toXLSX(rows: ExportRow[], meta: ExportMeta): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file');
  type Cell = { value: string | number | null; type?: typeof String | typeof Number; fontWeight?: 'bold' } | null;
  const header: Cell[] = EXPORT_COLUMNS.map((c) => ({ value: c, fontWeight: 'bold' }));
  const data: Cell[][] = [header, ...rows.map((r) => EXPORT_COLUMNS.map((c) => {
    const v = r[c];
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'number' ? { value: v, type: Number } : { value: String(v), type: String };
  }))];
  const metaRows: Cell[][] = [
    [{ value: 'title', fontWeight: 'bold' }, { value: meta.title }],
    [{ value: 'scope', fontWeight: 'bold' }, { value: meta.scope }],
    [{ value: 'generated_at', fontWeight: 'bold' }, { value: meta.generatedAt }],
    [{ value: 'snapshot_built_at', fontWeight: 'bold' }, { value: meta.snapshot }],
    [{ value: 'app_url', fontWeight: 'bold' }, { value: meta.appUrl }],
    [null],
    [{ value: 'source_id', fontWeight: 'bold' }, { value: 'name', fontWeight: 'bold' }, { value: 'publisher', fontWeight: 'bold' }, { value: 'url', fontWeight: 'bold' }, { value: 'license', fontWeight: 'bold' }, { value: 'citation', fontWeight: 'bold' }],
    ...meta.sources.map((s) => [{ value: s.id }, { value: s.name }, { value: s.publisher }, { value: s.url }, { value: s.license ?? '' }, { value: s.citation ?? '' }] as Cell[]),
  ];
  // write-excel-file's typings model cells loosely; the arrays above follow its documented shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (writeXlsxFile as any)([data, metaRows], { sheets: ['data', 'metadata'] })) as Blob;
}

/** Compose a PNG: title bar, map image, legend text and source line. */
export async function toPNG(mapCanvas: HTMLCanvasElement, title: string, subtitle: string, footer: string, dark: boolean): Promise<Blob> {
  const w = mapCanvas.width, h = mapCanvas.height;
  const scale = window.devicePixelRatio || 1;
  const top = Math.round(64 * scale), bottom = Math.round(40 * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h + top + bottom;
  const g = c.getContext('2d')!;
  g.fillStyle = dark ? '#0d1520' : '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(mapCanvas, 0, top);
  g.fillStyle = dark ? '#ffffff' : '#0b0b0b';
  g.font = `600 ${20 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  g.fillText(title, 16 * scale, 28 * scale);
  g.fillStyle = dark ? '#c3c2b7' : '#52514e';
  g.font = `${13 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  g.fillText(subtitle, 16 * scale, 50 * scale);
  g.fillText(footer, 16 * scale, h + top + 26 * scale);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
}

export async function toPDF(rows: ExportRow[], meta: ExportMeta, mapImage: string | null, lang: Lang): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(meta.title, 40, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${meta.scope} · ${lang === 'ms' ? 'Dijana' : 'Generated'} ${meta.generatedAt.slice(0, 10)} · WorldStat Atlas`, 40, 66);
  let y = 84;
  if (mapImage) {
    const imgW = W - 80, imgH = imgW * 0.42;
    doc.addImage(mapImage, 'PNG', 40, y, imgW, imgH);
    y += imgH + 16;
  }
  autoTable(doc, {
    startY: y,
    head: [[lang === 'ms' ? 'Indikator' : 'Indicator', lang === 'ms' ? 'Nilai' : 'Value', 'Unit', lang === 'ms' ? 'Tahun' : 'Year', lang === 'ms' ? 'Kualiti' : 'Quality', lang === 'ms' ? 'Sumber' : 'Source']],
    body: rows.map((r) => [r.indicator, r.value === null ? '—' : r.value.toLocaleString('en', { maximumFractionDigits: 3 }), r.unit, String(r.reference_year), r.quality, r.source]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [16, 66, 129] },
    margin: { left: 40, right: 40 },
  });
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(lang === 'ms' ? 'Sumber data' : 'Data sources', 40, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let sy = 70;
  for (const s of meta.sources) {
    const lines = doc.splitTextToSize(`${s.publisher} — ${s.name}. ${s.url}${s.license ? ` · ${s.license}` : ''}${s.citation ? ` · ${s.citation}` : ''}`, W - 80);
    doc.text(lines, 40, sy);
    sy += lines.length * 12 + 6;
  }
  doc.text(doc.splitTextToSize(lang === 'ms'
    ? 'Nota: OFFICIAL = statistik rasmi diterbitkan; ESTIMATE = anggaran rasmi/model; PROJECTION = unjuran rasmi; DERIVED = dikira oleh WorldStat daripada input rasmi. Data yang tiada tidak direka.'
    : 'Note: OFFICIAL = published official statistic; ESTIMATE = official/modelled estimate; PROJECTION = official projection; DERIVED = computed by WorldStat from official inputs. Missing data is never imputed.', W - 80), 40, sy + 12);
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fileStem(location: string, what: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `worldstat_${location}_${what}_${d}`.replace(/[^\w.-]+/g, '-');
}
