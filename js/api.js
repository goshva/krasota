/* Чтение из Google Sheets через JSONP (обход CORS).
   Список уже отрисован из localStorage — теперь плавно обновляем из сети.
   При неудаче — 3 попытки; err показываем только после 3-й. */

const MAX_ATTEMPTS    = 3;
const REQUEST_TIMEOUT = 12000;
const RETRY_DELAYS    = [2000, 5000]; // мс перед 2-й и 3-й попыткой

let fetchToken = 0;

function loadData(){
  const token = ++fetchToken;
  $('refreshBtn').classList.add('spin');
  $('err').classList.remove('show');
  attemptFetch(0, token);
}

function attemptFetch(attempt, token){
  if (token !== fetchToken) return;

  const cb = 'jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  let done = false;
  const t = setTimeout(() => onFail('timeout'), REQUEST_TIMEOUT);

  window[cb] = data => {
    if (done) return;
    done = true;
    clearTimeout(t);
    delete window[cb];
    if (token !== fetchToken) return;

    $('refreshBtn').classList.remove('spin');

    if (!Array.isArray(data)) {
      return onFail(data && data.error ? 'Ошибка таблицы: ' + data.error : 'Неожиданный ответ');
    }

    $('err').classList.remove('show');
    build(data);
    toast('Список обновлён');
  };

  const s = document.createElement('script');
  s.src = API_URL + '?callback=' + cb +
          (isBeautyTheme() ? '' : '&sheet=' + encodeURIComponent(theme)) +
          '&t=' + Date.now();
  s.onerror = () => { clearTimeout(t); onFail('network'); };
  document.body.appendChild(s);

  function onFail(reason){
    if (done) return;
    done = true;
    clearTimeout(t);
    delete window[cb];
    if (token !== fetchToken) return;

    const next = attempt + 1;
    console.warn('[api] attempt ' + (attempt + 1) + '/' + MAX_ATTEMPTS + ' failed: ' + reason);

    if (next < MAX_ATTEMPTS) {
      // тихо ждём и пробуем снова — без err, без toast
      setTimeout(() => attemptFetch(next, token), RETRY_DELAYS[next - 1]);
      return;
    }

    // все попытки исчерпаны — только теперь показываем ошибку
    $('refreshBtn').classList.remove('spin');
    $('err').textContent = 'Не удалось загрузить таблицу после ' + MAX_ATTEMPTS +
                           ' попыток — показываю сохранённый список.';
    $('err').classList.add('show');
    if (!items.length && isBeautyTheme()) {
      build(Object.keys(CONTACTS).map(k => ({'сайт': 'https://' + k})));
    }
  }
}
