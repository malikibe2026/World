import { useEffect, useState } from 'react';
import { useAtlas } from './store/atlas';
import { loadCatalog } from './services/catalog';
import { findById, loadSearchIndex } from './services/search';
import { MapView } from './maps/MapView';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LocationPanel } from './components/panel/LocationPanel';
import { Dashboard } from './components/Dashboard';
import { Legend } from './components/Legend';
import { DownloadModal } from './components/DownloadModal';
import { QualityPage, SourcesPage } from './pages/SourcesPage';
import { countryRef, regionBBox, regionRef } from './utils/geoRefs';
import { QualityBadge } from './components/QualityBadge';
import { ESTIMATE_LAST_YEAR } from './store/atlas';
import { t } from './utils/i18n';

export function App() {
  const { catalog, setCatalog, modal, leftOpen, rightOpen, lang, theme, year, togglePanel, select } = useAtlas();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.lang = lang;
  }, [theme, lang]);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, [setCatalog]);

  // deep link: ?geo=MYS | UN_935 | MY-10 | MY-10-hulu-langat
  useEffect(() => {
    if (!catalog) return;
    const id = new URL(location.href).searchParams.get('geo');
    if (!id) return;
    if (id === 'WORLD' || id.startsWith('UN_')) select(regionRef(catalog, id, lang), { bbox: regionBBox(catalog, id) });
    else if (catalog.countries[id]) select(countryRef(catalog, id), { bbox: catalog.countries[id].bbox });
    else loadSearchIndex().then(() => {
      const e = findById(id);
      if (e && (e.type === 'admin1' || e.type === 'admin2')) select({ id: e.id, level: e.type, name: e.name, countryId: e.country, parents: e.parents }, { center: [e.lon!, e.lat!], zoom: e.type === 'admin1' ? 6 : 8.5 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  if (error) return <div className="boot boot-error">WorldStat Atlas could not load its data catalogue: {error}</div>;
  if (!catalog) return <div className="boot"><div className="boot-globe" aria-hidden="true" /> WorldStat Atlas…</div>;

  return (
    <div className={`app ${leftOpen ? 'left-open' : 'left-closed'} ${rightOpen ? 'right-open' : 'right-closed'}`}>
      <Header />
      <div className="main">
        {leftOpen && <Sidebar />}
        <div className="center">
          <div className="map-area">
            <MapView />
            <div className="map-overlay top-left">
              <div className="year-chip">
                <span className="year-chip-y">{year}</span>
                <QualityBadge q={year > ESTIMATE_LAST_YEAR ? 'PROJECTION' : 'ESTIMATE'} small />
              </div>
            </div>
            <div className="map-overlay bottom-left"><Legend /></div>
            <button className="panel-toggle left hide-narrow" onClick={() => togglePanel('left')} aria-label={t(lang, 'layers')} aria-expanded={leftOpen}>{leftOpen ? '‹' : '›'}</button>
            <button className="panel-toggle right hide-narrow" onClick={() => togglePanel('right')} aria-label="Location panel" aria-expanded={rightOpen}>{rightOpen ? '›' : '‹'}</button>
          </div>
          <Dashboard />
        </div>
        {rightOpen && (
          <aside className="panel" aria-label="Location intelligence">
            <LocationPanel />
          </aside>
        )}
      </div>
      {modal === 'download' && <DownloadModal />}
      {modal === 'sources' && <SourcesPage />}
      {modal === 'quality' && <QualityPage />}
    </div>
  );
}
