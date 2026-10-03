// Chart components (line/area, pyramid, bars, donut, treemap) following the dataviz mark specs:
// 2px lines, 4px rounded bar ends, recessive hairline grid, legend for ≥2 series, one axis only.
import { useCallback } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart, type ChartTokens } from './EChart';
import type { Indicator, Lang, Series } from '../types';
import { compact, formatValue } from '../utils/format';
import { useAtlas } from '../store/atlas';

const axisCommon = (tk: ChartTokens) => ({
  axisLine: { lineStyle: { color: tk.axis } },
  axisTick: { show: false },
  axisLabel: { color: tk.muted, fontSize: 10.5 },
  splitLine: { lineStyle: { color: tk.grid, width: 1 } },
});

export interface LineSpec { name: string; series: Series; color?: number; area?: boolean }

/** Time series; estimates solid, projections dashed in the same colour (one axis). */
export function TrendChart({ lines, ind, height = 220, lang, yearMarker, minYear, maxYear }: { lines: LineSpec[]; ind?: Indicator; height?: number; lang: Lang; yearMarker?: number; minYear?: number; maxYear?: number }) {
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => {
    const series: unknown[] = [];
    lines.forEach((l, i) => {
      const color = tk.series[(l.color ?? i) % 8];
      const pts = l.series.points.filter((p) => (minYear === undefined || p.year >= minYear) && (maxYear === undefined || p.year <= maxYear));
      const est = pts.filter((p) => p.quality !== 'PROJECTION');
      const proj = pts.filter((p) => p.quality === 'PROJECTION');
      if (est.length && proj.length) proj.unshift(est[est.length - 1]);
      const common = { type: 'line', showSymbol: false, symbolSize: 8, smooth: false, lineStyle: { width: 2, color, cap: 'round', join: 'round' }, itemStyle: { color }, emphasis: { focus: 'series' } };
      series.push({ ...common, name: l.name, data: est.map((p) => [p.year, p.value]), areaStyle: l.area ? { color, opacity: 0.1 } : undefined,
        markLine: i === 0 && yearMarker ? { symbol: 'none', silent: true, label: { show: false }, lineStyle: { color: tk.axis, width: 1, type: 'solid' }, data: [{ xAxis: yearMarker }] } : undefined });
      if (proj.length > 1) series.push({ ...common, name: l.name, data: proj.map((p) => [p.year, p.value]), lineStyle: { ...common.lineStyle, type: [5, 4] }, areaStyle: l.area ? { color, opacity: 0.05 } : undefined, tooltip: { valueFormatter: (v: number) => `${formatValue(v, ind, lang, { compact: true })} (proj.)` } });
    });
    return {
      legend: lines.length > 1 ? { data: lines.map((l) => l.name) } : { show: false },
      grid: { left: 4, right: 12, top: lines.length > 1 ? 26 : 10, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: tk.axis } }, valueFormatter: (v: number) => formatValue(v, ind, lang, { compact: true }) },
      xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', ...axisCommon(tk), splitLine: { show: false }, axisLabel: { color: tk.muted, fontSize: 10.5, formatter: (v: number) => String(v) } },
      yAxis: { type: 'value', scale: ind?.format !== 'count', ...axisCommon(tk), axisLabel: { color: tk.muted, fontSize: 10.5, formatter: (v: number) => (ind?.format === 'percent' ? `${v}%` : compact(v, lang)) } },
      series,
    };
  }, [lines, ind, lang, yearMarker, minYear, maxYear]);
  return <EChart option={option} height={height} ariaLabel={lines.map((l) => l.name).join(', ')} />;
}

/** Population pyramid: male to the left, female to the right, 5-year groups. */
export function PyramidChart({ groups, male, female, lang, height = 280, labels }: { groups: string[]; male: number[]; female: number[]; lang: Lang; height?: number; labels: { male: string; female: string } }) {
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => {
    const total = male.reduce((a, b) => a + b, 0) + female.reduce((a, b) => a + b, 0) || 1;
    const max = Math.max(...male, ...female) / total * 100;
    return {
      legend: { data: [labels.male, labels.female] },
      grid: { left: 4, right: 4, top: 24, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: Array<{ seriesName: string; value: number; name: string; dataIndex: number }>) => {
        const i = ps[0].dataIndex;
        return `<b>${groups[i]}</b><br/>${labels.male}: ${compact(male[i], lang)} (${(male[i] / total * 100).toFixed(1)}%)<br/>${labels.female}: ${compact(female[i], lang)} (${(female[i] / total * 100).toFixed(1)}%)`;
      } },
      xAxis: { type: 'value', min: -Math.ceil(max), max: Math.ceil(max), ...axisCommon(tk), axisLabel: { color: tk.muted, fontSize: 10, formatter: (v: number) => `${Math.abs(v)}%` } },
      yAxis: { type: 'category', data: groups, ...axisCommon(tk), axisLabel: { color: tk.muted, fontSize: 9.5, interval: 1 }, splitLine: { show: false } },
      series: [
        { name: labels.male, type: 'bar', stack: 'p', barWidth: '70%', barMaxWidth: 24, itemStyle: { color: tk.series[0], borderRadius: [4, 0, 0, 4] }, data: male.map((v) => -(v / total) * 100) },
        { name: labels.female, type: 'bar', stack: 'p', barWidth: '70%', barMaxWidth: 24, itemStyle: { color: tk.series[1], borderRadius: [0, 4, 4, 0] }, data: female.map((v) => (v / total) * 100) },
      ],
    };
  }, [groups, male, female, lang, labels]);
  return <EChart option={option} height={height} ariaLabel={`${labels.male} / ${labels.female}`} />;
}

