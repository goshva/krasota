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
  called:   'звонок',
  updated:  'обновлено'
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
    const body = JSON.parse(e.postData.contents);
    const sh = getSheet(body.sheet);
    if (!sh) return out({ error: 'Лист не найден' }, e);

    let values = sh.getDataRange().getValues();
    let headers = values[0].map(h => String(h).trim());

    let iSite = headers.indexOf('key');
    if (iSite < 0) iSite = headers.indexOf(COL.site);
    if (iSite < 0) iSite = headers.indexOf('url');
    if (iSite < 0) return out({ error: 'Нет колонки «сайт»' }, e);

    // авто-создание всех недостающих колонок (включая лпр и звонок)
    const need = [COL.result, COL.note, COL.lpr, COL.called, COL.updated];
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

    // ищем строку по ключу (домен+путь, без параметров)
    const key = normalizeKey(body.key);
    for (let r = 1; r < values.length; r++) {
      if (normalizeKey(values[r][iSite]) === key) {
        const row = r + 1;
        if (body.result   !== undefined) sh.getRange(row, idx(COL.result)).setValue(body.result   || '');
        if (body.note     !== undefined) sh.getRange(row, idx(COL.note)).setValue(body.note       || '');
        if (body.lpr      !== undefined) sh.getRange(row, idx(COL.lpr)).setValue(body.lpr         || '');
        if (body.calledAt) {
          sh.getRange(row, idx(COL.called)).setValue(new Date(body.calledAt));
        }
        sh.getRange(row, idx(COL.updated)).setValue(new Date());
        return out({ ok: true, row }, e);
      }
    }
    return out({ error: 'Строка не найдена: ' + key }, e);
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
  s = s.replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
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
  'note': 'Сторона · округ Москвы', 'url': 'Ссылка на карточку / сайт',
  'результат': 'Статус звонка: Не взяли / Перезвонить / Интерес / Отказ',
  'заметка': 'Заметка с сайта-обзвонника (и отметки «WhatsApp: … 16.11»)',
  'лпр': 'Кто принимает решение', 'звонок': 'Когда звонили', 'обновлено': 'Когда меняли строку'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Обзвон')
    .addItem('Оформить все листы', 'formatAll')
    .addItem('Оформить текущий лист', 'formatCurrent')
    .addToUi();
}

function formatAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().filter(sh => isCallSheet_(sh)).forEach(sh => formatSheet(sh));
  ss.toast('Все листы оформлены', 'Обзвон', 4);
}
function formatCurrent() { formatSheet(SpreadsheetApp.getActiveSheet()); }

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
  [COL.result, COL.note, COL.lpr, COL.called, COL.updated].forEach(name => {
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
  style('note', 150, r => r.setFontColor('#9a5f08').setFontSize(10));
  style('url', 220, r => r.setFontColor('#b4426b').setFontSize(10));
  style(COL.result, 130, r => r.setHorizontalAlignment('center').setFontWeight('bold'));
  style(COL.lpr, 160);
  style(COL.note, 340, r => r.setFontSize(10));
  style(COL.called, 110, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));
  style(COL.updated, 110, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));
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
