/* PWA update manager: compare installed SW with manifest and reliably apply updates. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  var CHECK_MS = 60 * 1000;
  var registration = null;
  var pendingWorker = null;
  var updateRequested = false;
  var reloading = false;

  function showUpdate(info) {
    if (document.getElementById('pwa-update-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'pwa-update-banner';
    bar.style.cssText = [
      'position:fixed','left:12px','right:12px','bottom:calc(12px + env(safe-area-inset-bottom,0px))',
      'z-index:99999','background:var(--surface,#fff)','color:var(--text,#111)',
      'padding:14px 16px','font:14px/1.4 Manrope,system-ui,sans-serif',
      'display:flex','justify-content:space-between','align-items:center','gap:12px',
      'box-shadow:0 8px 28px rgba(0,0,0,.22)','border:1px solid var(--line,#ddd)',
      'border-radius:16px'
    ].join(';');
    var message = document.createElement('span');
    message.textContent = 'Доступна версия v' + info.to + ' (у вас v' + info.from + ').';
    var button = document.createElement('button');
    button.id = 'pwa-update-btn';
    button.type = 'button';
    button.textContent = 'Обновить';
    button.style.cssText = 'background:var(--accent,#b4426b);color:#fff;border:0;border-radius:10px;padding:9px 15px;cursor:pointer;font:inherit;font-weight:800;white-space:nowrap';
    button.addEventListener('click', applyUpdate);
    bar.appendChild(message);
    bar.appendChild(button);
    document.body.appendChild(bar);
  }

  // Kept as a public hook because js/pwa-refresh.js wraps this callback.
  window.updated = function (info) { showUpdate(info); };

  function askVersion(worker) {
    return new Promise(function (resolve) {
      if (!worker) return resolve(null);
      var channel = new MessageChannel();
      var timer = setTimeout(function () { resolve(null); }, 2500);
      channel.port1.onmessage = function (event) {
        clearTimeout(timer);
        resolve(event.data && Number.isFinite(Number(event.data.version)) ? Number(event.data.version) : null);
        channel.port1.close();
      };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
  }

  function remoteVersion() {
    return fetch('./manifest.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('manifest HTTP ' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        var version = Number(manifest && manifest.version);
        if (!Number.isFinite(version)) throw new Error('manifest version missing');
        return version;
      });
  }

  function checkVersion() {
    if (!registration || !navigator.serviceWorker.controller) return Promise.resolve();
    return Promise.all([askVersion(navigator.serviceWorker.controller), remoteVersion()])
      .then(function (versions) {
        var installed = versions[0], remote = versions[1];
        if (installed == null || remote <= installed) return;
        pendingWorker = registration.waiting || pendingWorker;
        // A newer manifest may arrive just before the worker finishes installing.
        if (pendingWorker) window.updated({ from: installed, to: remote, worker: pendingWorker });
        else registration.update().then(function () {
          pendingWorker = registration.waiting || pendingWorker;
          if (pendingWorker) window.updated({ from: installed, to: remote, worker: pendingWorker });
        }).catch(function (error) { console.warn('[PWA] update check failed', error); });
      })
      .catch(function (error) { console.warn('[PWA] version check failed', error); });
  }

  function applyUpdate() {
    if (updateRequested) return;
    updateRequested = true;
    var button = document.getElementById('pwa-update-btn');
    if (button) { button.disabled = true; button.textContent = 'Обновляем…'; }

    function activate(worker) {
      if (!worker) {
        updateRequested = false;
        if (button) { button.disabled = false; button.textContent = 'Повторить'; }
        return;
      }
      pendingWorker = worker;
      worker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(function () {
        if (!reloading && navigator.serviceWorker.controller && registration && !registration.waiting) {
          // controllerchange is normally first; this is a recovery path for browsers
          // that completed activation before our listener was attached.
          window.location.reload();
        } else if (!reloading) {
          updateRequested = false;
          if (button) { button.disabled = false; button.textContent = 'Повторить'; }
        }
      }, 10000);
    }

    if (registration && registration.waiting) return activate(registration.waiting);
    if (registration) {
      registration.update().then(function () {
        if (registration.waiting) activate(registration.waiting);
        else {
          updateRequested = false;
          if (button) { button.disabled = false; button.textContent = 'Обновить'; }
        }
      }).catch(function (error) {
        console.warn('[PWA] cannot install update', error);
        updateRequested = false;
        if (button) { button.disabled = false; button.textContent = 'Повторить'; }
      });
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (updateRequested && !reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js')
      .then(function (reg) {
        registration = reg;
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              pendingWorker = reg.waiting || worker;
              checkVersion();
            }
          });
        });
        reg.update().catch(function () {});
        checkVersion();
        setInterval(function () {
          reg.update().catch(function () {});
          checkVersion();
        }, CHECK_MS);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') {
            reg.update().catch(function () {});
            checkVersion();
          }
        });
      })
      .catch(function (error) { console.warn('[PWA] registration failed', error); });
  });
})();
