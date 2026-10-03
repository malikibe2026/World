import type { Landmark } from '../../types';
import { useAtlas } from '../../store/atlas';
import { t } from '../../utils/i18n';
import { NotAvailable } from '../NotAvailable';

export function LandmarkList({ items, loading, error, max = 12 }: { items: Landmark[]; loading: boolean; error: Error | null; max?: number }) {
  const { lang, catalog, setPoint, landmarkFilter, setLandmarkFilter } = useAtlas();
  if (!catalog) return null;
  const cats = catalog.landmarkCategories;
  const counts = new Map<string, number>();
  for (const l of items) for (const c of l.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const list = items.filter((l) => !landmarkFilter || l.categories.includes(landmarkFilter)).slice(0, max);
  if (loading && !items.length) return <div className="muted small">{t(lang, 'loading')}</div>;
  if (error && !items.length) return <NotAvailable compact reason={`${t(lang, 'liveSourceFailed')} (Wikidata)`} />;
  if (!items.length) return <NotAvailable compact />;
  return (
    <div>
      <div className="chips" role="toolbar" aria-label={t(lang, 'category')}>
        <button className={`chip ${!landmarkFilter ? 'on' : ''}`} onClick={() => setLandmarkFilter(null)}>{lang === 'ms' ? 'Semua' : 'All'}</button>
        {cats.filter((c) => counts.get(c.id)).map((c) => (
          <button key={c.id} className={`chip ${landmarkFilter === c.id ? 'on' : ''}`} onClick={() => setLandmarkFilter(landmarkFilter === c.id ? null : c.id)}>
            <span aria-hidden="true">{c.emoji}</span> {lang === 'ms' ? c.name_ms : c.name_en} <span className="muted">{counts.get(c.id)}</span>
          </button>
        ))}
      </div>
      <ul className="lm-list">
        {list.map((l) => {
          const cat = cats.find((c) => c.id === l.categories[0]);
          return (
            <li key={l.id}>
              <button className="lm-item" onClick={() => setPoint({ kind: 'landmark', name: l.name, lon: l.coord[0], lat: l.coord[1], landmark: l })}>
                <span className="lm-emoji" aria-hidden="true">{cat?.emoji ?? '📍'}</span>
                <span className="lm-text">
                  <span className="lm-name">{l.name}</span>
                  <span className="lm-desc">{l.description ?? (cat ? (lang === 'ms' ? cat.name_ms : cat.name_en) : '')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">{t(lang, 'wikidataNote')}</p>
    </div>
  );
}
