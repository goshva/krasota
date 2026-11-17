const VERSION = 3;
const CACHE_NAME = 'krasota-v' + VERSION;

const ASSETS = [
  './','./index.html','./manifest.json','./icons/icon.svg',
  './css/base.css','./css/layout.css','./css/cards.css','./css/controls.css',
  './contacts.js',
  './js/pwa.js','./js/pwa-refresh.js','./js/config.js','./js/utils.js','./js/storage.js','./js/sync.js',
  './js/themes.js','./js/api.js','./js/messages.js','./js/render.js','./js/actions.js',
  './js/ui.js','./js/export.js','./js/voice.js','./js/main.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return Promise.allSettled(ASSETS.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') return self.skipWaiting();
  if (event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (/\/manifest\.json$/.test(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        if (resp.ok && url.origin === self.location.origin) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, copy); });
        }
        return resp;
      }).catch(function () {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
