const VERSION = 3;                       // ← должно совпадать с manifest.json.version
const CACHE_NAME = 'krasota-v' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './icons/icon.svg',
  // './css/layout.css', './css/cards.css', './css/controls.css', './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Обмен сообщениями с клиентом ──────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') return self.skipWaiting();
  if (event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

// ── fetch ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // manifest.json — всегда из сети, иначе не увидим новую версию
  if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});