#!/usr/bin/env bash
set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*"; }
err()  { printf "${R}✗${N} %s\n" "$*" >&2; }

[[ -f index.html && -f css/layout.css ]] || { err "запустите из корня репо"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
cp index.html "index.html.bak.$TS"; log "backup: index.html.bak.$TS"
cp css/layout.css "css/layout.css.bak.$TS"; log "backup: css/layout.css.bak.$TS"

# 1. index.html - обернуть текст в span.chip-label, добавить .dot
python - <<'PY'
import io, re, sys
p = 'index.html'
s = io.open(p, 'r', encoding='utf-8').read()

labels = {
  'left':    'Осталось',
  'callback':'Перезвонить',
  'noanswer':'Не взяли',
  'interest':'Интерес',
  'refused': 'Отказ',
  'nophone': 'Без номера',
  'all':     'Все',
}

for f, lbl in labels.items():
    pat = re.compile(
        r'<button class="(chip[^"]*)" data-f="' + f + r'">(.*?)<i id="n-' + f + r'">',
        re.DOTALL
    )
    def repl(m):
        cls = m.group(1)
        return ('<button class="' + cls + '" data-f="' + f + '">'
                '<span class="dot"></span>'
                '<span class="chip-label">' + lbl + '</span> '
                '<i id="n-' + f + '">')
    new_s, n = pat.subn(repl, s)
    if n == 0:
        print('WARN: не найден чип data-f=' + f)
    else:
        s = new_s
        print('OK: ' + f)

io.open(p, 'w', encoding='utf-8').write(s)
PY

# 2. CSS в layout.css
if ! grep -q '\.chip-label' css/layout.css; then
cat >> css/layout.css << 'EOF'

/* ---------- схлопывание фильтров: точки + счётчик, раскрыт только активный ---------- */

/* цвет точек по data-f (без inline-стилей) */
.chip[data-f="left"]     .dot{background:var(--text)}
.chip[data-f="callback"] .dot{background:var(--amber)}
.chip[data-f="noanswer"] .dot{background:var(--blue)}
.chip[data-f="interest"] .dot{background:var(--call)}
.chip[data-f="refused"]  .dot{background:var(--red)}
.chip[data-f="nophone"]  .dot{background:var(--soft)}
.chip[data-f="all"]      .dot{background:var(--muted)}

/* на активном чипе dot — цвета фона, чтобы не сливаться с тёмной подложкой */
.chip.on .dot{background:var(--bg) !important}

/* label скрыт, пока чип не активен */
.chip-label{
  display:inline-block;
  max-width:0;
  overflow:hidden;
  opacity:0;
  transition:max-width .22s ease, opacity .18s ease;
  white-space:nowrap;
  vertical-align:middle;
}
.chip.on .chip-label{
  max-width:200px;
  opacity:1;
}

/* схлопнутый чип — компактнее */
.chip:not(.on){
  padding:0 10px;
  gap:6px;
  font-size:12px;
}
.chip:not(.on) i{
  font-size:12px;
  min-width:auto;
}
EOF
log "css/layout.css: добавлены стили chip-label / dot / collapsed state"
else
warn "css/layout.css: chip-label уже есть"
fi

# 3. bump версии (SW + manifest)
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

git add index.html css/layout.css service-worker.js manifest.json
log "git add выполнен"

cat <<'EOF'

=== collapse-chips.sh: готово ===

Что изменилось:
  • В index.html у каждого чипа: <span class="dot"></span><span class="chip-label">Текст</span> N
  • В layout.css: .chip-label скрыт, пока чип не .on
  • Схлопнутый:  [● 5]
  • Активный:    [● Перезвонить  5]

Проверка:
  python -m http.server 8000  →  http://localhost:8000

  1) По умолчанию «Осталось» активен → показывает полный текст.
     Остальные — только точки и цифры: [● 5] [● 2] [● 2] [● 3] ...

  2) Клик по «Перезвонить» → он раскрывается, «Осталось» схлопывается.

  3) Переход между чипами анимирован (max-width плавно).

Коммит:
  git commit -m "feat(chips): collapse to dot+count, expand active filter only"
  git push
EOF