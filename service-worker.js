const CACHE_NAME = 'krasota-v1';
// Относительные пути — резолвятся от URL самого service-worker.js
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  // перечислите реальные файлы CSS/JS, а не каталоги:
  // './css/layout.css',
  // './css/cards.css',
  // './css/controls.css',
  // './js/app.js',
  // './contacts.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // allSettled: не роняет install, если какой-то файл 404
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((resp) => {
          // кэшируем только успешные same-origin ответы
          if (resp.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => {
          // офлайн-навигация → отдаём index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});