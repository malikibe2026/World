import { useAtlas } from '../store/atlas';
import { useAsync } from '../hooks/useAsync';
import { profiles } from '../services/geo';
import { countryRef, isParlimen, regionBBox, regionRef } from '../utils/geoRefs';
import type { GeoRef } from '../types';

/** WORLD › Asia › Malaysia › Selangor › Hulu Langat › Kajang */
export function Breadcrumb() {
  const { selection, point, catalog, lang, select, setPoint } = useAtlas();
  const countryId = selection?.countryId ?? null;
  const division = isParlimen(selection?.id) ? 'parlimen' : 'district';
  const admin = useAsync(() => (countryId ? profiles.admin(countryId, division) : Promise.resolve(null)), [countryId, division]);
  if (!catalog || !selection) return null;
  const chain: GeoRef[] = [];
  for (const id of [...selection.parents, selection.id]) {
    if (id === 'WORLD' || id.startsWith('UN_')) chain.push(regionRef(catalog, id, lang));
    else if (catalog.countries[id]) chain.push(countryRef(catalog, id));
    else {
      const u = admin.data?.admin1.find((a) => a.id === id) ?? admin.data?.admin2?.find((a) => a.id === id);
      chain.push(id === selection.id ? selection : { id, level: u?.level ?? 'admin1', name: u?.name ?? id, countryId, parents: chain.map((c) => c.id) });
    }
  }
  const go = (g: GeoRef) => {
    if (g.id === selection.id && !point) return;
    if (g.level === 'world' || g.level === 'continent' || g.level === 'subregion') select(g, { bbox: regionBBox(catalog, g.id) });
    else if (g.level === 'country') select(g, { bbox: catalog.countries[g.id]?.bbox });
    else {
      const u = admin.data?.admin1.find((a) => a.id === g.id) ?? admin.data?.admin2?.find((a) => a.id === g.id);
      select({ ...g, parents: chain.slice(0, chain.findIndex((c) => c.id === g.id)).map((c) => c.id) }, u ? { bbox: u.bbox } : undefined);
    }
    setPoint(null);
  };
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {chain.map((g, i) => (
          <li key={g.id}>
            {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
            <button className={`crumb ${i === chain.length - 1 && !point ? 'current' : ''}`} onClick={() => go(g)} aria-current={i === chain.length - 1 && !point ? 'page' : undefined}>
              {g.level === 'world' ? (lang === 'ms' ? 'DUNIA' : 'WORLD') : g.name}
            </button>
          </li>
        ))}
        {point && (
          <li>
            <span className="crumb-sep" aria-hidden="true">›</span>
            <span className="crumb current">{point.name}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
