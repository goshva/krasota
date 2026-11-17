#!/usr/bin/env bash
set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*"; }
err()  { printf "${R}✗${N} %s\n" "$*" >&2; }

for f in js/render.js js/actions.js css/cards.css service-worker.js manifest.json; do
  [[ -f "$f" ]] || { err "$f не найден — запустите из корня репо"; exit 1; }
done

TS=$(date +%Y%m%d-%H%M%S)
backup() { cp "$1" "$1.bak.$TS" && log "backup: $1.bak.$TS"; }
backup js/render.js; backup js/actions.js; backup css/cards.css
backup service-worker.js; backup manifest.json

# ── 1. render.js — кнопка «Ссылка на карточку» в meta-actions ──────────────
python - <<'PY'
import io, re, sys
p = 'js/render.js'
s = io.open(p, 'r', encoding='utf-8').read()

share_btn = (
    '<button class="meta-btn" data-a="share" '
    'title="Ссылка на карточку" aria-label="Ссылка на карточку">'
    '<svg viewBox="0 0 24 24">'
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>'
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
    '</svg></button>\n        '
)   
needle = ('<div class="meta-actions">\n'
          '        <button class="meta-btn" data-a="copy"')
if needle not in s:
    sys.exit('ERR: не найден блок meta-actions/copy в render.js')

if 'data-a="share"' in s:
    print('WARN: кнопка share уже есть')
else:
    s = s.replace(needle,
                  '<div class="meta-actions">\n        ' + share_btn +
                  '<button class="meta-btn" data-a="copy"', 1)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('OK render.js: кнопка share добавлена в meta-actions')
PY

# ── 2. actions.js — case share в делегированном клике ──────────────────────
python - <<'PY'
import io, sys
p = 'js/actions.js'
s = io.open(p, 'r', encoding='utf-8').read()

needle = "  if(a==='copy'){"
if 'copyCardLink(id)' in s:
    print('WARN: share-обработчик уже есть')
elif needle not in s:
    sys.exit('ERR: не найден if(a===\'copy\') в actions.js')
else:
    inject = (
        "  if(a==='share'){\n"
        "    e.preventDefault();\n"
        "    copyCardLink(id);\n"
        "    return;\n"
        "  }\n\n"
    )
    s = s.replace(needle, inject + needle, 1)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('OK actions.js: ветка share добавлена в клик-обработчик')
PY

# ── 3. actions.js — хелперы + hash-навигация в конце файла ─────────────────
if ! grep -q 'function handleCardHash' js/actions.js; then
cat >> js/actions.js << 'EOF'

/* ---------- ПРЯМЫЕ ССЫЛКИ НА КАРТОЧКУ ----------
   URL: location.origin + location.pathname + '#card=' + encodeURIComponent(id)
   id — ключ из data-id карточки (it.id). */

function cardUrl(id){
  return location.origin + location.pathname + '#card=' + encodeURIComponent(id);
}

function copyCardLink(id){
  const url = cardUrl(id);
  const p = copyText(url);
  Promise.resolve(p).then(ok => {
    if (ok) toast('Ссылка скопирована');
    else   toast(url, 6000);          // fallback: показать URL, если clipboard недоступен
  });
  // адресная строка тоже становится ссылкой на карточку — удобно копировать из браузера
  try { history.replaceState(null, '', url); } catch(e){}
}

function scrollToCardById(id, highlight){
  const el = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
  if (!el) return false;
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  if (highlight !== false) {
    el.classList.add('hl');
    setTimeout(() => el.classList.remove('hl'), 2500);
  }
  return true;
}

let __lastHandledHash = '';
function handleCardHash(){
  const m = location.hash.match(/^#card=([^&]+)/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  if (!id) return;
  if (!items.length) return;
  if (location.hash === __lastHandledHash) return;

  const visible = items.some(it => it.id === id && passes(it));
  if (!visible) {
    filter = 'all';
    query = '';
    const q = $('q'); if (q) q.value = '';
    const sb = $('searchBox'); if (sb) sb.classList.remove('has');
    render();
  }
  setTimeout(() => {
    if (scrollToCardById(id)) __lastHandledHash = location.hash;
  }, 120);
}

window.addEventListener('hashchange', handleCardHash);
window.addEventListener('load', () => {
  // данные могут прийти из кэша (быстро) или из сети (1–3 с) — пробуем несколько раз
  [150, 600, 1500, 3500].forEach(t => setTimeout(handleCardHash, t));
});
EOF
  log "actions.js: добавлены cardUrl / copyCardLink / scrollToCardById / handleCardHash"
else
  warn "actions.js: handleCardHash уже есть — пропускаем"
fi

# ── 4. css/cards.css — стиль подсветки карточки ─────────────────────────────
if ! grep -q '\.card\.hl' css/cards.css; then
cat >> css/cards.css << 'EOF'

/* ---------- подсветка карточки, открытой по прямой ссылке ---------- */
.card.hl{
  box-shadow:0 0 0 3px var(--accent), var(--shadow);
  animation:pulseHl 1.2s ease-in-out 2;
}
@keyframes pulseHl{
  0%,100%{box-shadow:0 0 0 3px var(--accent), var(--shadow)}
  50%    {box-shadow:0 0 0 6px var(--accent-soft), var(--shadow)}
}
EOF
  log "css/cards.css: добавлен стиль .card.hl"
else
  warn "css/cards.css: .card.hl уже есть"
fi

# ── 5. бамп версий ─────────────────────────────────────────────────────────
python - <<'PY'
import io, re, json
with io.open('service-worker.js','r',encoding='utf-8') as f: s=f.read()
m = re.search(r'const VERSION = (\d+);', s)
if m:
    nv = int(m.group(1)) + 1
    s = s.replace('const VERSION = ' + m.group(1) + ';', 'const VERSION = ' + str(nv) + ';', 1)
    io.open('service-worker.js','w',encoding='utf-8').write(s)
    print('SW VERSION ->', nv)
d = json.load(open('manifest.json', encoding='utf-8'))
d['version'] = int(d.get('version',0)) + 1
with open('manifest.json','w',encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
print('manifest version ->', d['version'])
PY

# ── 6. git add ─────────────────────────────────────────────────────────────
git add js/render.js js/actions.js css/cards.css service-worker.js manifest.json
log "git add выполнен"

cat <<'EOF'

=== add-card-links.sh: готово ===

Проверка:
  python -m http.server 8000  →  http://localhost:8000

  1) На любой карточке → в правом нижнем углу появилась кнопка 🔗
     Клик → тост «Ссылка скопирована» + адресная строка обновилась:
       http://localhost:8000/#card=<id>

  2) Открыть ссылку в новой вкладке — карточка окажется в центре
     экрана и подсветится пульсирующей рамкой ~2,5 с.

  3) Если карточка не в текущем фильтре (например, у неё статус «Отказ»,
     а вы на «Осталось») — фильтр сам переключится на «Все».

  4) Ссылка живёт вечно: id — это ключ из contacts.js / Google Sheets,
     не меняется между релизами.

Коммит:
  git commit -m "feat: direct card links (#card=<id>) + copy-to-clipboard"
  git push
EOF