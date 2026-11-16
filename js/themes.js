/* Тематика = вкладка Google Таблицы. Основная — contacts (всё бьюти), остальные — «Еда», «Другое»…
   Список вкладок отдаёт Apps Script (?sheets=1). Старый скрипт его не знает → выбор скрыт. */
const THEME_KEY='krasota_theme';
const THEME_MAIN='contacts';
let theme=(()=>{try{return localStorage.getItem(THEME_KEY)||THEME_MAIN}catch(e){return THEME_MAIN}})();
const isBeautyTheme=()=>theme===THEME_MAIN;
const themeTitle=n=>n===THEME_MAIN?'Бьюти':n;

/* то же правило, что в программе Search (sheets.py → BEAUTY_RE) */
const BEAUTY_RE=/красот|бьюти|beauty|ногт|маникюр|педикюр|nail|космет|эпиляц|депиляц|шугаринг|воск|барбер|парикмах|стрижк|бров|ресниц|визаж|макияж|стилист|солярий|загар|спа|массаж|перманент|татуаж|тату|пирсинг|lash|brow|эстетик/i;
const isBeautyCategory=c=>!c||BEAUTY_RE.test(c);

function jsonp(params,cb,timeout){
  const name='jsonp_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
  let done=false;
  const t=setTimeout(()=>{if(!done){done=true;delete window[name];cb(null)}},timeout||15000);
  window[name]=d=>{if(done)return;done=true;clearTimeout(t);delete window[name];cb(d)};
  const s=document.createElement('script');
  s.src=API_URL+'?callback='+name+'&'+params+'&t='+Date.now();
  s.onerror=()=>{if(!done){done=true;clearTimeout(t);delete window[name];cb(null)}};
  document.body.appendChild(s);
}

function renderThemes(list){
  const el=$('themes'); if(!el) return;
  if(!list||list.length<2){el.hidden=true;return}
  el.innerHTML=list.map(n=>`<button class="chip ${n===theme?'on':''}" data-theme="${esc(n)}">${esc(themeTitle(n))}</button>`).join('');
  el.hidden=false;
}

function loadThemes(){
  jsonp('sheets=1',d=>{
    if(!d||!Array.isArray(d.sheets)){          // старый скрипт — только основная вкладка
      if(theme!==THEME_MAIN){setTheme(THEME_MAIN)}
      renderThemes(null);return;
    }
    const list=[THEME_MAIN,...d.sheets.filter(n=>n!==THEME_MAIN)];
    if(!list.includes(theme)) setTheme(THEME_MAIN);
    renderThemes(list);
  });
}

async function setTheme(n){
  if(n===theme) return;
  clearTimeout(outTimer); await flushOutbox();   // дослать изменения в старую вкладку
  theme=n;
  try{localStorage.setItem(THEME_KEY,n)}catch(e){}
  document.querySelectorAll('#themes .chip').forEach(c=>c.classList.toggle('on',c.dataset.theme===n));
  items=[];
  $('list').innerHTML='<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  loadData();
}

const themesEl=$('themes');
if(themesEl) themesEl.addEventListener('click',e=>{
  const c=e.target.closest('[data-theme]'); if(c) setTheme(c.dataset.theme);
});
