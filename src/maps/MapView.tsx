import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl, Map as MlMap, Marker, NavigationControl, ScaleControl, setWorkerUrl,
  type GeoJSONSource, type MapGeoJSONFeature, type MapMouseEvent,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection } from 'geojson';
import { isPhone, useAtlas, type OverlayKey } from '../store/atlas';
import { useLayer } from '../hooks/useLayer';
import { geo, profiles } from '../services/geo';
import { assetUrl } from '../services/http';
import { classIndex, mapColors } from './palette';
import {
  COUNTRY_SOURCES, COUNTRY_ZOOMS, EMPTY_FC, THEME_PAINT, adminFillOpacityExpr, baseStyle, fillColorExpr, fillOpacityExpr, labelLayers, lineLayers, overlayLayers, pointLayers,
} from './layers';
import { villagesInView } from '../services/villages';
import { ELEVATION_DEM, satelliteBasemap, streetBasemap, terrainBasemap } from './basemaps';
import { formatValue } from '../utils/format';
import { indicatorName, t } from '../utils/i18n';
import type { GeoRef, Theme } from '../types';
import { QualityBadge } from '../components/QualityBadge';

setWorkerUrl(workerUrl);

/** Imperative handle used by the Download Center (PNG/PDF capture) and fullscreen. */
export const mapHandle: { map: MlMap | null; capture: () => Promise<string | null> } = {
  map: null,
  capture: () =>
    new Promise((resolve) => {
      const m = mapHandle.map;
      if (!m) return resolve(null);
      m.once('render', () => {
        try { resolve(m.getCanvas().toDataURL('image/png')); } catch { resolve(null); }
      });
      m.triggerRepaint();
    }),
};

interface Tip { x: number; y: number; title: string; sub?: string; id?: string; level?: string }

const OVERLAY_LAYERS: Record<OverlayKey, string[]> = {
  admin1: ['a1-line', 'admin1-labels'],
  admin2: ['a2-line', 'admin2-labels'],
  capitals: ['capitals', 'capital-labels'],
  cities: ['cities', 'city-labels'],
  villages: ['villages', 'village-labels'],
  rivers: ['rivers50', 'rivers10'],
  lakes: ['lakes50', 'lakes10'],
  peaks: ['peaks', 'peaks-label'],
  physical: ['physical-labels'],
  seas: ['sea-labels'],
  roads: ['roads'],
  urban: ['urban'],
  airports: ['airports', 'airports-label'],
  ports: ['ports', 'ports-label'],
  landmarks: [],
  elevation: ['elev-relief', 'elev-hillshade'],
};

