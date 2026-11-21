/* localStorage + доступ к state */
function loadState(){
  try{state=JSON.parse(localStorage.getItem(LS_KEY))||{}}catch(e){state={}}
}
function saveState(){
  try{localStorage.setItem(LS_KEY,JSON.stringify(state))}catch(e){}
}
const st=id=>state[id]||(state[id]={});
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

/* Имя менеджера → колонка «кто занимается» */
const LS_OWNER_KEY='krasota_owner';
function getOwner(){ try{ return (localStorage.getItem(LS_OWNER_KEY)||'').trim(); }catch(e){ return ''; } }
function setOwner(v){ try{ localStorage.setItem(LS_OWNER_KEY,String(v||'').trim()); }catch(e){} }
