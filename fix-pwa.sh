#!/usr/bin/env bash
set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*"; }
err()  { printf "${R}✗${N} %s\n" "$*" >&2; }

[[ -f index.html ]] || { err "index.html не найден — запустите из корня репо"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
backup() { [[ -f "$1" ]] && cp "$1" "$1.bak.$TS" && log "backup: $1.bak.$TS"; }
backup index.html; backup manifest.json; backup service-worker.js

# ── 1. Убрать дублирующийся meta theme-color #000000 ────────────────────────
if grep -q '<meta name="theme-color" content="#000000">' index.html; then
  sed -i '/<meta name="theme-color" content="#000000">/d' index.html
  log "удалён дублирующий meta theme-color #000000"
else
  warn "meta theme-color #000000 не найден (уже убран?)"
fi

# ── 2. apple-touch-icon (если нет) ──────────────────────────────────────────
if ! grep -q 'rel="apple-touch-icon"' index.html; then
  sed -i 's|<link rel="manifest" href="manifest.json">|<link rel="manifest" href="manifest.json">\n<link rel="apple-touch-icon" href="icons/icon-192x192.png">|' index.html
  log "добавлен apple-touch-icon"
fi

# ── 3. js/pwa.js — регистрация SW + проверка версии + баннер ────────────────
mkdir -p js
cat > js/pwa.js << 'PWA_EOF'
/* PWA: регистрация SW, сравнение версий, баннер обновления. */
(function () {
  'use strict';

  var CHECK_MS = 60 * 1000;

  window.updated = window.updated || function (info) {
    console.info('[PWA] v' + info.from + ' → v' + info.to);
    if (document.getElementById('pwa-update-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'pwa-update-banner';
    bar.style.cssText = [
      'position:fixed','left:0','right:0','bottom:0','z-index:99999',
      'background:var(--surface,#fff)','color:var(--text,#111)',
      'padding:12px 16px','font:14px/1.4 Manrope,system-ui,sans-serif',
      'display:flex','justify-content:space-between','align-items:center','gap:12px',
      'box-shadow:0 -2px 12px rgba(0,0,0,.15)',
      'border-top:1px solid var(--line,#ddd)'
    ].join(';');
    bar.innerHTML =
      '<span>Доступна версия v' + info.to + ' (у вас v' + info.from + ').</span>' +
      '<button id="pwa-update-btn" style="background:var(--text,#111);color:var(--bg,#fff);' +
      'border:0;border-radius:10px;padding:8px 14px;cursor:pointer;' +
      'font:inherit;font-weight:700">Обновить</button>';
    document.body.appendChild(bar);
    document.getElementById('pwa-update-btn').onclick = function () {
      var w = info.worker || pendingWorker;
      if (w && w.postMessage) w.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    };
  };

  if (!('serviceWorker' in navigator)) return;

  var pendingWorker = null;

  function askSwVersion() {
    return new Promise(function (resolve) {
      var sw = navigator.serviceWorker.controller;
      if (!sw) return resolve(null);
      var ch = new MessageChannel();
      var t = setTimeout(function () { resolve(null); }, 2000);
      ch.port1.onmessage = function (e) {
        clearTimeout(t);
        resolve(e.data && e.data.version != null ? Number(e.data.version) : null);
      };
      sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    });
  }

  function fetchManifestVersion() {
    return fetch('manifest.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { return m && m.version != null ? Number(m.version) : null; })
      .catch(function () { return null; });
  }

  function checkVersion() {
    if (!navigator.serviceWorker.controller) return Promise.resolve(null);
    return Promise.all([askSwVersion(), fetchManifestVersion()]).then(function (r) {
      var installed = r[0], remote = r[1];
      if (installed == null || remote == null) return null;
      if (remote <= installed) return null;
      return navigator.serviceWorker.getRegistration().then(function (reg) {
        pendingWorker = (reg && (reg.waiting || reg.installing)) || null;
        window.updated({ from: installed, to: remote, worker: pendingWorker });
        return { from: installed, to: remote };
      });
    }).catch(function () { return null; });
  }

  window.__pwaCheckVersion = checkVersion;
  window.__pwaPendingWorker = function () { return pendingWorker; };

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js')
      .then(function (reg) {
        reg.update().catch(function () {});
        setInterval(function () { reg.update().catch(function () {}); }, CHECK_MS);
        setTimeout(checkVersion, 1000);
        setInterval(checkVersion, CHECK_MS);

        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') {
            reg.update().catch(function () {});
            checkVersion();
          }
        });

        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              pendingWorker = reg.waiting || nw;
              checkVersion();
            }
          });
        });
      })
      .catch(function (err) { console.warn('[PWA] register failed', err); });
  });
})();
PWA_EOF
log "создан js/pwa.js"

# ── 4. Заменить inline-<script> в index.html на <script src="js/pwa.js" defer> ─
if python -c "import sys" 2>/dev/null; then
  python - <<'PY'
import re, io
with io.open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
pattern = re.compile(
    r'<script>\s*if\s*\(\s*"serviceWorker"\s+in\s+navigator\s*\)\s*\{[^<]*?\}\s*</script>',
    re.DOTALL)
new_html, n = pattern.subn('<script src="js/pwa.js" defer></script>', html)
if n > 0:
    with io.open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
    print('OK: заменено %d inline SW-скрипт(ов)' % n)
else:
    print('WARN: inline SW-скрипт не найден')
PY
else
  warn "python не найден — отредактируйте index.html вручную:"
  warn "  замените <script>if (\"serviceWorker\" ...)</script> на <script src=\"js/pwa.js\" defer></script>"
fi

# ── 5. manifest.json ────────────────────────────────────────────────────────
cat > manifest.json << 'M_EOF'
{
  "name": "Обзвон салонов Красота",
  "short_name": "Красота",
  "version": 1,
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f5f3f0",
  "theme_color": "#f5f3f0",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
M_EOF
log "перезаписан manifest.json (version=1, theme_color=#f5f3f0)"

# ── 6. service-worker.js ────────────────────────────────────────────────────
cat > service-worker.js << 'SW_EOF'
const VERSION = 1;
const CACHE_NAME = 'krasota-v' + VERSION;

const ASSETS = [
  './','./index.html','./manifest.json','./icons/icon.svg',
  './css/base.css','./css/layout.css','./css/cards.css','./css/controls.css',
  './contacts.js',
  './js/pwa.js','./js/config.js','./js/utils.js','./js/storage.js','./js/sync.js',
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
SW_EOF
log "перезаписан service-worker.js (VERSION=1)"

# ── 7. .gitignore — чтобы бэкапы не попали в git ───────────────────────────
if ! grep -q '^\*\.bak\.' .gitignore 2>/dev/null; then
  printf '\n# PWA backup files\n*.bak.*\n' >> .gitignore
  log ".gitignore — добавлен '*.bak.*'"
fi

# ── 8. git add ─────────────────────────────────────────────────────────────
if git rev-parse --git-dir >/dev/null 2>&1; then
  git add index.html manifest.json service-worker.js js/pwa.js .gitignore
  log "git add выполнен — проверьте: git diff --cached"
fi

echo
echo "=== fix-pwa.sh: готово ==="
echo "Проверка:  python -m http.server 8000  →  http://localhost:8000"
echo "DevTools → Application → Manifest: version=1, theme_color=#f5f3f0"
echo "DevTools → Application → Service Workers: activated"
echo "Коммит:    git commit -m 'fix(pwa): version-based updates + js/pwa.js'"
echo "Откат:     mv index.html.bak.$TS index.html   (и т.д.)"