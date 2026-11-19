/* Runtime horizontal overflow audit; reports diagnostics, does not alter layout. */
(function () {
  'use strict';
  function audit() {
    var root = document.documentElement;
    var body = document.body;
    if (!body) return;
    var viewport = root.clientWidth;
    var documentWidth = Math.max(root.scrollWidth, body.scrollWidth);
    var offenders = [];
    document.querySelectorAll('body *').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el);
      /* The filter rail is intentionally horizontally scrollable. */
      if (el.classList && el.classList.contains('chips')) return;
      if (style.position === 'fixed' || rect.width === 0) return;
      if (rect.left < -1 || rect.right > viewport + 1) {
        offenders.push({
          element: el.tagName.toLowerCase(),
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        });
      }
    });
    var result = {
      viewport: viewport,
      documentWidth: documentWidth,
      horizontalOverflow: documentWidth > viewport + 1,
      elementsOutsideViewport: offenders.slice(0, 25)
    };
    window.__KRASOTA_LAYOUT_AUDIT__ = result;
    if (result.horizontalOverflow || offenders.length) {
      console.warn('[Krasota layout audit] Overflow:', result);
    } else {
      console.info('[Krasota layout audit] OK:', result);
    }
  }
  window.addEventListener('load', function () {
    audit();
    setTimeout(audit, 500);
    setTimeout(audit, 1600);
  });
  window.addEventListener('resize', audit, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(audit, 350); });
})();
