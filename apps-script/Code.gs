// Копия скрипта из Google Таблицы «красота» (Расширения → Apps Script).
// Исправлено: поиск строки по колонке key/url и normalizeKey без URL() (в Apps Script его нет).
// Добавлено: тематики (?sheets=1, ?sheet=, body.sheet), меню «Обзвон», formatAll() — оформление всех листов.

const SHEET_NAME = 'contacts'; // ⚠️ точное имя вкладки; регистр важен

const COL = {
  site:     'сайт',
  phone:    'телефон',
  result:   'результат',
  lpr:      'лпр',
  note:     'заметка',
  owner:    'кто занимается',  // было «звонок»
  sent:     'сайт отправили'   // было «note» (сторона · округ)
};

/* ---------- GET: отдаём все строки как JSON(P) ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  // список вкладок для выбора тематики на сайте
  if (p.sheets) {
    const names = SpreadsheetApp.getActiveSpreadsheet().getSheets()
      .filter(s => !s.isSheetHidden()).map(s => s.getName());
    return out({ sheets: names }, e);
  }
  const sh = getSheet(p.sheet);
  if (!sh) return out({ error: 'Лист не найден: ' + (p.sheet || SHEET_NAME) }, e);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return out([], e);

  const headers = values.shift().map(h => String(h).trim());
  const rows = values.map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
  return out(rows, e);
}

/* ---------- POST: пишем результат/заметку/ЛПР/звонок ---------- */
function doPost(e) {
  try {
    // проверка тела запроса до любой логики
    const raw = e && e.postData && e.postData.contents;
    if (!raw) return out({ error: 'Пустой запрос' }, e);
    let body;
    try { body = JSON.parse(raw); } catch (err) { return out({ error: 'Некорректный JSON' }, e); }
    if (!body || typeof body !== 'object' || !body.key) return out({ error: 'Нет ключа строки' }, e);

    const sh = getSheet(body.sheet);
    if (!sh) return out({ error: 'Лист не найден' }, e);

    let values = sh.getDataRange().getValues();
    let headers = values[0].map(h => String(h).trim());

    let iSite = headers.indexOf('key');
    if (iSite < 0) iSite = headers.indexOf(COL.site);
    if (iSite < 0) iSite = headers.indexOf('url');
    if (iSite < 0) return out({ error: 'Нет колонки «сайт»' }, e);

    // авто-создание всех недостающих колонок (включая лпр и звонок)
    const need = [COL.result, COL.note, COL.lpr, COL.owner, COL.sent];
    let added = false;
    need.forEach(name => {
      if (headers.indexOf(name) < 0) {
        headers.push(name);
        sh.getRange(1, headers.length).setValue(name);
        added = true;
      }
    });
    if (added) values = sh.getDataRange().getValues(); // перечитываем после расширения

    const idx = name => headers.indexOf(name) + 1;

    // ищем строку по ключу (домен+путь, без www/параметров); запасной вариант — только домен
    const key = normalizeKey(body.key);
    let r = values.findIndex((v, i) => i > 0 && normalizeKey(v[iSite]) === key);
    if (r < 0) {
      const host = key.split('/')[0];
      const byHost = values.map((v, i) => i > 0 && normalizeKey(v[iSite]).split('/')[0] === host ? i : -1).filter(i => i > 0);
      if (byHost.length === 1) r = byHost[0];      // домен однозначный — берём его
    }
    if (r < 1) return out({ error: 'Строка не найдена: ' + key }, e);

    // пакетная запись: собираем изменённые поля и пишем одним setValues
    const fields = { result: COL.result, note: COL.note, lpr: COL.lpr, owner: COL.owner, sent: COL.sent };
    const cols = Object.keys(fields).filter(f => body[f] !== undefined).map(f => [idx(fields[f]), body[f] == null ? '' : String(body[f])]);
    if (cols.length) {
      const c0 = Math.min.apply(null, cols.map(c => c[0])), c1 = Math.max.apply(null, cols.map(c => c[0]));
      const rowVals = values[r].slice(c0 - 1, c1);
      while (rowVals.length < c1 - c0 + 1) rowVals.push('');
      cols.forEach(([c, v]) => { rowVals[c - c0] = v; });
      sh.getRange(r + 1, c0, 1, rowVals.length).setValues([rowVals]);
    }
    return out({ ok: true, row: r + 1 }, e);
  } catch (err) {
    return out({ error: String(err) }, e);
  }
}