function bboxOk(b: [number, number, number, number]) {
  return b[2] - b[0] < 200;
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const loaded = useRef({ c10: false, rivers10: false, lakes10: false, roads: false, urban: false, admin1: new Map<string, Feature[]>(), admin2: new Map<string, Feature[]>(), labels: new Map<string, Feature[]>() });
  const markers = useRef<Marker[]>([]);
  const pointMarker = useRef<Marker | null>(null);
  const appliedStates = useRef<{ countries: Set<string>; admin1: Set<string>; admin2: Set<string> }>({ countries: new Set(), admin1: new Set(), admin2: new Set() });

  const {
    theme, lang, catalog, selection, select, setPoint, point, overlays, basemap, globe, fly, landmarks, landmarkFilter, regionFilter, setMapZoom, hoverId, setHover,
  } = useAtlas();
  const layer = useLayer();
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const langRef = useRef(lang);
  langRef.current = lang;
  const selRef = useRef(selection);
  selRef.current = selection;

  // ---------------------------------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!el.current || !catalog) return;
    const glyphs = new URL(assetUrl('fonts/{fontstack}/{range}.pbf'), location.origin).toString().replace('%7Bfontstack%7D', '{fontstack}').replace('%7Brange%7D', '{range}');
    const initial = new URL(location.href).searchParams.get('geo');
    const map = new MlMap({
      container: el.current,
      style: baseStyle(useAtlas.getState().theme, glyphs, useAtlas.getState().globe),
      center: [100, 12],
      zoom: initial ? 3 : Math.min(2.1, Math.max(1.2, Math.log2(Math.min(el.current.clientWidth, el.current.clientHeight) / 260) + 1)),
      minZoom: 0.6,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      fadeDuration: 120,
    });
    mapRef.current = map;
    mapHandle.map = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(new AttributionControl({ compact: true, customAttribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a> · <a href="https://www.geoboundaries.org/">geoBoundaries</a> · <a href="https://open.dosm.gov.my/">DOSM</a> (sempadan parlimen) · <a href="https://www.geonames.org/">GeoNames</a>' }), 'bottom-right');
    map.touchZoomRotate.disableRotation();

    map.on('load', async () => {
      const th = useAtlas.getState().theme;
      const st = streetBasemap(th), sat = satelliteBasemap(), ter = terrainBasemap();
      map.addSource('bm-street', { type: 'raster', tiles: st.tiles, tileSize: 256, maxzoom: st.maxzoom, attribution: st.attribution });
      map.addSource('bm-satellite', { type: 'raster', tiles: sat.tiles, tileSize: 256, maxzoom: sat.maxzoom, attribution: sat.attribution });
      map.addSource('bm-terrain', { type: 'raster', tiles: ter.tiles, tileSize: 256, maxzoom: ter.maxzoom, attribution: ter.attribution });
      map.addSource('bm-street-ref', { type: 'raster', tiles: streetBasemap('dark').labels!, tileSize: 256, maxzoom: 16, attribution: '' });
      for (const b of ['street', 'street-ref', 'satellite', 'terrain']) map.addLayer({ id: `bm-${b}`, type: 'raster', source: `bm-${b}`, layout: { visibility: 'none' } });
      map.addSource('dem', { type: 'raster-dem', tiles: ELEVATION_DEM.tiles, encoding: ELEVATION_DEM.encoding, tileSize: 256, maxzoom: ELEVATION_DEM.maxzoom, attribution: ELEVATION_DEM.attribution });

      const [w110, w50] = await Promise.all([geo.world('110m'), geo.world('50m')]);
      map.addSource('c110', { type: 'geojson', data: w110, promoteId: 'id' });
      map.addSource('c50', { type: 'geojson', data: w50, promoteId: 'id' });
      map.addSource('c10', { type: 'geojson', data: EMPTY_FC, promoteId: 'id' });
      for (const s of COUNTRY_SOURCES) {
        const [minzoom, maxzoom] = COUNTRY_ZOOMS[s];
        map.addLayer({ id: `${s}-fill`, type: 'fill', source: s, minzoom, maxzoom, paint: { 'fill-color': fillColorExpr(th, null), 'fill-opacity': fillOpacityExpr(1) } });
      }
      map.addSource('admin1', { type: 'geojson', data: EMPTY_FC, promoteId: 'id' });
      map.addSource('admin2', { type: 'geojson', data: EMPTY_FC, promoteId: 'id' });
      map.addLayer({ id: 'a1-fill', type: 'fill', source: 'admin1', minzoom: 2.5, paint: { 'fill-color': fillColorExpr(th, null), 'fill-opacity': adminFillOpacityExpr() } });
      map.addLayer({ id: 'a2-fill', type: 'fill', source: 'admin2', minzoom: 5, paint: { 'fill-color': fillColorExpr(th, null), 'fill-opacity': adminFillOpacityExpr() } });

      map.addLayer({ id: 'elev-relief', type: 'color-relief', source: 'dem', layout: { visibility: 'none' }, paint: { 'color-relief-opacity': 0.75, 'color-relief-color': ['interpolate', ['linear'], ['elevation'], -100, 'rgba(0,0,0,0)', 0, '#2f6b3a', 200, '#5e9a4d', 600, '#b8c271', 1200, '#d9b26a', 2200, '#b0784a', 3500, '#8a5a44', 5000, '#f2f2f2'] } } as never);
      map.addLayer({ id: 'elev-hillshade', type: 'hillshade', source: 'dem', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': th === 'dark' ? '#000000' : '#473b24', 'hillshade-highlight-color': '#ffffff' } });

      for (const id of ['lakes50', 'lakes10', 'rivers50', 'rivers10', 'roads', 'urban']) map.addSource(id, { type: 'geojson', data: EMPTY_FC });
      for (const l of overlayLayers(th)) map.addLayer(l);
      for (const l of lineLayers(th)) map.addLayer(l);
      // until the 1:10m countries are loaded, keep 1:50m visible at high zoom
      for (const id of ['c50-fill', 'c50-line', 'c50-hover', 'c50-sel']) map.setLayerZoomRange(id, 2.6, 24);
      for (const id of ['cities', 'villages', 'peaks', 'airports', 'ports', 'marine', 'physical']) map.addSource(id, { type: 'geojson', data: EMPTY_FC });
      map.addSource('admin-labels', { type: 'geojson', data: EMPTY_FC });
      map.addSource('country-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: catalog.countryList.map((cc) => ({ type: 'Feature', properties: { id: cc.id, name: cc.name, r: cc.rank ?? 5 }, geometry: { type: 'Point', coordinates: cc.label } })) } as FeatureCollection,
      });
      for (const l of pointLayers(th)) map.addLayer(l);
      for (const l of labelLayers(th)) map.addLayer(l);

      // lazy, small layers
      const set = (id: string, d: FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(d);
      geo.cities().then((d) => set('cities', d));
      geo.marine().then((d) => set('marine', d));
      geo.rivers('50m').then((d) => set('rivers50', d));
      geo.lakes('50m').then((d) => set('lakes50', d));
      geo.peaks().then((d) => set('peaks', d));
      geo.physicalLabels().then((d) => set('physical', d));
      geo.airports().then((d) => set('airports', d));
      geo.ports().then((d) => set('ports', d));
      setReady(true);
    });

    map.on('zoomend', () => setMapZoom(map.getZoom()));
    map.on('moveend', () => ensureDetail(map));

    // hover ------------------------------------------------------------------------------
    let hovered: { source: string; id: string } | null = null;
    const fillLayers = ['a2-fill', 'a1-fill', 'c10-fill', 'c50-fill', 'c110-fill'];
    const pointIds = ['villages', 'peaks', 'airports', 'ports', 'cities', 'capitals'];
    map.on('mousemove', (e: MapMouseEvent) => {
      const pts = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: pointIds.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') });
      const feats = map.queryRenderedFeatures(e.point, { layers: fillLayers.filter((l) => map.getLayer(l)) });
      const f = pickArea(feats, map.getZoom());
      const id = f ? String(f.properties.id) : null;
      if (hovered && (!f || hovered.id !== id)) {
        map.setFeatureState(hovered, { hover: false });
        hovered = null;
      }
      if (f && id) {
        hovered = { source: f.source, id };
        map.setFeatureState(hovered, { hover: true });
      }
      setHover(id);
      map.getCanvas().style.cursor = f || pts.length ? 'pointer' : '';
      if (pts.length) {
        const p = pts[0].properties as Record<string, unknown>;
        const kind = pts[0].layer.id;
        const sub = kind === 'villages' ? `${useAtlas.getState().myDivision === 'parlimen' && p.parlimen_name ? p.parlimen_name : p.district_name}, ${p.state_name}` : kind === 'peaks' && p.elev ? `${p.elev} m` : kind === 'cities' || kind === 'capitals' ? (p.pop ? `~${Number(p.pop).toLocaleString()} (NE est.)` : undefined) : (p.iata as string) || undefined;
        setTip({ x: e.point.x, y: e.point.y, title: String(p.name), sub });
        return;
      }
      if (f) {
        const L = layerRef.current;
        const lvl = f.source === 'admin1' ? 'admin1' : f.source === 'admin2' ? 'admin2' : 'country';
        let sub: string | undefined;
        if (L.indicator) {
          const adm = L.admin.find((a) => a.level === lvl);
          const v = lvl === 'country' ? L.values[id!] : adm?.values[id!];
          const yr = lvl === 'country' ? L.yearUsed : adm?.year;
          sub = v === undefined ? `${indicatorName(langRef.current, L.indicator)}: ${t(langRef.current, 'dataNotAvailable')}` : `${indicatorName(langRef.current, L.indicator)} ${yr}: ${formatValue(v, L.indicator, langRef.current, { compact: true })}`;
        }
        setTip({ x: e.point.x, y: e.point.y, title: String(f.properties.name), sub, id: id!, level: lvl });
      } else setTip(null);
    });
    map.on('mouseout', () => { setTip(null); if (hovered) map.setFeatureState(hovered, { hover: false }); hovered = null; setHover(null); });

    // click --------------------------------------------------------------------------------
    map.on('click', (e: MapMouseEvent) => {
      const pts = map.queryRenderedFeatures([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers: pointIds.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') });
      if (pts.length) {
        const f = pts[0];
        const p = f.properties as Record<string, unknown>;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        if (f.layer.id === 'villages') {
          // no village-level statistics exist: select the enclosing district (or state) and show the point
          const cat = useAtlas.getState().catalog!;
          const c = cat.countries.MYS;
          const byParlimen = useAtlas.getState().myDivision === 'parlimen' && p.parlimen;
          const did = String(byParlimen ? p.parlimen : p.district);
          const sid = String(p.state);
          const isState = did === sid;
          select({ id: did, level: isState ? 'admin1' : 'admin2', name: String(isState ? p.state_name : byParlimen ? p.parlimen_name : p.district_name), countryId: 'MYS', parents: ['WORLD', ...(c?.continent_id ? [c.continent_id] : []), 'MYS', ...(isState ? [] : [sid])] });
          setPoint({ kind: 'village', name: String(p.name), lon, lat, countryId: 'MYS', props: p });
          return;
        }
        const kind = f.layer.id === 'capitals' || f.layer.id === 'cities' ? 'city' : f.layer.id === 'peaks' ? 'peak' : f.layer.id === 'airports' ? 'airport' : 'port';
        setPoint({ kind, name: String(p.name), lon, lat, countryId: (p.country as string) ?? null, props: p });
        return;
      }
      const feats = map.queryRenderedFeatures(e.point, { layers: fillLayers.filter((l) => map.getLayer(l)) });
      const f = pickArea(feats, map.getZoom());
      if (!f) return;
      const id = String(f.properties.id);
      const cat = useAtlas.getState().catalog!;
      if (f.source === 'admin1' || f.source === 'admin2') {
        const cid = String(f.properties.country);
        const c = cat.countries[cid];
        const parents = ['WORLD', ...(c?.continent_id ? [c.continent_id] : []), cid, ...(f.source === 'admin2' ? [String(f.properties.state)] : [])];
        select({ id, level: f.source, name: String(f.properties.name), countryId: cid, parents });
      } else {
        const c = cat.countries[id];
        select({ id, level: 'country', name: c?.name ?? String(f.properties.name), countryId: id, parents: ['WORLD', ...(c?.continent_id ? [c.continent_id] : [])] }, c && bboxOk(c.bbox) ? { bbox: c.bbox } : { center: c?.label, zoom: 3 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapHandle.map = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Area under the cursor: prefer the finest level that is meaningful at this zoom.
  function pickArea(feats: MapGeoJSONFeature[], zoom: number): MapGeoJSONFeature | null {
    const sel = selRef.current;
    const a2 = feats.find((f) => f.source === 'admin2');
    const a1 = feats.find((f) => f.source === 'admin1');
    const c = feats.find((f) => f.source.startsWith('c'));
    const inSelectedCountry = (f?: MapGeoJSONFeature) => f && sel && (sel.countryId === f.properties.country);
    if (a2 && (zoom >= 6.3 || (inSelectedCountry(a2) && (sel!.level === 'admin1' || sel!.level === 'admin2')))) return a2;
    if (a1 && (zoom >= 4.6 || inSelectedCountry(a1))) return a1;
    return c ?? null;
  }

  // Load finer geometry and admin layers for what is in view (LOD by zoom).
  async function ensureDetail(map: MlMap) {
    const z = map.getZoom();
    const L = loaded.current;
    const set = (id: string, d: FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(d);
    if (z >= 4.2 && !L.c10) {
      L.c10 = true;
      geo.world('10m').then((d) => {
        set('c10', d);
        for (const id of ['c50-fill', 'c50-line', 'c50-hover', 'c50-sel']) map.setLayerZoomRange(id, 2.6, 5);
        applyChoropleth();
      });
    }
    if (z >= 9.5 && useAtlas.getState().overlays.villages) {
      const b = map.getBounds();
      villagesInView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]).then((d) => { if (d) set('villages', d); });
    }
    if (z >= 4.2 && !L.rivers10) { L.rivers10 = true; geo.rivers('10m').then((d) => set('rivers10', d)); }
    if (z >= 4.2 && !L.lakes10) { L.lakes10 = true; geo.lakes('10m').then((d) => set('lakes10', d)); }
    if (z >= 3.6) {
      const b = map.getBounds();
      const cat = useAtlas.getState().catalog!;
      const center = map.getCenter();
      const inView = cat.countryList
        .filter((c) => c.admin1 && bboxOk(c.bbox) && c.bbox[0] < b.getEast() && c.bbox[2] > b.getWest() && c.bbox[1] < b.getNorth() && c.bbox[3] > b.getSouth())
        .sort((a, bb) => Math.hypot(a.label[0] - center.lng, a.label[1] - center.lat) - Math.hypot(bb.label[0] - center.lng, bb.label[1] - center.lat))
        .slice(0, z >= 5 ? 10 : 5);
      await Promise.all(inView.map((c) => loadAdmin(map, c.id)));
    }
  }

  /** Malaysia below state level: districts or parliamentary constituencies, per the division switch. */
  async function loadMyDivision(map: MlMap): Promise<Feature[]> {
    const L = loaded.current;
    const division = useAtlas.getState().myDivision;
    const [fc2, prof] = await Promise.all([geo.admin2('MYS', division), profiles.admin('MYS', division)]);
    L.admin2.set('MYS', fc2.features);
    appliedStates.current.admin2.clear();
    (map.getSource('admin2') as GeoJSONSource).setData({ type: 'FeatureCollection', features: fc2.features });
    return (prof?.admin2 ?? []).map((u) => ({ type: 'Feature', properties: { name: u.name, level: 'admin2', id: u.id }, geometry: { type: 'Point', coordinates: u.label } }) as Feature);
  }

  async function loadAdmin(map: MlMap, countryId: string) {
    const L = loaded.current;
    if (L.admin1.has(countryId)) return;
    L.admin1.set(countryId, []);
    try {
      const [fc, prof] = await Promise.all([geo.admin1(countryId), profiles.admin(countryId)]);
      L.admin1.set(countryId, fc.features);
      (map.getSource('admin1') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...L.admin1.values()].flat() });
      const labels: Feature[] = (prof?.admin1 ?? []).map((u) => ({ type: 'Feature', properties: { name: u.name, level: 'admin1', id: u.id }, geometry: { type: 'Point', coordinates: u.label } }));
      if (countryId === 'MYS') labels.push(...(await loadMyDivision(map)));
      L.labels.set(countryId, labels);
      (map.getSource('admin-labels') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...L.labels.values()].flat() });
      applyChoropleth();
    } catch {
      L.admin1.delete(countryId);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // choropleth via feature-state
  // ---------------------------------------------------------------------------------------------
  function applyChoropleth() {
    const map = mapRef.current;
    if (!map || !map.getSource('c50')) return;
    const L = layerRef.current;
    const th = useAtlas.getState().theme;
    const cat = useAtlas.getState().catalog!;
    const sel = useAtlas.getState().selection;
    const rf = useAtlas.getState().regionFilter ?? (sel && (sel.level === 'continent' || sel.level === 'subregion') ? sel.id : null);
    const members = rf ? new Set(cat.regions[rf]?.members ?? []) : null;
    const cls = L.classification;
    const prev = appliedStates.current;
    const ids = cat.countryList.map((c) => c.id);
    for (const s of COUNTRY_SOURCES) {
      if (s === 'c10' && !loaded.current.c10) continue;
      for (const id of ids) {
        const v = L.values[id];
        const state: Record<string, unknown> = { dim: members ? !members.has(id) : false };
        state.c = L.indicator ? (v === undefined || !cls ? -1 : classIndex(cls, v)) : null;
        map.setFeatureState({ source: s, id }, state);
      }
    }
    prev.countries = new Set(ids);
    const colors = L.indicator && cls ? cls.colors : null;
    for (const s of COUNTRY_SOURCES) map.setPaintProperty(`${s}-fill`, 'fill-color', fillColorExpr(th, colors));
    // Malaysia states / districts (OpenDOSM)
    for (const lvl of ['admin1', 'admin2'] as const) {
      const a = L.admin.find((x) => x.level === lvl);
      const feats = [...(lvl === 'admin1' ? loaded.current.admin1 : loaded.current.admin2).values()].flat();
      for (const f of feats) {
        const id = String(f.properties?.id);
        const v = a?.values[id];
        const on = Boolean(a && L.indicator && f.properties?.country === 'MYS');
        map.setFeatureState({ source: lvl, id }, { choro: on && v !== undefined, c: on && v !== undefined && a!.classification ? classIndex(a!.classification, v) : null });
      }
      map.setPaintProperty(lvl === 'admin1' ? 'a1-fill' : 'a2-fill', 'fill-color', fillColorExpr(th, a?.classification?.colors ?? null));
    }
  }

  useEffect(() => { if (ready) applyChoropleth(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, layer, regionFilter, theme, selection?.id]);

  // theme --------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const c = mapColors(theme);
    for (const [id, prop, fn] of THEME_PAINT) if (map.getLayer(id)) map.setPaintProperty(id, prop as never, fn(c) as never);
    const st = streetBasemap(theme);
    const src = map.getSource('bm-street') as unknown as { setTiles?: (t: string[]) => void };
    src?.setTiles?.(st.tiles);
    map.setSky({ 'sky-color': theme === 'dark' ? '#061020' : '#bcd6f0', 'horizon-color': theme === 'dark' ? '#123056' : '#e7f0f9', 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] });
  }, [theme, ready]);

  // Malaysia division switch: swap districts ⇄ constituencies in place ---------------------------
  const myDivision = useAtlas((st) => st.myDivision);
  const divisionRef = useRef(myDivision);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || divisionRef.current === myDivision) return;
    divisionRef.current = myDivision;
    if (!loaded.current.admin2.has('MYS')) return; // not loaded yet: loadAdmin picks the right division
    loadMyDivision(map).then((labels) => {
      const L = loaded.current;
      const a1 = (L.labels.get('MYS') ?? []).filter((f) => f.properties?.level === 'admin1');
      L.labels.set('MYS', [...a1, ...labels]);
      (map.getSource('admin-labels') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...L.labels.values()].flat() });
      applyChoropleth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDivision, ready]);

  // basemap ------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const b of ['satellite', 'terrain']) map.setLayoutProperty(`bm-${b}`, 'visibility', basemap === b ? 'visible' : 'none');
    // the statistical map fades the street map in at village zoom, so street names show without switching basemap
    const deep = basemap === 'statistical';
    const streetOn = basemap === 'street' || deep;
    for (const id of ['bm-street', 'bm-street-ref']) {
      map.setLayoutProperty(id, 'visibility', streetOn && (id === 'bm-street' || theme === 'dark') ? 'visible' : 'none');
      map.setLayerZoomRange(id, deep ? 9.5 : 0, 24);
      map.setPaintProperty(id, 'raster-opacity', deep ? ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11, 1] : 1);
    }
    const raster = basemap !== 'statistical';
    const L = layerRef.current;
    const base = raster ? (L.indicator ? 0.62 : 0) : 1;
    for (const s of COUNTRY_SOURCES) map.setPaintProperty(`${s}-fill`, 'fill-opacity', fillOpacityExpr(base));
    map.setPaintProperty('background', 'background-opacity', raster ? 0 : 1);
    for (const id of ['lakes50', 'lakes10']) map.setLayoutProperty(id, 'visibility', raster ? 'none' : useAtlas.getState().overlays.lakes ? 'visible' : 'none');
  }, [basemap, ready, layer.indicator, theme]);

  // overlays -----------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const L = loaded.current;
    if (overlays.roads && !L.roads) { L.roads = true; geo.roads().then((d) => (map.getSource('roads') as GeoJSONSource).setData(d)); }
    if (overlays.urban && !L.urban) { L.urban = true; geo.urban().then((d) => (map.getSource('urban') as GeoJSONSource).setData(d)); }
    for (const [k, ids] of Object.entries(OVERLAY_LAYERS) as Array<[OverlayKey, string[]]>) {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', overlays[k] && !(basemap !== 'statistical' && (k === 'lakes')) ? 'visible' : 'none');
    }
  }, [overlays, ready, basemap]);

  // globe / mercator ------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setProjection({ type: globe ? 'globe' : 'mercator' });
  }, [globe, ready]);

  // selection outline + admin loading ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = selection?.id ?? '';
    const lvl = selection?.level;
    for (const s of COUNTRY_SOURCES) map.setFilter(`${s}-sel`, ['==', ['get', 'id'], lvl === 'country' ? id : '']);
    map.setFilter('a1-sel', ['==', ['get', 'id'], lvl === 'admin1' ? id : '']);
    map.setFilter('a2-sel', ['==', ['get', 'id'], lvl === 'admin2' ? id : '']);
    if (selection?.countryId) loadAdmin(map, selection.countryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, ready]);

  // hover outline synced from other components (rankings, lists) -----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = hoverId ?? '';
    for (const s of COUNTRY_SOURCES) map.setFilter(`${s}-hover`, ['==', ['get', 'id'], id]);
    map.setFilter('a1-hover', ['==', ['get', 'id'], id]);
    map.setFilter('a2-hover', ['==', ['get', 'id'], id]);
  }, [hoverId, ready]);

  // fly requests ---------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fly) return;
    // on a phone the bottom sheet covers the lower part of the map: keep the target above it
    const st = useAtlas.getState();
    const sheetPx = isPhone() && st.rightOpen ? Math.round(map.getContainer().clientHeight * 0.44) : 0;
    const pad = { top: 60, bottom: 60 + sheetPx, left: 40, right: 40 };
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 }); // flyTo padding persists on the camera; never let it stack
    if (fly.bbox && bboxOk(fly.bbox)) map.fitBounds([[fly.bbox[0], fly.bbox[1]], [fly.bbox[2], fly.bbox[3]]], { padding: pad, maxZoom: fly.zoom ?? 7.5, duration: 1400, essential: true });
    else if (fly.center) map.flyTo({ center: fly.center, zoom: fly.zoom ?? Math.max(map.getZoom(), 4), duration: 1400, essential: true, padding: { top: 0, left: 0, right: 0, bottom: sheetPx } });
  }, [fly, ready]);

  // landmark markers -----------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !catalog) return;
    for (const m of markers.current) m.remove();
    markers.current = [];
    if (!overlays.landmarks) return;
    const emoji = Object.fromEntries(catalog.landmarkCategories.map((c) => [c.id, c.emoji]));
    const list = landmarks.filter((l) => !landmarkFilter || l.categories.includes(landmarkFilter)).slice(0, 80);
    for (const lm of list) {
      const node = document.createElement('button');
      node.className = 'lm-marker';
      node.type = 'button';
      node.title = lm.name;
      node.setAttribute('aria-label', lm.name);
      node.textContent = emoji[lm.categories[0]] ?? '📍';
      node.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setPoint({ kind: 'landmark', name: lm.name, lon: lm.coord[0], lat: lm.coord[1], landmark: lm, countryId: selRef.current?.countryId ?? null });
      });
      markers.current.push(new Marker({ element: node }).setLngLat(lm.coord).addTo(map));
    }
  }, [landmarks, landmarkFilter, overlays.landmarks, ready, catalog, setPoint]);

  // selected point marker --------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    pointMarker.current?.remove();
    pointMarker.current = null;
    if (!map || !ready || !point) return;
    const node = document.createElement('div');
    node.className = `pt-marker ${point.kind === 'event' ? 'pt-event' : ''}`;
    pointMarker.current = new Marker({ element: node }).setLngLat([point.lon, point.lat]).addTo(map);
    const b = map.getBounds();
    if (map.isMoving()) return; // a fly request (e.g. from search) is already taking us there
    if (!b.contains([point.lon, point.lat]) || map.getZoom() < 4) map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), point.kind === 'event' ? 5 : 7), duration: 1200 });
  }, [point, ready]);

  const legendFor = useMemo(() => tip, [tip]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="application" aria-label="World map" />
      {legendFor && (
        <div className="map-tip" style={{ left: legendFor.x + 14, top: legendFor.y + 14 }}>
          <div className="map-tip-title">{legendFor.title}</div>
          {legendFor.sub && <div className="map-tip-sub">{legendFor.sub}</div>}
          {legendFor.sub && layer.quality && legendFor.level === 'country' && layer.indicator && layer.values[legendFor.id ?? ''] !== undefined && <QualityBadge q={layer.quality} small />}
        </div>
      )}
      {!ready && <div className="map-loading">{t(lang, 'loading')}</div>}
    </div>
  );
}

export function geoRefFromCountry(id: string, name: string, continentId: string | null): GeoRef {
  return { id, level: 'country', name, countryId: id, parents: ['WORLD', ...(continentId ? [continentId] : [])] };
}

export type { Theme };
