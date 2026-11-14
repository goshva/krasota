// Копия скрипта из Google Таблицы «красота» (Расширения → Apps Script).
// Исправлено: поиск строки по колонке key/url и normalizeKey без URL() (в Apps Script его нет).
// Добавлено: formatSheet() — оформление листа.

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
  const sh = getSheet();
  if (!sh) return out({ error: 'Лист не найден: ' + SHEET_NAME }, e);

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
    const sh = getSheet();
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
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
   Запуск: выбрать formatSheet → ▶ Выполнить. Данные не меняются, только вид. */
const STATUSES = ['Не взяли', 'Перезвонить', 'Интерес', 'Отказ'];
const STATUS_COLORS = {
  'Не взяли':    ['#e4ecfb', '#2c5bb8'],
  'Перезвонить': ['#fbf0dc', '#9a5f08'],
  'Интерес':     ['#e3f4ea', '#167a4a'],
  'Отказ':       ['#fae5e3', '#b0352f']
};

function formatSheet() {
  const sh = getSheet();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  [COL.result, COL.note, COL.lpr, COL.called, COL.updated].forEach(name => {
    if (head.indexOf(name) < 0) { head.push(name); sh.getRange(1, head.length).setValue(name); }
  });
  const cols = head.length;
  const n = Math.max(sh.getLastRow() - 1, 1);
  const idx = name => head.indexOf(name) + 1;

  sh.getRange(1, 1, 1, cols).setBackground('#1b1820').setFontColor('#ffffff').setFontWeight('bold')
    .setFontSize(10).setVerticalAlignment('middle').setHorizontalAlignment('left');
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  if (idx('name')) sh.setFrozenColumns(idx('name'));

  const body = sh.getRange(2, 1, n, cols);
  body.setFontSize(11).setVerticalAlignment('middle').setWrap(false)
      .setBorder(null, null, true, null, null, true, '#ebe6e0', SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeightsForced(2, n, 34);
  sh.getBandings().forEach(b => b.remove());
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff').setSecondRowColor('#f7f5f2');

  const style = (name, width, fn) => { const c = idx(name); if (!c) return; sh.setColumnWidth(c, width); if (fn) fn(sh.getRange(2, c, n, 1)); };
  style('name', 240, r => r.setFontWeight('bold'));
  style('category', 130, r => r.setFontColor('#7a7380').setFontSize(10));
  style('address', 280, r => r.setFontColor('#7a7380').setFontSize(10));
  style('phones', 300, r => r.setFontWeight('bold').setFontColor('#1f9d62'));
  style('note', 220, r => r.setFontColor('#9a5f08').setFontSize(10));
  style('url', 200, r => r.setFontColor('#b4426b').setFontSize(10));
  style(COL.result, 130, r => r.setHorizontalAlignment('center').setFontWeight('bold'));
  style(COL.lpr, 160);
  style(COL.note, 320, r => r.setWrap(true));
  style(COL.called, 120, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));
  style(COL.updated, 120, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));
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
      .setFontColor('#a49dab').setRanges([sh.getRange(2, nc, n, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L + '2="Интерес"')
      .setBackground('#e3f4ea').setFontColor('#167a4a').setRanges([sh.getRange(2, nc, n, 1)]).build());
  }
  if (idx('phones')) rules.push(SpreadsheetApp.newConditionalFormatRule().whenCellEmpty()
    .setBackground('#fff6e6').setRanges([sh.getRange(2, idx('phones'), n, 1)]).build());
  sh.setConditionalFormatRules(rules);

  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, n + 1, cols).createFilter();
  SpreadsheetApp.getActiveSpreadsheet().toast('Оформление готово', 'Обзвон', 4);
}

function colLetter_(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