/* ---------- helpers ---------- */
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (name) return ss.getSheetByName(String(name)); // вкладка тематики («Еда», «Другое»…)
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function normalizeKey(url) {
  // в Apps Script нет URL(), разбираем вручную: домен + путь без параметров
  let s = String(url || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return s;
}

function out(payload, e) {
  const json = JSON.stringify(payload);
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= ОФОРМЛЕНИЕ ТАБЛИЦЫ =================
   Меню «Обзвон → Оформить все листы» (или выбрать formatAll → ▶ Выполнить).
   Данные не меняются, только вид. Оформление ставится на весь лист целиком,
   поэтому новые строки от программы Search сразу выглядят так же. */
const STATUSES = ['Не взяли', 'Перезвонить', 'Интерес', 'Отказ'];
const STATUS_COLORS = {
  'Не взяли':    ['#e4ecfb', '#2c5bb8'],
  'Перезвонить': ['#fbf0dc', '#9a5f08'],
  'Интерес':     ['#e3f4ea', '#167a4a'],
  'Отказ':       ['#fae5e3', '#b0352f']
};
// цвет ярлычка вкладки по тематике
const TAB_COLORS = {
  'contacts': '#b4426b', 'Еда': '#e07a2f', 'Авто': '#3c6fd1', 'Спорт': '#2f9d62',
  'Медицина': '#2f8f83', 'Обучение и дети': '#7b5cc4', 'Бытовые услуги': '#8a6d3b', 'Другое': '#8c8794'
};
// подсказки к заголовкам (заголовки служебные — их читают сайт и программа Search)
const HEAD_NOTES = {
  'key': 'Ключ строки (ссылка без https). Нужен сайту, не менять.',
  'name': 'Название', 'category': 'Категория', 'address': 'Адрес', 'phones': 'Телефоны',
  'url': 'Ссылка на карточку / сайт',
  'результат': 'Статус звонка: Не взяли / Перезвонить / Интерес / Отказ',
  'заметка': 'Заметка с сайта-обзвонника (и отметки «WhatsApp: … 16.11»)',
  'лпр': 'Кто принимает решение',
  'кто занимается': 'Кто ведёт этот салон',
  'сайт отправили': 'Какой сайт-пример отправили (ссылка)'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Обзвон')
    .addItem('Оформить все листы', 'formatAll')
    .addItem('Оформить текущий лист', 'formatCurrent')
    .addItem('Обновить колонки (звонок → кто занимается)', 'migrateColumns')
    .addToUi();
}

function formatAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().filter(sh => isCallSheet_(sh)).forEach(sh => formatSheet(sh));
  ss.toast('Все листы оформлены', 'Обзвон', 4);
}
function formatCurrent() { formatSheet(SpreadsheetApp.getActiveSheet()); }

// разово: «звонок» → «кто занимается», «note» → «сайт отправили» (стираются только даты), «обновлено» удаляется
function migrateColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().filter(sh => isCallSheet_(sh)).forEach(sh => {
    const head = () => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const rename = (from, to) => {
      const c = head().indexOf(from) + 1;
      if (!c || head().indexOf(to) >= 0) return;
      sh.getRange(1, c).setValue(to).clearNote();
      // чистим только даты (старые отметки «когда звонили»); текст — например, имя менеджера — оставляем
      const n = sh.getLastRow() - 1;
      if (n > 0) {
        const rng = sh.getRange(2, c, n, 1);
        rng.setValues(rng.getValues().map(([v]) => [v instanceof Date ? '' : v]));
      }
    };
    rename('звонок', COL.owner);
    rename('note', COL.sent);
    const u = head().indexOf('обновлено') + 1;
    if (u) sh.deleteColumn(u);
    formatSheet(sh);
  });
  ss.toast('Колонки обновлены', 'Обзвон', 4);
}

// лист обзвона = есть колонка key/url и phones
function isCallSheet_(sh) {
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) return false;
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  return (h.indexOf('key') >= 0 || h.indexOf('url') >= 0) && h.indexOf('phones') >= 0;
}

