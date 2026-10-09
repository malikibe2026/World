/* WorldStat Atlas service worker. Generated at build time from src/pwa/sw-template.js
 * (vite.config.ts fills in BUILD and PRECACHE). Strategy:
 *   - page (navigation): network first, so an online open always gets the latest deploy;
 *     the cached page is the offline fallback
 *   - app code (/assets, hashed) and shell files: precached, cache first
 *   - data (/data/*?v=<build>) and map glyphs (/fonts): cache first, filled on demand; data URLs
 *     carry the build id, so a new deploy never reads an old answer
 *   - other origins (map tiles, World Bank, Wikidata): not handled, the browser decides
 * Each deploy has its own caches; activating a new worker deletes the old ones. */
const BUILD = __BUILD_ID__;
const PRECACHE = __PRECACHE__;
const SHELL = `wsa-shell-${BUILD}`;
const DATA = `wsa-data-${BUILD}`;
const scope = new URL(self.registration.scope);
const abs = (p) => new URL(p, scope).href;
const PRECACHED = new Set(PRECACHE.map(abs));

self.addEventListener('install', (event) => {
  // the first install takes control at once; an update waits until the page asks (SKIP_WAITING)
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map(abs))));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('wsa-') && k !== SHELL && k !== DATA).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }
  const path = url.pathname.slice(scope.pathname.length);
  if (path.startsWith('assets/') || PRECACHED.has(url.href)) event.respondWith(cacheFirst(req, SHELL));
  else if (path.startsWith('data/') || path.startsWith('fonts/')) event.respondWith(cacheFirst(req, DATA));
});

async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL)).put(abs('./'), res.clone());
    return res;
  } catch {
    return (await caches.match(abs('./'))) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
