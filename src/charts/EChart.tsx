import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, TreemapChart } from 'echarts/charts';
import { AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useAtlas } from '../store/atlas';

echarts.use([LineChart, BarChart, PieChart, TreemapChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, DataZoomComponent, AxisPointerComponent, CanvasRenderer]);

export interface ChartTokens {
  surface: string; text: string; text2: string; muted: string; grid: string; axis: string; series: string[]; font: string;
}

/** Chart colours come from CSS custom properties so light/dark are selected, not auto-flipped. */
export function chartTokens(): ChartTokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v('--chart-surface'), text: v('--text-primary'), text2: v('--text-secondary'), muted: v('--text-muted'),
    grid: v('--chart-grid'), axis: v('--chart-axis'), font: v('--font-sans') || 'system-ui, sans-serif',
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
  };
}

export function baseOption(tk: ChartTokens): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: tk.font, color: tk.text2 },
    animationDuration: 350,
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: tk.surface, borderColor: tk.grid, borderWidth: 1, textStyle: { color: tk.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 6px 24px rgba(0,0,0,.14); border-radius: 8px;',
    },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: tk.text2, fontSize: 11 } },
  };
}

interface Props { option: (tk: ChartTokens) => EChartsCoreOption; height?: number; ariaLabel: string; onClick?: (p: { name?: string; data?: unknown }) => void; onHover?: (p: { name?: string; data?: unknown } | null) => void }

export function EChart({ option, height = 220, ariaLabel, onClick, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const theme = useAtlas((s) => s.theme);
  const handlers = useRef({ onClick, onHover });
  handlers.current = { onClick, onHover };

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    inst.current = c;
    c.on('click', (p) => handlers.current.onClick?.(p as { name?: string; data?: unknown }));
    c.on('mouseover', (p) => handlers.current.onHover?.(p as { name?: string; data?: unknown }));
    c.on('mouseout', () => handlers.current.onHover?.(null));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); inst.current = null; };
  }, []);

  useEffect(() => {
    const c = inst.current;
    if (!c) return;
    const tk = chartTokens();
    const base = baseOption(tk) as Record<string, Record<string, unknown>>;
    const o = option(tk) as Record<string, Record<string, unknown> | undefined>;
    const merged = {
      ...base, ...o,
      legend: o.legend === undefined ? base.legend : { ...base.legend, ...o.legend },
      tooltip: o.tooltip === undefined ? base.tooltip : { ...base.tooltip, ...o.tooltip },
    };
    c.setOption(merged, { notMerge: true });
  }, [option, theme]);

  return <div ref={el} className="echart" style={{ height }} role="img" aria-label={ariaLabel} />;
}
