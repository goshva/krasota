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
