import { create } from 'zustand';
import type { GeoRef, Lang, Landmark, Theme } from '../types';
import type { Catalog } from '../services/catalog';
import { isParlimen, type MyDivision } from '../utils/geoRefs';
import { profiles } from '../services/geo';

export type Basemap = 'statistical' | 'street' | 'satellite' | 'terrain';
export type OverlayKey =
  | 'admin1' | 'admin2' | 'capitals' | 'cities' | 'rivers' | 'lakes' | 'peaks' | 'physical' | 'seas'
  | 'roads' | 'urban' | 'airports' | 'ports' | 'landmarks' | 'elevation' | 'villages';
export type Modal = null | 'sources' | 'quality' | 'compare' | 'download' | 'about';
export type DashTab = 'overview' | 'population' | 'vital' | 'economy' | 'tourism' | 'geography' | 'history' | 'ranking' | 'compare';

export interface PointSelection {
  kind: 'landmark' | 'city' | 'town' | 'village' | 'peak' | 'airport' | 'port' | 'sea' | 'physical' | 'event';
  name: string;
  lon: number;
  lat: number;
  countryId?: string | null;
  landmark?: Landmark;
  props?: Record<string, unknown>;
}

export interface FlyRequest { nonce: number; bbox?: [number, number, number, number]; center?: [number, number]; zoom?: number }

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`wsa.${k}`);
      return v === null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`wsa.${k}`, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const savedTheme = (() => {
  try {
    const t = localStorage.getItem('wsa.theme');
    return t === 'light' || t === 'dark' ? (t as Theme) : null;
  } catch {
    return null;
  }
})();

export const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  admin1: true, admin2: true, capitals: true, cities: true, rivers: true, lakes: true, peaks: false, physical: false, seas: true,
  roads: false, urban: false, airports: false, ports: false, landmarks: true, elevation: false, villages: true,
};

export const ESTIMATE_LAST_YEAR = 2024;
export const MIN_YEAR = 1950;
export const MAX_YEAR = 2100;

