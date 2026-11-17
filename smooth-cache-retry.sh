#!/usr/bin/env bash
set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*"; }
err()  { printf "${R}✗${N} %s\n" "$*" >&2; }

for f in js/storage.js js/api.js js/main.js js/render.js service-worker.js manifest.json; do
  [[ -f "$f" ]] || { err "$f не найден — запустите из корня репо"; exit 1; }
done

TS=$(date +%Y%m%d-%H%M%S)
backup() { cp "$1" "$1.bak.$TS" && log "backup: $1.bak.$TS"; }
backup js/storage.js; backup js/api.js; backup js/main.js; backup js/render.js
backup service-worker.js; backup manifest.json

# ── 1. js/storage.js — кэш списка контактов ────────────────────────────────
if ! grep -q 'LS_ITEMS_KEY' js/storage.js; then
cat >> js/storage.js << 'EOF'

/* Кэш списка контактов — для мгновенного старта из localStorage */
const LS_ITEMS_KEY = 'krasota_items_v3';

function loadItemsCache(){
  let raw = null;
  try { raw = localStorage.getItem(LS_ITEMS_KEY); } catch(e) { return null; }
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch(e) { return null; }
}

function saveItemsCache(){
  try {
    if (Array.isArray(items)) {
      localStorage.setItem(LS_ITEMS_KEY, JSON.stringify(items));
    }
  } catch(e) {}
}

function clearItemsCache(){
  try { localStorage.removeItem(LS_ITEMS_KEY); } catch(e) {}
}
EOF
  log "storage.js: добавлены loadItemsCache / saveItemsCache / clearItemsCache"
else
  warn "storage.js: LS_ITEMS_KEY уже есть — пропускаем"
fi

# ── 2. js/api.js — 3 ретрая, ошибка только после всех ─────────────────────
cat > js/api.js << 'API_EOF'
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
API_EOF
log "api.js: 3 попытки, плавное обновление, err только после 3-й неудачи"

# ── 3. js/main.js — cache-first старт ──────────────────────────────────────
cat > js/main.js << 'MAIN_EOF'
/* Точка входа: сначала показываем кэш из localStorage (если есть),
   затем — фоновый fetch из Google Sheets с 3 попытками. */
loadState();

(function loadFromCache(){
  const cached = loadItemsCache();
  if (cached && cached.length) {
    items = cached;
    render(true); // без анимации карточек — плавная замена
  }
})();

loadData();  // фоновое обновление
loadThemes();
MAIN_EOF
log "main.js: cache-first старт"

# ── 4. js/render.js — build() сохраняет кэш, не дёргает анимацию ──────────
python - <<'PY'
import io, re
p = 'js/render.js'
with io.open(p, 'r', encoding='utf-8') as f: s = f.read()

# 4a. build(): оборачиваем в сохранение кэша + scroll + noAnim
old_build = re.search(
    r'function build\(rows\)\{.*?\n\}',
    s, re.DOTALL)
if not old_build:
    raise SystemExit('build() не найден — файл нестандартный, правьте вручную')

new_build = """function build(rows){
  const hadItems = items.length > 0;
  const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
  const seen=new Map();
  rows.forEach((row,i)=>{
    const site=pick(row,/^(сайт|site|url)$/i)||pick(row,/сайт|site|url/i);
    if(!site)return;
    const key=keyOf(site);
    if(seen.has(key))return;

    const c=CONTACTS[key]||{};
    if(isBeautyTheme()&&!c.name&&!isBeautyCategory(pick(row,/^(category|категория)$/i)))return;
    const sheetPhone=pick(row,/^телефон|phone/i);
    const fromSheet=splitPhones(sheetPhone);
    const fromContacts=splitPhones(c.phones||[]);
    const phones=[...new Set([...fromSheet,...fromContacts])];

    const sheetRes = pick(row,/результат/i);
    const sheetNote= pick(row,/заметка/i);
    const sheetCall= pick(row,/^звонок|called/i);
    const sheetUpd = pick(row,/^обновлено|updated/i);
    const resKey=Object.keys(STATUS).find(k=>STATUS[k].t.toLowerCase()===sheetRes.toLowerCase())||'';
    const calledAt=sheetCall?new Date(sheetCall).getTime():0;

    const local=state[key]||{};
    state[key]={
      s:       local.s||resKey||'',
      n:       local.n||sheetNote||'',
      calledAt:local.calledAt||calledAt||0,
      ts:      Math.max(local.ts||0,sheetUpd?new Date(sheetUpd).getTime():0),
      p:       local.p||0
    };

    if(local.s&&!resKey)        queuePush(key,{result:STATUS[local.s].t,note:local.n||'',calledAt:local.calledAt||0});
    else if(local.n&&!sheetNote)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n,calledAt:local.calledAt||0});
    else if(local.calledAt&&!calledAt)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n||'',calledAt:local.calledAt});

    const rowKey =pick(row,/^key$/i);
    const rowName=pick(row,/^(name|название)$/i)||(/^(https?:\\/\\/|[\\w-]+\\.[\\w.-]+\\/)/i.test(rowKey)?'':rowKey);
    const name=cleanName(c.name||rowName,key);
    const area=c.name?'':pick(row,/^note$/i);
    const sub=[c.category||pick(row,/^(category|категория)$/i),c.address||pick(row,/^(address|адрес)$/i),area].filter(Boolean).join(' · ');
    seen.set(key,{
      id:key,i,site,phones,
      name,
      sub,
      note:c.note||'',
      search:(name+' '+sub+' '+key+' '+phones.map(p=>digits(p)+' '+fmt(p)).join(' ')).toLowerCase()
    });
  });
  items=[...seen.values()];
  saveState();
  if (typeof saveItemsCache === 'function') saveItemsCache();
  render(hadItems);
  if (scrollY > 0) {
    requestAnimationFrame(()=>{ try{ window.scrollTo(0, scrollY); }catch(e){} });
  }
}"""

