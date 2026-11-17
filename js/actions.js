/* ---------- PICKER (нижняя шторка 1-2-3) ---------- */
function openPhoneSheet(id, action){
  const it=items.find(x=>x.id===id); if(!it) return;
  let options=it.phones.map((p,j)=>({phone:p,idx:j}));
  if(action!=='call') options=options.filter(o=>isMobile(digits(o.phone)));
  if(!options.length) return;

  // один вариант — сразу действие
  if(options.length===1){ performPhoneAction(id, action, options[0].idx); return; }

  const titles={call:'Кому позвонить?',wa:'WhatsApp — на какой номер?',
                tg:'Telegram — на какой номер?',max:'MAX — на какой номер?'};
  $('sheet').dataset.id=id;
  $('sheetTitle').textContent=titles[action]||'Выберите номер';
  const cur=(state[id]||{}).p||0;

  $('sheetList').innerHTML=options.map(o=>`
    <a class="sheet-item ${o.idx===cur?'sel':''}" data-sheet-idx="${o.idx}" href="${esc(phoneHref(action,digits(o.phone)))}"${action==='call'?'':' target="_blank" rel="noopener"'}>
      <span class="sheet-num">${o.idx+1}</span>
      <span class="sheet-val">${esc(fmt(o.phone))}</span>
    </a>`).join('');

  $('sheet').dataset.id=id;
  $('sheet').dataset.action=action;
  $('sheet').classList.add('show');
}
function closeSheet(){
  $('sheet').classList.remove('show');
  $('sheet').dataset.id='';
  $('sheet').dataset.action='';
}

/* прямая ссылка на номер: tel:, WhatsApp, Telegram, MAX */
function phoneHref(action,d){
  if(action==='call') return 'tel:+'+d;
  const id=$('sheet').dataset.id;
  return msgHref(action,d,items.find(x=>x.id===id));
}

function performPhoneAction(id, action, idx, viaLink){
  const it=items.find(x=>x.id===id); if(!it) return;
  const phone=it.phones[idx]; if(!phone) return;
  const d=digits(phone);
  const s=st(id); s.p=idx;

  if(action==='call'){
    s.calledAt=Date.now(); saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt});
    pending=id;
    toast('📞 Звонок записан');
    if(!viaLink) setTimeout(()=>{ location.href='tel:+'+d; }, 40);
  }else{
    saveState();
    if(!viaLink) window.open(msgHref(action,d,it),'_blank');
    onMessengerClick(id,action,phone);   // текст в буфер + отметка в таблице (перерисует карточку)
    return;
  }

  const card=document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if(card) card.outerHTML=cardHTML(it,0);
}

/* ---------- ДЕЛЕГИРОВАНИЕ КЛИКОВ ---------- */
$('list').addEventListener('click',e=>{
  const el=e.target.closest('[data-a]'); if(!el) return;
  const card=el.closest('.card'); if(!card) return;
  const id=card.dataset.id;
  const it=items.find(x=>x.id===id); if(!it) return;
  const s=st(id);
  const a=el.dataset.a;

  if(a==='call'){
    // прямая ссылка на номер (один телефон)
    if(!it.phones.length){e.preventDefault();return}
    s.calledAt=Date.now(); saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt});
    pending=id;
    toast('📞 Звонок записан');
    return;
  }

  if(a==='call-pick'||a==='wa-pick'||a==='tg-pick'||a==='max-pick'){
    e.preventDefault();
    openPhoneSheet(id, a.split('-')[0]);
    return;
  }

  if(a==='wa'||a==='tg'||a==='max'){          // переход по href + текст/отметка
    const m=it.phones.find(p=>isMobile(digits(p)));
    onMessengerClick(id,a,m);
    return;
  }

  if(a==='tpl'){
    e.preventDefault();
    s.tpl=el.dataset.t; saveState();
    card.outerHTML=cardHTML(it,0);
    return;
  }

  if(a==='share'){
    e.preventDefault();
    copyCardLink(id);
    return;
  }

  if(a==='copy'){
    e.preventDefault();
    const ph=it.phones[s.p||0]; if(!ph) return;
    navigator.clipboard?.writeText(fmt(ph)).then(()=>toast('Номер скопирован'),()=>toast(fmt(ph)));
    return;
  }

  if(a==='st'){
    e.preventDefault();
    const v=el.dataset.s;
    s.s=s.s===v?'':v; s.ts=Date.now(); saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt||0});
    pending=null;
    toast(s.s?STATUS[s.s].t+' ✓':'Статус снят');
    card.classList.remove('ask');
    if(!passes(it)){
      card.style.transition='opacity .25s,transform .25s';
      card.style.opacity='0'; card.style.transform='scale(.97)';
      setTimeout(render,230);
    }else{
      card.outerHTML=cardHTML(it,0);
    }
  }
});

$('list').addEventListener('input',e=>{
  if(e.target.dataset.a==='note'){
    const id=e.target.closest('.card').dataset.id; const s=st(id);
    s.n=e.target.value; saveState(); autosize(e.target);
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n,calledAt:s.calledAt||0});
  }
});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&pending){
    const c=document.querySelector(`.card[data-id="${CSS.escape(pending)}"]`);
    if(c){c.classList.add('ask');c.scrollIntoView({behavior:'smooth',block:'center'})}
    pending=null;
  }
  if(document.visibilityState==='visible') flushOutbox();
});

/* ---------- клики по шторке ---------- */
const sheetEl=$('sheet');
if(sheetEl){
  sheetEl.addEventListener('click',e=>{
    if(e.target.closest('[data-a="sheet-close"]')){e.preventDefault();closeSheet();return}
    const item=e.target.closest('[data-sheet-idx]');
    if(item){
      const id=sheetEl.dataset.id;
      const action=sheetEl.dataset.action;
      const idx=+item.dataset.sheetIdx;
      // ссылка сама откроет звонок/мессенджер — только записываем и закрываем шторку
      closeSheet();
      if(id&&action) performPhoneAction(id,action,idx,true);
    }
  });
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });
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
