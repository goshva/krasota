/* Глобальные константы и DOM-ссылки */
const API_URL='https://script.google.com/macros/s/AKfycbxvpiTH_ZPgnUoQGu--oN0WWj6POh2vcOVNuY5XQIkF1tVgHHhJWQ57VsKVYJCKlnwD/exec';
const LS_KEY='krasota_calls_v3';
const CONTACTS=window.CONTACTS||{};

const STATUS={
  noanswer:{t:'Не взяли',c:'var(--blue)',bg:'var(--blue-soft)'},
  callback:{t:'Перезвонить',c:'var(--amber)',bg:'var(--amber-soft)'},
  interest:{t:'Интерес',c:'var(--call)',bg:'var(--call-soft)'},
  refused:{t:'Отказ',c:'var(--red)',bg:'var(--red-soft)'}
};
const OPEN=new Set(['','noanswer','callback']);
const AV=['#b4426b','#7b5cc4','#2f8f83','#c46a3a','#3c6fd1','#9a4fa8','#4f8a3c','#c24b5a'];

const IC={
  phone:'<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  wa:'<svg viewBox="0 0 24 24"><path d="M3 21l1.7-4.6A8.5 8.5 0 1 1 8 19.6Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.8-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-1.8Z" stroke-width="1.5"/></svg>',
  tg:'<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  max:'<svg viewBox="0 0 24 24"><path d="M5 19V5l7 9 7-9v14" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  web:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  ext:'<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  empty:'<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
};

/* Изменяемое состояние */
let items=[];
let state={};
let filter='left';
let query='';
let pending=null;

/* DOM */
const $=id=>document.getElementById(id);