s = s[:old_build.start()] + new_build + s[old_build.end():]

# 4b. render(noAnim) — не мигать анимацией при фоновом обновлении
old_render = re.search(r'function render\(\)\{.*?\n\}', s, re.DOTALL)
if not old_render:
    raise SystemExit('render() не найден — правьте вручную')

new_render = """function render(noAnim){
  counts();
  const q=query.toLowerCase(),qd=query.replace(/\\D/g,'');
  let list=items.filter(it=>passes(it)&&(!q||it.search.includes(q)||(qd.length>=3&&it.search.includes(qd))));
  list.sort((a,b)=>(!!b.phones.length-!!a.phones.length)||(((state[a.id]||{}).ts||0)-((state[b.id]||{}).ts||0))||a.i-b.i);
  $('list').innerHTML=list.length?list.map(cardHTML).join('')
    :`<div class="empty">${IC.empty}<div>${query?'Ничего не найдено':'Здесь пока пусто'}</div></div>`;
  $('list').querySelectorAll('.note').forEach(autosize);
  if (noAnim) {
    $('list').querySelectorAll('.card').forEach(c=>{c.style.animation='none'});
  }
  const next=nextItem();
  $('fab').hidden=!next;
  if(next)$('fabTxt').innerHTML=`Следующий <small>${esc(next.name.slice(0,22))}</small>`;
}"""

s = s[:old_render.start()] + new_render + s[old_render.end():]

with io.open(p, 'w', encoding='utf-8') as f: f.write(s)
print('OK render.js: build() + render(noAnim)')
PY
log "render.js: saveItemsCache + noAnim + scroll preserved"

# ── 5. service-worker.js VERSION + manifest.version ────────────────────────
python - <<'PY'
import io, re, json
with io.open('service-worker.js','r',encoding='utf-8') as f: s=f.read()
m = re.search(r'const VERSION = (\d+);', s)
if m:
    nv = int(m.group(1)) + 1
    s = s.replace('const VERSION = ' + m.group(1) + ';', 'const VERSION = ' + str(nv) + ';', 1)
    with io.open('service-worker.js','w',encoding='utf-8') as f: f.write(s)
    print('SW VERSION ->', nv)
d = json.load(open('manifest.json', encoding='utf-8'))
d['version'] = int(d.get('version',0)) + 1
with open('manifest.json','w',encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
print('manifest version ->', d['version'])
PY

# ── 6. git add ─────────────────────────────────────────────────────────────
git add js/storage.js js/api.js js/main.js js/render.js service-worker.js manifest.json
log "git add выполнен"

echo
echo "=== smooth-cache-retry.sh: готово ==="
echo
echo "Проверка:"
echo "  python -m http.server 8000 → http://localhost:8000"
echo
echo "  1) DevTools → Application → Local Storage:"
echo "     • krasota_items_v3  — кэш списка (появится после 1-й загрузки)"
echo "     • krasota_calls_v3  — state (статусы/заметки)"
echo "     • pwa.*             — счётчики PWA"
echo
echo "  2) F5 — список рисуется из кэша сразу (без скелетонов), фоном идёт fetch."
echo
echo "  3) Network → Offline + F5 (после кэширования):"
echo "     • список виден сразу из кэша"
echo "     • err НЕ появляется первые ~40 с (3 попытки с backoff)"
echo "     • через 3-ю неудачу: err с текстом «после 3 попыток»"
echo
echo "  4) Network → Online → refreshBtn в шапке — список обновится без «мигания»."
echo
echo "Коммит: git commit -m 'feat: cache-first + 3 retries + smooth update'"