import { useEffect, useState } from 'react';
import { useAtlas } from '../store/atlas';
import { isIOS, usePwa } from '../pwa/state';

/** Update notice, install invitation (Android / desktop prompt, iPhone steps) and offline chip. */
export function AppBanners() {
  const lang = useAtlas((s) => s.lang);
  const { installEvent, installed, bannerDismissed, updateReady, offline, install, dismissBanner, update } = usePwa();
  const [settled, setSettled] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSettled(true), 8000); return () => clearTimeout(t); }, []); // never on first paint
  const ms = lang === 'ms';
  const ios = isIOS();
  const showInstall = settled && !installed && !bannerDismissed && !updateReady && (installEvent !== null || ios);
  return (
    <>
      {offline && <div className="offline-chip" role="status">● {ms ? 'Luar talian — memaparkan data tersimpan' : 'Offline — showing saved data'}</div>}
      {updateReady && (
        <div className="app-banner" role="status">
          <span>🔄 {ms ? 'Versi baharu dengan data terkini tersedia.' : 'A new version with the latest data is available.'}</span>
          <button className="btn btn-primary" onClick={update}>{ms ? 'Muat semula' : 'Reload'}</button>
        </div>
      )}
      {showInstall && (
        <div className="app-banner" role="dialog" aria-label={ms ? 'Pasang aplikasi' : 'Install app'}>
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={36} height={36} />
          <span>
            <b>{ms ? 'Pasang WorldStat Atlas' : 'Install WorldStat Atlas'}</b>
            <br />
            {installEvent
              ? ms ? 'Buka terus dari skrin utama, berfungsi luar talian dan dikemas kini sendiri.' : 'Open it from your home screen; works offline and updates itself.'
              : ms ? 'Ketik Kongsi ⬆︎ kemudian “Tambah ke Skrin Utama”.' : 'Tap Share ⬆︎ then “Add to Home Screen”.'}
          </span>
          {installEvent && <button className="btn btn-primary" onClick={install}>{ms ? 'Pasang' : 'Install'}</button>}
          <button className="icon-btn" onClick={dismissBanner} aria-label={ms ? 'Tutup' : 'Close'}>×</button>
        </div>
      )}
    </>
  );
}

/** Sidebar entry, for people who closed the banner. */
export function InstallButton() {
  const lang = useAtlas((s) => s.lang);
  const { installEvent, installed, install } = usePwa();
  const [steps, setSteps] = useState(false);
  const ms = lang === 'ms';
  if (installed || (!installEvent && !isIOS())) return null;
  return (
    <div className="install-entry">
      <button className="btn" onClick={() => (installEvent ? install() : setSteps(!steps))}>📲 {ms ? 'Pasang sebagai aplikasi' : 'Install as an app'}</button>
      {steps && <p className="fineprint">{ms ? 'Safari/Chrome di iPhone: ketik Kongsi ⬆︎ → “Tambah ke Skrin Utama” → Tambah.' : 'Safari/Chrome on iPhone: tap Share ⬆︎ → “Add to Home Screen” → Add.'}</p>}
    </div>
  );
}
