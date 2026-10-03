import { useAtlas } from '../store/atlas';
import { t } from '../utils/i18n';

export function Header() {
  const { lang, setLang, theme, setTheme, setModal, compare, setDashTab, togglePanel, leftOpen, rightOpen } = useAtlas();
  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };
  return (
    <header className="topbar">
      <button className="icon-btn only-narrow" onClick={() => togglePanel('left')} aria-expanded={leftOpen} aria-label={t(lang, 'layers')}>☰</button>
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3987e5" /><stop offset="1" stopColor="#104281" /></linearGradient></defs><circle cx="32" cy="32" r="28" fill="url(#bm)" /><g fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2.6"><ellipse cx="32" cy="32" rx="12" ry="28" /><path d="M4 32h56M9 18h46M9 46h46" /></g></svg>
        <div>
          <div className="brand-name">WORLDSTAT <span>ATLAS</span></div>
          <div className="brand-tag">{t(lang, 'appTagline')}</div>
        </div>
      </div>
      {!leftOpen && <button className="btn btn-ghost hide-narrow" onClick={() => { togglePanel('left', true); setTimeout(() => document.querySelector<HTMLInputElement>('.sb-search input')?.focus(), 60); }}>⌕ {lang === 'ms' ? 'Cari' : 'Search'}</button>}
      <nav className="top-actions" aria-label="Actions">
        <button className="btn btn-ghost" onClick={() => setDashTab('compare')} aria-label={t(lang, 'compare')}>⇆ <span className="lbl">{t(lang, 'compare')}</span>{compare.length ? <span className="badge">{compare.length}</span> : null}</button>
        <button className="btn btn-primary" onClick={() => setModal('download')} aria-label={t(lang, 'download')}>⤓ <span className="lbl">{t(lang, 'download').toUpperCase()}</span></button>
        <button className="btn btn-ghost hide-narrow" onClick={() => setModal('sources')}>{t(lang, 'sources')}</button>
        <button className="btn btn-ghost hide-narrow" onClick={() => setModal('quality')}>{t(lang, 'dataQuality')}</button>
        <div className="seg seg-xs" role="radiogroup" aria-label={t(lang, 'language')}>
          <button role="radio" aria-checked={lang === 'ms'} className={lang === 'ms' ? 'on' : ''} onClick={() => setLang('ms')}>BM</button>
          <button role="radio" aria-checked={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`${t(lang, 'theme')}: ${theme === 'dark' ? t(lang, 'light') : t(lang, 'dark')}`} title={t(lang, 'theme')}>{theme === 'dark' ? '☀' : '☾'}</button>
        <button className="icon-btn hide-narrow" onClick={fullscreen} aria-label={t(lang, 'fullscreen')} title={t(lang, 'fullscreen')}>⛶</button>
        <button className="icon-btn only-narrow" onClick={() => togglePanel('right')} aria-expanded={rightOpen} aria-label="Location panel">ⓘ</button>
      </nav>
    </header>
  );
}
