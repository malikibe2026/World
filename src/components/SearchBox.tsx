import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas } from '../store/atlas';
import { findById, loadSearchIndex, parseQuery, searchLocal } from '../services/search';
import { entityLocation, searchEntities } from '../services/wikidata';
import { indicatorName, t } from '../utils/i18n';
import { countryRef, regionBBox, regionRef } from '../utils/geoRefs';
import type { SearchEntry } from '../types';

const TYPE_ICON: Record<string, string> = { continent: '🌐', country: '🏳️', admin1: '🗺️', admin2: '📍', city: '🏙️', town: '🏘️', peak: '🏔️', physical: '🏝️', sea: '🌊', airport: '✈️', port: '⚓', landmark: '⭐' };

interface WdHit { id: string; label: string; description?: string }

/** Global smart search: locations, landmarks (Wikidata) and statistics ("birth rate Japan"). */
export function SearchBox() {
  const { lang, catalog, select, setPoint, setLayer, flyTo } = useAtlas();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [wd, setWd] = useState<{ q: string; hits: WdHit[]; loading: boolean }>({ q: '', hits: [], loading: false });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const parsed = useMemo(() => parseQuery(q), [q]);
  const results = useMemo(() => (ready && q.trim().length >= 2 ? searchLocal(parsed.locationText || q, 9) : []), [ready, q, parsed]);
  const statInd = parsed.indicator && catalog ? catalog.indicators[parsed.indicator] : null;

  // landmark lookup on Wikidata (debounced) when the query is not a statistic
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || parsed.indicator) { setWd({ q: '', hits: [], loading: false }); return; }
    setWd((w) => ({ ...w, loading: true }));
    const h = setTimeout(() => {
      searchEntities(term, lang).then(
        (hits) => setWd({ q: term, hits: hits.slice(0, 5), loading: false }),
        () => setWd({ q: term, hits: [], loading: false }),
      );
    }, 450);
    return () => clearTimeout(h);
  }, [q, parsed.indicator, lang]);

  const pick = (e: SearchEntry) => {
    if (!catalog) return;
    setOpen(false);
    setQ('');
    if (statInd) setLayer(statInd.layer ? statInd.code : useAtlas.getState().layer);
    if (e.type === 'continent') { select(regionRef(catalog, e.id, lang), { bbox: regionBBox(catalog, e.id) }); return; }
    if (e.type === 'country') { select(countryRef(catalog, e.id), { bbox: catalog.countries[e.id]?.bbox, center: e.lon !== null ? [e.lon, e.lat!] : undefined, zoom: 4 }); return; }
    if (e.type === 'admin1' || e.type === 'admin2') {
      select({ id: e.id, level: e.type, name: e.name, countryId: e.country, parents: e.parents }, { center: [e.lon!, e.lat!], zoom: e.type === 'admin1' ? 6 : 8.5 });
      return;
    }
    // point-like entries select their deepest administrative parent, then show the point card
    const parentId = e.parents[e.parents.length - 1];
    if (parentId && parentId !== 'WORLD' && e.country) {
      const level = parentId === e.country ? 'country' : /-[a-z]/.test(parentId) && parentId.startsWith('MY-') ? 'admin2' : 'admin1';
      if (level === 'country') select(countryRef(catalog, e.country));
      else select({ id: parentId, level, name: findById(parentId)?.name ?? parentId, countryId: e.country, parents: e.parents.slice(0, -1) });
    }
    const kind = e.type === 'town' ? 'town' : e.type === 'city' ? 'city' : e.type === 'peak' ? 'peak' : e.type === 'airport' ? 'airport' : e.type === 'port' ? 'port' : e.type === 'sea' ? 'sea' : 'physical';
    setPoint({ kind, name: e.name, lon: e.lon!, lat: e.lat!, countryId: e.country });
    flyTo({ center: [e.lon!, e.lat!], zoom: e.type === 'sea' ? 4 : 9 });
  };

  const pickWd = async (h: WdHit) => {
    setOpen(false);
    setQ('');
    const loc = await entityLocation(h.id).catch(() => null);
    if (!loc) return;
    const country = loc.countryQid ? catalog?.countryList.find((c) => c.wikidata === loc.countryQid) : undefined;
    setPoint({ kind: 'landmark', name: loc.label, lon: loc.lon, lat: loc.lat, countryId: country?.id ?? null,
      landmark: { id: h.id, name: loc.label, description: loc.description ?? h.description ?? null, coord: [loc.lon, loc.lat], categories: [], sitelinks: 0, image: loc.image, inception: null, wikipedia: loc.wikipedia } });
    flyTo({ center: [loc.lon, loc.lat], zoom: 12 });
  };

  const items = results;
  return (
    <div className={`search ${open ? 'open' : ''}`} role="combobox" aria-expanded={open} aria-haspopup="listbox">
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); if (!ready) loadSearchIndex().then(() => setReady(true)); }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && items[active]) pick(items[active]);
          if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }}
        placeholder={t(lang, 'searchPlaceholder')}
        aria-label={t(lang, 'searchPlaceholder')}
        aria-autocomplete="list"
      />
      {open && q.trim().length >= 2 && (
        <div className="search-pop" role="listbox">
          {!ready && <div className="search-empty">{t(lang, 'loading')}</div>}
          {statInd && (
            <div className="search-group">
              <div className="search-group-title">{t(lang, 'statistics')}</div>
              <div className="search-stat">📊 <b>{indicatorName(lang, statInd)}</b> {items[0] ? <>· {items[0].name}</> : null}
                <span className="muted"> — {lang === 'ms' ? 'pilih lokasi di bawah; lapisan peta akan ditukar' : 'pick a location below; the map layer switches to this indicator'}</span>
              </div>
            </div>
          )}
          {items.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">{t(lang, 'locations')}</div>
              {items.map((e, i) => (
                <button key={e.id} role="option" aria-selected={i === active} className={`search-item ${i === active ? 'active' : ''}`} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} onMouseEnter={() => setActive(i)}>
                  <span className="search-item-icon" aria-hidden="true">{TYPE_ICON[e.type] ?? '•'}</span>
                  <span className="search-item-name">{e.name}</span>
                  <span className="search-item-path">{e.type === 'country' ? (catalog?.countries[e.id]?.subregion ?? '') : e.country ? catalog?.countries[e.country]?.name ?? '' : ''} · {e.type}</span>
                </button>
              ))}
            </div>
          )}
          {!parsed.indicator && (
            <div className="search-group">
              <div className="search-group-title">{t(lang, 'landmarks')} <span className="muted">· Wikidata</span></div>
              {wd.loading && <div className="search-empty">{t(lang, 'searchingWikidata')}</div>}
              {!wd.loading && wd.hits.map((h) => (
                <button key={h.id} className="search-item" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pickWd(h)}>
                  <span className="search-item-icon" aria-hidden="true">⭐</span>
                  <span className="search-item-name">{h.label}</span>
                  <span className="search-item-path">{h.description}</span>
                </button>
              ))}
              {!wd.loading && !wd.hits.length && wd.q && <div className="search-empty">{t(lang, 'noResults')}</div>}
            </div>
          )}
          {ready && !items.length && !statInd && !wd.loading && !wd.hits.length && <div className="search-empty">{t(lang, 'noResults')}</div>}
        </div>
      )}
    </div>
  );
}
