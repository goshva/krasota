/* localStorage-состояние проверок + фоновое обновление с ошибкой,
   если оно не удалось (N неудач подряд / устаревший успех / не активировался SW).

   Ключи localStorage:
     pwa.lastCheck          — когда в последний раз запускали проверку
     pwa.lastSuccess        — когда в последний раз УСПЕШНО получили manifest
     pwa.failCount          — сколько неудач подряд
     pwa.failSince          — когда началась серия неудач
     pwa.lastKnownVersion   — последняя известная version из manifest.json

   Флаг AUTO_UPDATE:
     false — баннер «Обновить» (по умолчанию, безопасно для формы)
     true  — автоматически активировать новый SW; если за 5 с не активировался —
             показать ошибку. */
(function () {
  'use strict';

  var AUTO_UPDATE = false;

  var LS = {
    check:   'pwa.lastCheck',
    success: 'pwa.lastSuccess',
    failCnt: 'pwa.failCount',
    failAt:  'pwa.failSince',
    version: 'pwa.lastKnownVersion'
  };
  var MAX_FAILS        = 3;              // столько неудач подряд → показать ошибку
  var STALE_MS         = 30 * 60 * 1000; // успех старше 30 мин → ошибка
  var RELOAD_TIMEOUT   = 5000;           // ждём controllerchange после SKIP_WAITING
  var CHECK_INTERVAL   = 5 * 60 * 1000;  // 5 минут

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ── баннеры ──────────────────────────────────────────────────────────────
  function showErrorBanner(msg, onRetry) {
    if (document.getElementById('pwa-error-banner')) {
      var el0 = document.getElementById('pwa-error-banner');
      el0.querySelector('[data-msg]').textContent = msg;
      return;
    }
    var el = document.createElement('div');
    el.id = 'pwa-error-banner';
    el.style.cssText = [
      'position:fixed','left:0','right:0','top:0','z-index:99999',
      'background:#c8433c','color:#fff','padding:12px 16px',
      'font:14px/1.4 Manrope,system-ui,sans-serif',
      'display:flex','justify-content:space-between','align-items:center','gap:12px',
      'box-shadow:0 2px 12px rgba(0,0,0,.2)'
    ].join(';');
    el.innerHTML =
      '<span data-msg>⚠ ' + msg + '</span>' +
      '<button id="pwa-error-retry" style="background:#fff;color:#c8433c;' +
      'border:0;border-radius:8px;padding:6px 12px;cursor:pointer;' +
      'font:inherit;font-weight:700">Повторить</button>';
    document.body.appendChild(el);
    document.getElementById('pwa-error-retry').onclick = function () {
      hideErrorBanner();
      lsSet(LS.failCnt, '0'); lsDel(LS.failAt);
      if (onRetry) onRetry(); else doCheck();
    };
  }
  function hideErrorBanner() {
    var el = document.getElementById('pwa-error-banner');
    if (el) el.remove();
  }

  // ── хуки успеха/неудачи ──────────────────────────────────────────────────
  function onCheckSuccess() {
    lsSet(LS.success, String(Date.now()));
    lsSet(LS.failCnt, '0');
    lsDel(LS.failAt);
    hideErrorBanner();
  }
  function onCheckFail(reason) {
    var fc = Number(lsGet(LS.failCnt) || 0) + 1;
    lsSet(LS.failCnt, String(fc));
    if (fc === 1) lsSet(LS.failAt, String(Date.now()));
    console.warn('[PWA] check failed (' + fc + '):', reason);
    if (fc >= MAX_FAILS) {
      showErrorBanner('Не удалось проверить обновления ' + fc + ' раз подряд (' + reason + ').');
    }
  }
  function checkStale() {
    var last = Number(lsGet(LS.success) || 0);
    if (last === 0) return;
    if (Date.now() - last > STALE_MS) {
      showErrorBanner('Обновления не проверялись с ' +
        new Date(last).toLocaleString('ru-RU') + '. Проверьте интернет.');
    }
  }

  // ── основная проверка (независима от __pwaCheckVersion) ──────────────────
  function doCheck() {
    lsSet(LS.check, String(Date.now()));
    return fetch('manifest.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (m) {
        if (!m || m.version == null) throw new Error('manifest.json без поля version');
        lsSet(LS.version, String(m.version));
        onCheckSuccess();
        // параллельно дергаем базовую проверку — она решает про updated()
        if (typeof window.__pwaCheckVersion === 'function') {
          window.__pwaCheckVersion().catch(function () {});
        }
        return { ok: true, version: m.version };
      })
      .catch(function (err) {
        onCheckFail(err && err.message ? err.message : 'network error');
        return { ok: false, error: err && err.message };
      });
  }
  window.__pwaRefreshCheck = doCheck;

  // ── авто-обновление (флаг AUTO_UPDATE) ───────────────────────────────────
  function autoApplyUpdate(info) {
    var w = info.worker || (window.__pwaPendingWorker && window.__pwaPendingWorker());
    if (!w || !w.postMessage) {
      showErrorBanner('Нет waiting-воркера для активации. Обновите страницу вручную (Ctrl+F5).');
      return;
    }
    var applied = false;
    var onCtrl = function () { applied = true; };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrl);
    w.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(function () {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
      if (!applied) {
        showErrorBanner('Не удалось активировать версию v' + info.to +
                        '. Обновите страницу вручную (Ctrl+F5).');
      }
    }, RELOAD_TIMEOUT);
  }

  // Патчим window.updated: если AUTO_UPDATE — сразу применяем; иначе — ручной баннер
  function wrapUpdated() {
    var orig = window.updated;
    window.updated = function (info) {
      if (AUTO_UPDATE) {
        console.info('[PWA] AUTO_UPDATE v' + info.from + ' → v' + info.to);
        autoApplyUpdate(info);
      } else if (typeof orig === 'function') {
        orig(info);
      }
    };
  }

  // ── watchdog для ручного клика «Обновить» ────────────────────────────────
  function armReloadWatchdog() {
    var observer = new MutationObserver(function () {
      var btn = document.getElementById('pwa-update-btn');
      if (!btn || btn.dataset.watchdog) return;
      btn.dataset.watchdog = '1';
      var orig = btn.onclick;
      btn.onclick = function (ev) {
        var applied = false;
        var onCtrl = function () { applied = true; };
        navigator.serviceWorker.addEventListener('controllerchange', onCtrl);
        setTimeout(function () {
          navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
          if (!applied) {
            showErrorBanner('Не удалось активировать новую версию. Обновите страницу (Ctrl+F5).');
          }
        }, RELOAD_TIMEOUT);
        if (orig) return orig.call(this, ev);
      };
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── старт ────────────────────────────────────────────────────────────────
  window.addEventListener('load', function () {
    wrapUpdated();
    armReloadWatchdog();
    setTimeout(doCheck, 2000);
    setInterval(doCheck, CHECK_INTERVAL);
    setInterval(checkStale, 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') doCheck();
    });
    // При старте — если уже «устарело», сразу показываем ошибку
    checkStale();
  });
})();
