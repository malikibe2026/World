// Style building blocks: sources & layers of the statistical vector map (no external tiles needed).
import type { AddLayerObject, ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { Theme } from '../types';
import { mapColors } from './palette';

export const FONT_REGULAR = ['Noto Sans Regular'];
export const FONT_MEDIUM = ['Noto Sans Medium'];
export const FONT_ITALIC = ['Noto Sans Italic'];

export const COUNTRY_SOURCES = ['c110', 'c50', 'c10'] as const;
export type CountrySource = (typeof COUNTRY_SOURCES)[number];
export const COUNTRY_ZOOMS: Record<CountrySource, [number, number]> = { c110: [0, 2.6], c50: [2.6, 5], c10: [5, 24] };

export const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

export function baseStyle(theme: Theme, glyphs: string, globe: boolean): StyleSpecification {
  const c = mapColors(theme);
  return {
    version: 8,
    glyphs,
    projection: { type: globe ? 'globe' : 'mercator' },
    sky: {
      'sky-color': theme === 'dark' ? '#061020' : '#bcd6f0',
      'horizon-color': theme === 'dark' ? '#123056' : '#e7f0f9',
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    },
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': c.ocean } }],
  };
}

/** Fill colour driven by feature-state: c = class index, -1 = no data, absent = plain land. */
export function fillColorExpr(theme: Theme, colors: string[] | null): ExpressionSpecification {
  const c = mapColors(theme);
  if (!colors) return ['case', ['boolean', ['feature-state', 'hover'], false], c.landHover, c.land] as ExpressionSpecification;
  const match: unknown[] = ['match', ['coalesce', ['feature-state', 'c'], -2], -2, c.land, -1, c.noData];
  colors.forEach((col, i) => match.push(i, col));
  match.push(c.noData);
  return match as ExpressionSpecification;
}

const opacityCase = (base: number) =>
  ['case', ['boolean', ['feature-state', 'dim'], false], base * 0.35, ['boolean', ['feature-state', 'hover'], false], Math.min(1, base + 0.15), base];

/** Country fill opacity; fades when zoomed in so state/district detail reads clearly. */
export const fillOpacityExpr = (base: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], 5, opacityCase(base), 8, opacityCase(base * 0.55)] as unknown as ExpressionSpecification;

export function overlayLayers(theme: Theme): AddLayerObject[] {
  const c = mapColors(theme);

  return [
    // water bodies & urban areas (above land fills)
    { id: 'lakes50', type: 'fill', source: 'lakes50', maxzoom: 5, layout: { visibility: 'visible' }, paint: { 'fill-color': c.water } },
    { id: 'lakes10', type: 'fill', source: 'lakes10', minzoom: 5, layout: { visibility: 'visible' }, paint: { 'fill-color': c.water } },
    { id: 'urban', type: 'fill', source: 'urban', minzoom: 4, layout: { visibility: 'none' }, paint: { 'fill-color': c.urban, 'fill-outline-color': c.selected } },
    { id: 'rivers50', type: 'line', source: 'rivers50', maxzoom: 5, layout: { 'line-cap': 'round', visibility: 'visible' }, paint: { 'line-color': c.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 5, 1.1], 'line-opacity': 0.85 } },
    { id: 'rivers10', type: 'line', source: 'rivers10', minzoom: 5, layout: { 'line-cap': 'round', visibility: 'visible' }, paint: { 'line-color': c.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 2.2] } },
    { id: 'roads', type: 'line', source: 'roads', minzoom: 3, layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': c.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['match', ['get', 'kind'], 'major', 0.6, 0.3], 10, ['match', ['get', 'kind'], 'major', 2.4, 1.2]] } },
  ] as AddLayerObject[];
}

export function lineLayers(theme: Theme): AddLayerObject[] {
  const c = mapColors(theme);
  const out: AddLayerObject[] = [];
  for (const s of COUNTRY_SOURCES) {
    const [minzoom, maxzoom] = COUNTRY_ZOOMS[s];
    out.push({ id: `${s}-line`, type: 'line', source: s, minzoom, maxzoom, paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.35, 4, 0.8, 8, 1.4] } });
  }
  out.push(
    { id: 'a1-line', type: 'line', source: 'admin1', minzoom: 2.5, paint: { 'line-color': c.admin1, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 8, 1.1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 3.5, 1] } } as AddLayerObject,
    { id: 'a2-line', type: 'line', source: 'admin2', minzoom: 5, paint: { 'line-color': c.admin2, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1], 'line-dasharray': [2, 1.5] } } as AddLayerObject,
  );
  // hover & selection outlines (filters updated at runtime)
  for (const s of COUNTRY_SOURCES) {
    const [minzoom, maxzoom] = COUNTRY_ZOOMS[s];
    out.push({ id: `${s}-hover`, type: 'line', source: s, minzoom, maxzoom, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.borderStrong, 'line-width': 1.6 } });
    out.push({ id: `${s}-sel`, type: 'line', source: s, minzoom, maxzoom, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.selected, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 6, 3] } });
  }
  out.push(
    { id: 'a1-hover', type: 'line', source: 'admin1', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.borderStrong, 'line-width': 1.4 } } as AddLayerObject,
    { id: 'a2-hover', type: 'line', source: 'admin2', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.borderStrong, 'line-width': 1.2 } } as AddLayerObject,
    { id: 'a1-sel', type: 'line', source: 'admin1', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.selected, 'line-width': 2.6 } } as AddLayerObject,
    { id: 'a2-sel', type: 'line', source: 'admin2', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.selected, 'line-width': 2.4 } } as AddLayerObject,
  );
  return out;
}

export function pointLayers(theme: Theme): AddLayerObject[] {
  const c = mapColors(theme);
  const halo = { 'text-halo-color': c.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  const cityZoom: ExpressionSpecification = ['<=', ['to-number', ['get', 'mz'], 9], ['zoom']] as unknown as ExpressionSpecification;
  return [
    { id: 'peaks', type: 'circle', source: 'peaks', minzoom: 3, layout: { visibility: 'none' }, filter: ['<=', ['coalesce', ['get', 'rank'], 9], ['+', ['zoom'], 1]] as unknown as ExpressionSpecification, paint: { 'circle-radius': 3.5, 'circle-color': c.peak, 'circle-stroke-color': c.halo, 'circle-stroke-width': 1.5 } },
    { id: 'peaks-label', type: 'symbol', source: 'peaks', minzoom: 4, layout: { visibility: 'none', 'text-field': ['case', ['has', 'elev'], ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'elev']], ' m'], ['get', 'name']], 'text-font': FONT_ITALIC, 'text-size': 10.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': c.peak, ...halo } },
    { id: 'airports', type: 'circle', source: 'airports', minzoom: 4, layout: { visibility: 'none' }, filter: ['<=', ['coalesce', ['get', 'rank'], 9], ['-', ['zoom'], 1]] as unknown as ExpressionSpecification, paint: { 'circle-radius': 4, 'circle-color': '#6366f1', 'circle-stroke-color': c.halo, 'circle-stroke-width': 1.5 } },
    { id: 'airports-label', type: 'symbol', source: 'airports', minzoom: 6, layout: { visibility: 'none', 'text-field': ['coalesce', ['get', 'iata'], ['get', 'name']], 'text-font': FONT_MEDIUM, 'text-size': 10, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#6366f1', ...halo } },
    { id: 'ports', type: 'circle', source: 'ports', minzoom: 5, layout: { visibility: 'none' }, filter: ['<=', ['coalesce', ['get', 'rank'], 9], ['-', ['zoom'], 0]] as unknown as ExpressionSpecification, paint: { 'circle-radius': 3.5, 'circle-color': '#0e7490', 'circle-stroke-color': c.halo, 'circle-stroke-width': 1.5 } },
    { id: 'ports-label', type: 'symbol', source: 'ports', minzoom: 7, layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR, 'text-size': 10, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#0e7490', ...halo } },
    { id: 'cities', type: 'circle', source: 'cities', filter: ['all', ['!=', ['get', 'kind'], 'capital'], cityZoom] as unknown as ExpressionSpecification, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.6, 8, 3.2], 'circle-color': c.city, 'circle-stroke-color': c.halo, 'circle-stroke-width': 1 } },
    { id: 'capitals', type: 'circle', source: 'cities', filter: ['==', ['get', 'kind'], 'capital'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 4.5], 'circle-color': c.halo, 'circle-stroke-color': c.capital, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 6, 2] } },
  ] as AddLayerObject[];
}

export function labelLayers(theme: Theme): AddLayerObject[] {
  const c = mapColors(theme);
  const halo = { 'text-halo-color': c.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.5 };
  const cityZoom = ['<=', ['to-number', ['get', 'mz'], 9], ['+', ['zoom'], 0.4]];
  return [
    { id: 'sea-labels', type: 'symbol', source: 'marine', filter: ['<=', ['coalesce', ['get', 'mz'], 5], ['+', ['zoom'], 1]] as unknown as ExpressionSpecification, layout: { 'text-field': ['get', 'name'], 'text-font': FONT_ITALIC, 'text-size': ['match', ['get', 'kind'], 'ocean', 14, 11], 'text-letter-spacing': 0.12, 'text-max-width': 7 }, paint: { 'text-color': c.seaText, 'text-halo-color': c.ocean, 'text-halo-width': 0.8 } },
    { id: 'physical-labels', type: 'symbol', source: 'physical', layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-font': FONT_ITALIC, 'text-size': 10.5, 'text-max-width': 7, 'text-optional': true }, filter: ['<=', ['coalesce', ['get', 'mz'], 5], ['+', ['zoom'], 1]] as unknown as ExpressionSpecification, paint: { 'text-color': theme === 'dark' ? '#b8a98f' : '#7a6a52', ...halo } },
    { id: 'admin2-labels', type: 'symbol', source: 'admin-labels', minzoom: 7, filter: ['==', ['get', 'level'], 'admin2'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR, 'text-size': 10, 'text-max-width': 6, 'text-optional': true }, paint: { 'text-color': theme === 'dark' ? '#9fb0c2' : '#6b7480', ...halo } },
    { id: 'admin1-labels', type: 'symbol', source: 'admin-labels', minzoom: 4.2, maxzoom: 9, filter: ['==', ['get', 'level'], 'admin1'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT_MEDIUM, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 7, 'text-optional': true }, paint: { 'text-color': theme === 'dark' ? '#a9b8c8' : '#5f6873', ...halo } },
    { id: 'city-labels', type: 'symbol', source: 'cities', filter: ['all', ['!=', ['get', 'kind'], 'capital'], cityZoom] as unknown as ExpressionSpecification, layout: { 'text-field': ['get', 'name'], 'text-font': FONT_REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 13], 'text-offset': [0, 0.6], 'text-anchor': 'top', 'text-optional': true, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 10] }, paint: { 'text-color': c.city, ...halo } },
    { id: 'capital-labels', type: 'symbol', source: 'cities', minzoom: 2.2, filter: ['==', ['get', 'kind'], 'capital'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT_MEDIUM, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10.5, 8, 14], 'text-offset': [0, 0.7], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': c.capital, ...halo } },
    { id: 'country-labels', type: 'symbol', source: 'country-labels', layout: { 'text-field': ['get', 'name'], 'text-font': FONT_MEDIUM, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, ['match', ['get', 'r'], [1, 2], 11, 9], 4, ['match', ['get', 'r'], [1, 2, 3], 15, 12], 7, 16], 'text-max-width': 7, 'text-letter-spacing': 0.02, 'symbol-sort-key': ['get', 'r'] }, filter: ['<=', ['get', 'r'], ['+', ['zoom'], 2.2]] as unknown as ExpressionSpecification, paint: { 'text-color': c.text, ...halo, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 8.5, 0.35] } },
  ] as AddLayerObject[];
}

export const THEME_PAINT: Array<[string, string, (c: ReturnType<typeof mapColors>) => unknown]> = [
  ['background', 'background-color', (c) => c.ocean],
  ['lakes50', 'fill-color', (c) => c.water], ['lakes10', 'fill-color', (c) => c.water],
  ['rivers50', 'line-color', (c) => c.river], ['rivers10', 'line-color', (c) => c.river],
  ['roads', 'line-color', (c) => c.road], ['urban', 'fill-color', (c) => c.urban],
  ['c110-line', 'line-color', (c) => c.border], ['c50-line', 'line-color', (c) => c.border], ['c10-line', 'line-color', (c) => c.border],
  ['a1-line', 'line-color', (c) => c.admin1], ['a2-line', 'line-color', (c) => c.admin2],
  ['c110-sel', 'line-color', (c) => c.selected], ['c50-sel', 'line-color', (c) => c.selected], ['c10-sel', 'line-color', (c) => c.selected],
  ['a1-sel', 'line-color', (c) => c.selected], ['a2-sel', 'line-color', (c) => c.selected],
  ['cities', 'circle-color', (c) => c.city], ['capitals', 'circle-stroke-color', (c) => c.capital], ['capitals', 'circle-color', (c) => c.halo],
  ['peaks', 'circle-color', (c) => c.peak],
  ['country-labels', 'text-color', (c) => c.text], ['country-labels', 'text-halo-color', (c) => c.halo],
  ['city-labels', 'text-color', (c) => c.city], ['city-labels', 'text-halo-color', (c) => c.halo],
  ['capital-labels', 'text-color', (c) => c.capital], ['capital-labels', 'text-halo-color', (c) => c.halo],
  ['admin1-labels', 'text-halo-color', (c) => c.halo], ['admin2-labels', 'text-halo-color', (c) => c.halo],
  ['sea-labels', 'text-color', (c) => c.seaText], ['sea-labels', 'text-halo-color', (c) => c.ocean],
  ['peaks-label', 'text-halo-color', (c) => c.halo], ['airports-label', 'text-halo-color', (c) => c.halo], ['ports-label', 'text-halo-color', (c) => c.halo],
  ['physical-labels', 'text-halo-color', (c) => c.halo],
];
