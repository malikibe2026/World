// Raster basemaps (optional, behind the statistical vector map). Each has its own terms of use;
// override with VITE_BASEMAP_* for production (e.g. a keyed MapTiler/Esri/Stadia account).
import type { Theme } from '../types';

const env = import.meta.env;

export interface RasterBasemap {
  tiles: string[];
  attribution: string;
  maxzoom: number;
  terms: string;
}

export function streetBasemap(theme: Theme): RasterBasemap {
  const custom = theme === 'dark' ? env.VITE_BASEMAP_STREET_DARK_URL : env.VITE_BASEMAP_STREET_URL;
  if (custom) return { tiles: [custom], attribution: env.VITE_BASEMAP_ATTRIBUTION || '', maxzoom: 19, terms: '' };
  const style = theme === 'dark' ? 'dark_all' : 'rastertiles/voyager';
  return {
    tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`),
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    maxzoom: 19,
    terms: 'https://carto.com/legal/',
  };
}

export function satelliteBasemap(): RasterBasemap {
  if (env.VITE_BASEMAP_SATELLITE_URL) return { tiles: [env.VITE_BASEMAP_SATELLITE_URL], attribution: env.VITE_BASEMAP_ATTRIBUTION || '', maxzoom: 19, terms: '' };
  return {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxzoom: 18,
    terms: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
  };
}

export function terrainBasemap(): RasterBasemap {
  if (env.VITE_BASEMAP_TERRAIN_URL) return { tiles: [env.VITE_BASEMAP_TERRAIN_URL], attribution: env.VITE_BASEMAP_ATTRIBUTION || '', maxzoom: 17, terms: '' };
  return {
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxzoom: 17,
    terms: 'https://opentopomap.org/about',
  };
}

/** Elevation (AWS Terrain Tiles, Terrarium encoding — open data on the AWS Registry). */
export const ELEVATION_DEM = {
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  maxzoom: 14,
  attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> (SRTM, GMTED, ETOPO1 and others)',
};
