// Service worker registration and update flow (production builds only).
//  - checks for a new deploy when the app returns to the foreground and every hour
//  - a new version found while the app is in the background is applied silently
//  - a new version found while the app is in use is offered (onUpdateReady), never forced
let waiting: ServiceWorker | null = null;

function apply() {
  waiting?.postMessage('SKIP_WAITING');
}

/** Switch to the new version now (the page reloads once the new worker takes over). */
export function applyUpdate() {
  apply();
}

export function registerServiceWorker(onUpdateReady: () => void) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // first install: nothing to reload; an update: load the new version once
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  const ready = (w: ServiceWorker) => {
    waiting = w;
    if (document.visibilityState === 'hidden') apply();
    else onUpdateReady();
  };

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) ready(w);
        });
      });
      const check = () => { reg.update().catch(() => { /* offline: try later */ }); };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
        else if (waiting) apply(); // user left the app: finish the update in the background
      });
    }).catch(() => { /* unsupported or blocked: the site still works online */ });
  });
}
