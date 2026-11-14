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
  $('sheetTitle').textContent=titles[action]||'Выберите номер';
  const cur=(state[id]||{}).p||0;

  $('sheetList').innerHTML=options.map(o=>`
    <button class="sheet-item ${o.idx===cur?'sel':''}" data-sheet-idx="${o.idx}">
      <span class="sheet-num">${o.idx+1}</span>
      <span class="sheet-val">${esc(fmt(o.phone))}</span>
    </button>`).join('');

  $('sheet').dataset.id=id;
  $('sheet').dataset.action=action;
  $('sheet').classList.add('show');
}
function closeSheet(){
  $('sheet').classList.remove('show');
  $('sheet').dataset.id='';
  $('sheet').dataset.action='';
}

function performPhoneAction(id, action, idx){
  const it=items.find(x=>x.id===id); if(!it) return;
  const phone=it.phones[idx]; if(!phone) return;
  const d=digits(phone);
  const s=st(id); s.p=idx;

  if(action==='call'){
    s.calledAt=Date.now(); saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt});
    pending=id;
    toast('📞 Звонок записан');
    setTimeout(()=>{ location.href='tel:+'+d; }, 40);
  }else{
    saveState();
    const urls={wa:'https://wa.me/'+d, tg:'https://t.me/+'+d, max:'https://max.ru/u/+'+d};
    if(urls[action]) window.open(urls[action],'_blank');
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

  if(a==='wa'||a==='tg'||a==='max') return;   // переход по href

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
      closeSheet();
      if(id&&action) performPhoneAction(id,action,idx);
    }
  });
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });