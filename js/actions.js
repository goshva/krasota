/* Действия пользователя: клик/ввод/возврат на вкладку */
$('list').addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  const card=el.closest('.card');const id=card.dataset.id;
  const it=items.find(x=>x.id===id);const s=st(id);
  const a=el.dataset.a;

  if(a==='call'){
    if(!it.phones.length){e.preventDefault();return}
    s.calledAt=Date.now();saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt});
    pending=id;
    toast('📞 Звонок записан');
    card.outerHTML=cardHTML(it,0);
    return;
  }
  if(a==='pick'){
    s.p=+el.dataset.j;saveState();
    card.outerHTML=cardHTML(it,0);
    return;
  }
  if(a==='copy'){
    const ph=it.phones[s.p||0];if(!ph)return;
    navigator.clipboard?.writeText(fmt(ph)).then(()=>toast('Номер скопирован'),()=>toast(fmt(ph)));
    return;
  }
  if(a==='st'){
    const v=el.dataset.s;
    s.s=s.s===v?'':v;s.ts=Date.now();saveState();
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n||'',calledAt:s.calledAt||0});
    pending=null;
    toast(s.s?STATUS[s.s].t+' ✓':'Статус снят');
    card.classList.remove('ask');
    if(!passes(it)){
      card.style.transition='opacity .25s,transform .25s';
      card.style.opacity='0';card.style.transform='scale(.97)';
      setTimeout(render,230);
    }else{
      card.outerHTML=cardHTML(it,0);
    }
  }
});

$('list').addEventListener('input',e=>{
  if(e.target.dataset.a==='note'){
    const id=e.target.closest('.card').dataset.id;const s=st(id);
    s.n=e.target.value;saveState();autosize(e.target);
    queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n,calledAt:s.calledAt||0});
  }
});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&pending){
    const c=document.querySelector(`.card[data-id="${CSS.escape(pending)}"]`);
    if(c){c.classList.add('ask');c.scrollIntoView({behavior:'smooth',block:'center'})}
    pending=null;
  }
  if(document.visibilityState==='visible')flushOutbox();
});