interface AtlasState {
  lang: Lang;
  theme: Theme;
  catalog: Catalog | null;
  selection: GeoRef | null;
  point: PointSelection | null;
  hoverId: string | null;
  year: number;
  projection: boolean;
  playing: boolean;
  layer: string | null;
  basemap: Basemap;
  globe: boolean;
  overlays: Record<OverlayKey, boolean>;
  regionFilter: string | null;
  /** Malaysia below state level: districts or parliamentary constituencies */
  myDivision: MyDivision;
  compare: GeoRef[];
  modal: Modal;
  dashTab: DashTab;
  leftOpen: boolean;
  rightOpen: boolean;
  dashOpen: boolean;
  fly: FlyRequest | null;
  landmarks: Landmark[];
  landmarkFilter: string | null;
  mapZoom: number;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setCatalog: (c: Catalog) => void;
  select: (g: GeoRef | null, fly?: Omit<FlyRequest, 'nonce'>) => void;
  setPoint: (p: PointSelection | null) => void;
  setHover: (id: string | null) => void;
  setYear: (y: number) => void;
  setProjection: (on: boolean) => void;
  setPlaying: (on: boolean) => void;
  setLayer: (code: string | null) => void;
  setBasemap: (b: Basemap) => void;
  setGlobe: (on: boolean) => void;
  toggleOverlay: (k: OverlayKey) => void;
  setRegionFilter: (id: string | null) => void;
  setMyDivision: (d: MyDivision) => void;
  addCompare: (g: GeoRef) => void;
  removeCompare: (id: string) => void;
  clearCompare: () => void;
  setModal: (m: Modal) => void;
  setDashTab: (t: DashTab) => void;
  togglePanel: (p: 'left' | 'right' | 'dash', open?: boolean) => void;
  flyTo: (f: Omit<FlyRequest, 'nonce'>) => void;
  setLandmarks: (l: Landmark[]) => void;
  setLandmarkFilter: (c: string | null) => void;
  setMapZoom: (z: number) => void;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  lang: store.get<Lang>('lang', 'ms'),
  theme: savedTheme ?? (prefersDark() ? 'dark' : 'light'),
  catalog: null,
  selection: null,
  point: null,
  hoverId: null,
  year: ESTIMATE_LAST_YEAR,
  projection: false,
  playing: false,
  layer: store.get<string | null>('layer', 'population'),
  basemap: store.get<Basemap>('basemap', 'statistical'),
  globe: store.get<boolean>('globe', true),
  overlays: { ...DEFAULT_OVERLAYS, ...store.get<Partial<Record<OverlayKey, boolean>>>('overlays', {}) },
  regionFilter: null,
  myDivision: store.get<MyDivision>('myDivision', 'district'),
  compare: [],
  modal: null,
  dashTab: 'overview',
  leftOpen: typeof window === 'undefined' || window.innerWidth > 900,
  rightOpen: typeof window === 'undefined' || window.innerWidth > 900,
  dashOpen: typeof window === 'undefined' || window.innerHeight > 760,
  fly: null,
  landmarks: [],
  landmarkFilter: null,
  mapZoom: 1.6,
  setLang: (lang) => { store.set('lang', lang); document.documentElement.lang = lang; set({ lang }); },
  setTheme: (theme) => {
    try { localStorage.setItem('wsa.theme', theme); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setCatalog: (catalog) => set({ catalog }),
  select: (selection, fly) => {
    set({ selection, point: null, rightOpen: true, landmarkFilter: null });
    if (selection?.level === 'admin2' && selection.countryId === 'MYS') {
      const d: MyDivision = isParlimen(selection.id) ? 'parlimen' : 'district';
      if (d !== get().myDivision) { store.set('myDivision', d); set({ myDivision: d }); }
    }
    if (selection?.level !== get().selection?.level) set({ dashTab: get().dashTab });
    if (fly) get().flyTo(fly);
    const url = new URL(location.href);
    if (selection) url.searchParams.set('geo', selection.id); else url.searchParams.delete('geo');
    history.replaceState(null, '', url);
  },
  setPoint: (point) => set({ point, rightOpen: point ? true : get().rightOpen }),
  setHover: (hoverId) => set({ hoverId }),
  setYear: (year) => set({ year }),
  setProjection: (projection) => set((s) => ({ projection, year: projection ? s.year : Math.min(s.year, ESTIMATE_LAST_YEAR) })),
  setPlaying: (playing) => set({ playing }),
  setLayer: (layer) => { store.set('layer', layer); set({ layer }); },
  setBasemap: (basemap) => { store.set('basemap', basemap); set({ basemap }); },
  setGlobe: (globe) => { store.set('globe', globe); set({ globe }); },
  toggleOverlay: (k) => set((s) => { const overlays = { ...s.overlays, [k]: !s.overlays[k] }; store.set('overlays', overlays); return { overlays }; }),
  setRegionFilter: (regionFilter) => set({ regionFilter }),
  setMyDivision: (myDivision) => {
    store.set('myDivision', myDivision);
    const sel = get().selection;
    set({ myDivision });
    // a district stays meaningful only in district view (and a constituency only in parlimen view): step up to its state
    if (sel?.level === 'admin2' && sel.countryId === 'MYS' && isParlimen(sel.id) !== (myDivision === 'parlimen')) {
      const stateId = sel.parents[sel.parents.length - 1];
      const parents = sel.parents.slice(0, -1);
      profiles.admin('MYS').then((d) => get().select({ id: stateId, level: 'admin1', name: d?.admin1.find((u) => u.id === stateId)?.name ?? stateId, countryId: 'MYS', parents }));
    }
  },
  addCompare: (g) => set((s) => (s.compare.some((c) => c.id === g.id) || s.compare.length >= 6 ? s : { compare: [...s.compare, g] })),
  removeCompare: (id) => set((s) => ({ compare: s.compare.filter((c) => c.id !== id) })),
  clearCompare: () => set({ compare: [] }),
  setModal: (modal) => set({ modal }),
  setDashTab: (dashTab) => set({ dashTab, dashOpen: true }),
  togglePanel: (p, open) => set((s) => {
    const key = p === 'left' ? 'leftOpen' : p === 'right' ? 'rightOpen' : 'dashOpen';
    return { [key]: open ?? !s[key] } as Partial<AtlasState>;
  }),
  flyTo: (f) => set({ fly: { ...f, nonce: Date.now() + Math.random() } }),
  setLandmarks: (landmarks) => set({ landmarks }),
  setLandmarkFilter: (landmarkFilter) => set({ landmarkFilter }),
  setMapZoom: (mapZoom) => set({ mapZoom }),
}));