export interface BarItem { id: string; name: string; value: number; year?: number; highlight?: boolean }

/** Horizontal ranking bars — one series, one hue; the selected place is emphasised. */
export function RankingChart({ items, ind, lang, height, onSelect }: { items: BarItem[]; ind?: Indicator; lang: Lang; height?: number; onSelect?: (id: string) => void }) {
  const setHover = useAtlas((s) => s.setHover);
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => ({
    grid: { left: 4, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', valueFormatter: (v: number) => formatValue(v, ind, lang) },
    xAxis: { type: 'value', ...axisCommon(tk), axisLabel: { show: false }, splitLine: { lineStyle: { color: tk.grid } } },
    yAxis: { type: 'category', inverse: true, data: items.map((i) => i.name), ...axisCommon(tk), axisLabel: { color: tk.text2, fontSize: 10.5, width: 110, overflow: 'truncate' }, splitLine: { show: false } },
    series: [{
      type: 'bar', barMaxWidth: 16, barCategoryGap: '30%',
      data: items.map((i) => ({ value: i.value, name: i.id, itemStyle: { color: i.highlight ? tk.series[1] : tk.series[0], opacity: i.highlight ? 1 : 0.85, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: tk.text2, fontSize: 10, formatter: (p: { value: number }) => formatValue(p.value, ind, lang, { compact: true }) },
    }],
  }), [items, ind, lang]);
  return <EChart option={option} height={height ?? Math.max(160, items.length * 22 + 20)} ariaLabel="ranking"
    onClick={(p) => { const d = p.data as { name?: string }; if (d?.name) onSelect?.(d.name); }}
    onHover={(p) => setHover(p ? ((p.data as { name?: string })?.name ?? null) : null)} />;
}

export interface SliceItem { name: string; value: number; color?: string; note?: string }

/** Part-to-whole at a glance (≤ 6 segments). Values stay readable in the table view. */
export function DonutChart({ items, lang, height = 220, unit = '%' }: { items: SliceItem[]; lang: Lang; height?: number; unit?: string }) {
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => ({
    legend: { orient: 'vertical', left: 0, top: 'middle', textStyle: { color: tk.text2, fontSize: 11 } },
    tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: ${p.value.toFixed(1)}${unit}` },
    series: [{
      type: 'pie', radius: ['52%', '78%'], center: ['68%', '50%'], padAngle: 1.5, itemStyle: { borderRadius: 4, borderColor: tk.surface, borderWidth: 2 },
      label: { show: false }, data: items.map((it, i) => ({ name: it.name, value: it.value, itemStyle: { color: it.color ?? tk.series[i % 8] } })),
    }],
  }), [items, unit]);
  void lang;
  return <EChart option={option} height={height} ariaLabel={items.map((i) => i.name).join(', ')} />;
}

export function TreemapChart({ items, height = 220 }: { items: SliceItem[]; height?: number }) {
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => ({
    tooltip: { formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value.toFixed(1)}% of GDP` },
    series: [{
      type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%', top: 0, left: 0,
      itemStyle: { borderColor: tk.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
      label: { show: true, formatter: (p: { name: string; value: number }) => `${p.name}\n${p.value.toFixed(1)}%`, color: '#ffffff', fontSize: 11, overflow: 'truncate' },
      data: items.map((it, i) => ({ name: it.name, value: it.value, itemStyle: { color: it.color ?? tk.series[i % 8] } })),
    }],
  }), [items]);
  return <EChart option={option} height={height} ariaLabel={items.map((i) => i.name).join(', ')} />;
}

/** Grouped vertical bars for a comparison (one bar per place, same indicator & year). */
export function CompareBars({ items, ind, lang, height = 200 }: { items: Array<BarItem & { color: number }>; ind?: Indicator; lang: Lang; height?: number }) {
  const option = useCallback((tk: ChartTokens): EChartsCoreOption => ({
    grid: { left: 4, right: 8, top: 18, bottom: 4, containLabel: true },
    tooltip: { trigger: 'item', valueFormatter: (v: number) => formatValue(v, ind, lang) },
    xAxis: { type: 'category', data: items.map((i) => i.name), ...axisCommon(tk), axisLabel: { color: tk.text2, fontSize: 10.5, interval: 0, width: 80, overflow: 'truncate' }, splitLine: { show: false } },
    yAxis: { type: 'value', ...axisCommon(tk), axisLabel: { color: tk.muted, fontSize: 10, formatter: (v: number) => compact(v, lang) } },
    series: [{ type: 'bar', barMaxWidth: 24, data: items.map((i) => ({ value: i.value, itemStyle: { color: tk.series[i.color % 8], borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', color: tk.text2, fontSize: 10, formatter: (p: { value: number; dataIndex: number }) => `${formatValue(p.value, ind, lang, { compact: true })}${items[p.dataIndex].year ? ` (${items[p.dataIndex].year})` : ''}` } }],
  }), [items, ind, lang]);
  return <EChart option={option} height={height} ariaLabel="comparison" />;
}
