/**
 * Google Apps Script для таблицы обзвона.
 * Совместим с сайтом (js/api.js читает, js/sync.js пишет POST {key, result, note, calledAt}).
 *
 *  doGet   → все строки листа (JSON или JSONP ?callback=)
 *  doPost  → записывает результат / заметку / время звонка в строку с нужным key
 *  formatSheet() → красиво оформляет лист (данные не трогает)
 *
 * Установка — apps-script/README.md
 */

const SHEET_NAME = '';   // пусто = первый лист

// колонки, которые сайт пишет; если их нет — создадутся справа
const COL = { result: 'результат', note: 'заметка', called: 'звонок', updated: 'обновлено' };
const STATUSES = ['Не взяли', 'Перезвонить', 'Интерес', 'Отказ'];
const STATUS_COLORS = {
  'Не взяли':    ['#e4ecfb', '#2c5bb8'],
  'Перезвонить': ['#fbf0dc', '#9a5f08'],
  'Интерес':     ['#e3f4ea', '#167a4a'],
  'Отказ':       ['#fae5e3', '#b0352f']
};

/* ===================== API ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try { out = readAll_(); } catch (err) { out = { error: String(err.message || err) }; }
  const json = JSON.stringify(out);
  if (p.callback && /^[\w$.]+$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = save_(body);
  } catch (err) {
    out = { error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (SHEET_NAME && ss.getSheetByName(SHEET_NAME)) || ss.getSheets()[0];
}

function readAll_() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const head = values.shift().map(h => String(h).trim());
  return values
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => {
      const o = {};
      head.forEach((h, i) => {
        if (!h) return;
        const v = r[i];
        o[h] = v instanceof Date ? v.toISOString() : v;
      });
      return o;
    });
}

function ensureCol_(sh, head, name) {
  const i = head.findIndex(h => String(h).trim().toLowerCase() === name);
  if (i >= 0) return i;
  head.push(name);
  sh.getRange(1, head.length).setValue(name);
  return head.length - 1;
}

function save_(b) {
  const key = String(b.key || '').trim().toLowerCase();
  if (!key) throw new Error('нет key');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const values = sh.getDataRange().getValues();
    const head = values[0].map(h => String(h).trim());
    const cKey = head.findIndex(h => h.toLowerCase() === 'key');
    const cUrl = head.findIndex(h => /^(url|сайт)$/i.test(h));
    if (cKey < 0 && cUrl < 0) throw new Error('нет колонки key');
    const cRes = ensureCol_(sh, head, COL.result);
    const cNote = ensureCol_(sh, head, COL.note);
    const cCall = ensureCol_(sh, head, COL.called);
    const cUpd = ensureCol_(sh, head, COL.updated);

    let row = -1;
    for (let r = 1; r < values.length; r++) {
      const k = cKey >= 0 ? String(values[r][cKey]) : siteKey_(values[r][cUrl]);
      if (k.trim().toLowerCase() === key) { row = r + 1; break; }
    }
    if (row < 0) throw new Error('не найден: ' + key);

    if (b.result !== undefined) sh.getRange(row, cRes + 1).setValue(STATUSES.indexOf(b.result) >= 0 ? b.result : '');
    if (b.note !== undefined) sh.getRange(row, cNote + 1).setValue(String(b.note).slice(0, 2000));
    if (b.calledAt) sh.getRange(row, cCall + 1).setValue(new Date(Number(b.calledAt)));
    sh.getRange(row, cUpd + 1).setValue(new Date());
    return { ok: true, row: row };
  } finally {
    lock.releaseLock();
  }
}

function siteKey_(url) {
  const m = String(url || '').trim().match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  return m ? (m[1] + m[2]).replace(/\/+$/, '') : String(url || '').trim();
}

/* ===================== ОФОРМЛЕНИЕ ===================== */

/**
 * Запустить из редактора: выбрать formatSheet → ▶ Выполнить.
 * Данные и порядок колонок не меняются, только вид.
 */
function formatSheet() {
  const sh = sheet_();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  [COL.result, COL.note, COL.called, COL.updated].forEach(n => ensureCol_(sh, head, n));
  const cols = head.length;
  const n = Math.max(sh.getLastRow() - 1, 1);
  const idx = name => head.findIndex(h => h.toLowerCase() === name) + 1;   // 1-based, 0 = нет

  // красивые подписи шапки (сами ключи колонок сайт ищет без учёта регистра — оставляем как есть)
  sh.getRange(1, 1, 1, cols)
    .setBackground('#1b1820').setFontColor('#ffffff').setFontWeight('bold')
    .setFontSize(10).setVerticalAlignment('middle').setHorizontalAlignment('left');
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  if (idx('name')) sh.setFrozenColumns(idx('name'));

  const body = sh.getRange(2, 1, n, cols);
  body.setFontFamily('Manrope').setFontSize(11).setVerticalAlignment('middle').setWrap(false)
      .setBorder(null, null, true, null, null, true, '#ebe6e0', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(1, 1, 1, cols).setFontFamily('Manrope');
  sh.setRowHeightsForced(2, n, 34);

  sh.getBandings().forEach(b => b.remove());
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff').setSecondRowColor('#f7f5f2');

  const style = (name, width, fn) => {
    const c = idx(name); if (!c) return;
    sh.setColumnWidth(c, width);
    if (fn) fn(sh.getRange(2, c, n, 1));
  };
  style('name', 240, r => r.setFontWeight('bold'));
  style('category', 130, r => r.setFontColor('#7a7380').setFontSize(10));
  style('address', 280, r => r.setFontColor('#7a7380').setFontSize(10));
  style('phones', 300, r => r.setFontWeight('bold').setFontColor('#1f9d62').setNumberFormat('@'));
  style('note', 220, r => r.setFontColor('#9a5f08').setFontSize(10));
  style('url', 200, r => r.setFontColor('#b4426b').setFontSize(10));
  style(COL.result, 130, r => r.setHorizontalAlignment('center').setFontWeight('bold'));
  style(COL.note, 320, r => r.setWrap(true));
  style(COL.called, 120, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));
  style(COL.updated, 120, r => r.setNumberFormat('dd.MM HH:mm').setFontColor('#7a7380').setHorizontalAlignment('center'));

  // служебные колонки прячем (сайту они не мешают)
  ['key', 'phone_1', 'phone_2', 'phone_3'].forEach(name => { const c = idx(name); if (c) sh.hideColumns(c); });

  // выпадающий список и цвета статусов
  const cRes = idx(COL.result);
  const rules = [];
  if (cRes) {
    const resRange = sh.getRange(2, cRes, n, 1);
    resRange.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true).setAllowInvalid(false).build());
    STATUSES.forEach(s => rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s).setBackground(STATUS_COLORS[s][0]).setFontColor(STATUS_COLORS[s][1])
      .setRanges([resRange]).build()));
    const L = columnLetter_(cRes);
    const nameCol = idx('name') || 1;
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L + '2="Отказ"').setFontColor('#a49dab')
      .setRanges([sh.getRange(2, nameCol, n, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L + '2="Интерес"').setBackground('#e3f4ea').setFontColor('#167a4a')
      .setRanges([sh.getRange(2, nameCol, n, 1)]).build());
  }
  if (idx('phones')) rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenCellEmpty().setBackground('#fff6e6').setRanges([sh.getRange(2, idx('phones'), n, 1)]).build());
  sh.setConditionalFormatRules(rules);

  // фильтр по шапке
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, n + 1, cols).createFilter();

  SpreadsheetApp.getActiveSpreadsheet().toast('Оформление готово', 'Обзвон', 4);
}

function columnLetter_(c) {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; }
  return s;
}