function formatSheet(sh) {
  sh = sh || getSheet();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  // во 2-й колонке стоял второй «key» с названием — это «name»
  if (head[0] === 'key' && head[1] === 'key') { sh.getRange(1, 2).setValue('name'); head[1] = 'name'; }
  [COL.result, COL.note, COL.lpr, COL.owner, COL.sent].forEach(name => {
    if (head.indexOf(name) < 0) { head.push(name); sh.getRange(1, head.length).setValue(name); }
  });
  const cols = head.length;
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
  if (sh.getMaxRows() < sh.getLastRow() + 200) sh.insertRowsAfter(sh.getMaxRows(), sh.getLastRow() + 200 - sh.getMaxRows());
  const n = sh.getMaxRows() - 1;          // весь лист: новые строки тоже будут оформлены
  const idx = name => head.indexOf(name) + 1;

  sh.getRange(1, 1, sh.getMaxRows(), cols).setFontFamily('Manrope');
  sh.getRange(1, 1, 1, cols)
    .setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle').setHorizontalAlignment('left')
    .setNotes([head.map(h => HEAD_NOTES[h] || '')]);
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(idx('name') || 0);

  const body = sh.getRange(2, 1, n, cols);
  body.setFontSize(11).setFontColor('#1b1820').setFontWeight('normal').setVerticalAlignment('middle')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
      .setBorder(null, null, true, null, null, true, '#ebe6e0', SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeightsForced(2, n, 34);
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, n + 1, cols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#1b1820').setFirstRowColor('#ffffff').setSecondRowColor('#f7f5f2');

  const style = (name, width, fn) => { const c = idx(name); if (!c) return; sh.setColumnWidth(c, width); if (fn) fn(sh.getRange(2, c, n, 1)); };
  style('name', 260, r => r.setFontWeight('bold'));
  style('category', 150, r => r.setFontColor('#7a7380').setFontSize(10));
  style('address', 280, r => r.setFontColor('#7a7380').setFontSize(10));
  style('phones', 210, r => r.setFontWeight('bold').setFontColor('#1f9d62').setNumberFormat('@'));
  style('url', 220, r => r.setFontColor('#b4426b').setFontSize(10));
  style(COL.result, 130, r => r.setHorizontalAlignment('center').setFontWeight('bold'));
  style(COL.lpr, 160);
  style(COL.note, 340, r => r.setFontSize(10));
  style(COL.owner, 150, r => r.setFontWeight('bold').setNumberFormat('@'));
  style(COL.sent, 240, r => r.setFontColor('#b4426b').setFontSize(10).setNumberFormat('@'));
  ['key', 'phone_1', 'phone_2', 'phone_3'].forEach(name => { const c = idx(name); if (c) sh.hideColumns(c); });

  const rules = [];
  const cRes = idx(COL.result);
  if (cRes) {
    const resRange = sh.getRange(2, cRes, n, 1);
    resRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build());
    STATUSES.forEach(s => rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s)
      .setBackground(STATUS_COLORS[s][0]).setFontColor(STATUS_COLORS[s][1]).setRanges([resRange]).build()));
    const L = colLetter_(cRes), nc = idx('name') || 1;
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="Отказ"')
      .setFontColor('#a49dab').setStrikethrough(true).setRanges([sh.getRange(2, nc, n, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="Интерес"')
      .setBackground('#e3f4ea').setFontColor('#167a4a').setRanges([sh.getRange(2, nc, n, 1)]).build());
  }
  const cMsg = idx(COL.note);
  if (cMsg) rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=REGEXMATCH($' + colLetter_(cMsg) + '2;"(WhatsApp|Telegram|Max): ")')
    .setFontColor('#2c5bb8').setRanges([sh.getRange(2, cMsg, n, 1)]).build());
  const cPh = idx('phones'), cNm = idx('name');
  if (cPh && cNm) rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + colLetter_(cNm) + '2<>"";$' + colLetter_(cPh) + '2="")')
    .setBackground('#fff6e6').setRanges([sh.getRange(2, cPh, n, 1)]).build());
  sh.setConditionalFormatRules(rules);

  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, n + 1, cols).createFilter();
  if (TAB_COLORS[sh.getName()]) sh.setTabColor(TAB_COLORS[sh.getName()]);
}

function colLetter_(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
