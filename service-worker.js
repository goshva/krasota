/* Krasota PWA service worker — version is synchronized with manifest.json. */
const VERSION = 7;
const CACHE_NAME = 'krasota-v' + VERSION;
const CACHE_PREFIX = 'krasota-';
const ASSETS = [
  './css/mobile-first.css',
  './', './index.html', './manifest.json', './icons/icon.svg',
  './icons/icon-192x192.png', './icons/icon-512x512.png',
  './css/base.css', './css/layout.css', './css/cards.css', './css/controls.css',
  './contacts.js',
  './js/pwa.js', './js/pwa-refresh.js', './js/config.js', './js/utils.js',
  './js/storage.js', './js/sync.js', './js/themes.js', './js/api.js',
  './js/messages.js', './js/render.js', './js/actions.js', './js/ui.js',
  './js/export.js', './js/voice.js', './js/main.js'

  './css/mobile-layout-fix.css',
  './js/layout-audit.js',];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Force a network read during installation; don't seed the new cache
    // with stale entries from the browser HTTP cache.
    await Promise.allSettled(ASSETS.map((path) => {
      const url = new URL(path, self.registration.scope);
      return fetch(new Request(url.href, { cache: 'reload' })).then((response) => {
        if (response.ok) return cache.put(url.href, response);
        throw new Error('Asset request failed: ' + url.pathname + ' (' + response.status + ')');
      });
    }));
    // Deliberately do NOT call skipWaiting() here. The user confirms via the
    // update banner; SKIP_WAITING is sent only after clicking “Обновить”.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML must be checked against the network so a stale shell cannot trap
  // users on an old release. Offline fallback remains available.
  if (request.mode === 'navigate' || url.pathname.endsWith('/manifest.json')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok && request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('./index.html', self.registration.scope).href, response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match(new URL('./index.html', self.registration.scope).href));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
