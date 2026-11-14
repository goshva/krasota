/* Построение списка и HTML карточек */
function build(rows){
  const seen=new Map();
  rows.forEach((row,i)=>{
    const site=pick(row,/^(сайт|site|url)$/i)||pick(row,/сайт|site|url/i);
    if(!site)return;
    const key=keyOf(site);
    if(seen.has(key))return;

    const c=CONTACTS[key]||{};
    const sheetPhone=pick(row,/^телефон|phone/i);
    let phones=[...(c.phones||[])];
    if(sheetPhone&&/\d{6}/.test(sheetPhone)){
      const d='+'+digits(sheetPhone);
      if(!phones.includes(d))phones.unshift(d);
    }

    /* данные из таблицы */
    const sheetRes = pick(row,/результат/i);
    const sheetNote= pick(row,/заметка/i);
    const sheetCall= pick(row,/^звонок|called/i);
    const sheetUpd = pick(row,/^обновлено|updated/i);
    const resKey=Object.keys(STATUS).find(k=>STATUS[k].t.toLowerCase()===sheetRes.toLowerCase())||'';
    const calledAt=sheetCall?new Date(sheetCall).getTime():0;

    /* мердж: local wins, sheet — фолбэк */
    const local=state[key]||{};
    state[key]={
      s:       local.s||resKey||'',
      n:       local.n||sheetNote||'',
      calledAt:local.calledAt||calledAt||0,
      ts:      Math.max(local.ts||0,sheetUpd?new Date(sheetUpd).getTime():0),
      p:       local.p||0
    };

    /* если локально есть — дослать в таблицу */
    if(local.s&&!resKey)        queuePush(key,{result:STATUS[local.s].t,note:local.n||'',calledAt:local.calledAt||0});
    else if(local.n&&!sheetNote)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n,calledAt:local.calledAt||0});
    else if(local.calledAt&&!calledAt)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n||'',calledAt:local.calledAt});

    seen.set(key,{
      id:key,i,site,phones,
      name:cleanName(c.name,key),
      sub:[c.category,c.address].filter(Boolean).join(' · '),
      note:c.note||'',
      search:(cleanName(c.name,key)+' '+[c.category,c.address].filter(Boolean).join(' ')+' '+key+' '+phones.map(p=>digits(p)+' '+fmt(p)).join(' ')).toLowerCase()
    });
  });
  items=[...seen.values()];
  saveState();
  render();
}

/* фильтры/счётчики */
const statusOf=it=>(state[it.id]||{}).s||'';
function passes(it){
  const s=statusOf(it);
  if(filter==='all')return true;
  if(filter==='nophone')return !it.phones.length;
  if(filter==='left')return !s;
  return s===filter;
}
function counts(){
  const n={all:items.length,left:0,callback:0,noanswer:0,interest:0,refused:0,nophone:0};
  items.forEach(it=>{const s=statusOf(it);if(!s)n.left++;else n[s]++;if(!it.phones.length)n.nophone++});
  for(const k in n)$('n-'+k).textContent=n[k];
  const doneN=items.length-n.left;
  const pct=items.length?Math.round(doneN/items.length*100):0;
  $('ringFg').style.strokeDashoffset=125.66*(1-pct/100);
  $('ringPct').textContent=pct+'%';
  const today=items.filter(it=>{const t=(state[it.id]||{}).ts;return t&&new Date(t).toDateString()===new Date().toDateString()}).length;
  $('sub').innerHTML=`<b>${doneN}</b> из ${items.length} · сегодня <b>${today}</b>`;
  return n;
}

/* карточка */
function cardHTML(it,idx){
  const s=state[it.id]||{},status=s.s||'';
  const sel=Math.min(s.p||0,Math.max(it.phones.length-1,0));
  const ph=it.phones[sel],d=ph?digits(ph):'';
  const tag=status?`<span class="tag" style="color:${STATUS[status].c};background:${STATUS[status].bg}">${STATUS[status].t}</span>`:'';
  const color=AV[hash(it.id)%AV.length];
  const alt=it.phones.length>1?`<div class="alt">${it.phones.map((p,j)=>`<button data-a="pick" data-j="${j}" class="${j===sel?'sel':''}">${esc(fmt(p))}</button>`).join('')}</div>`:'';
  const mobile=it.phones.map(digits).find(isMobile)||'';
  const waUrl = mobile?'https://wa.me/'+mobile:'';
  const tgUrl = mobile?'https://t.me/+'+mobile:'';
  const maxUrl= mobile?'https://max.ru/u/+'+mobile:'';
  const metaParts=[];
  if(s.calledAt)metaParts.push('📞 '+ago(s.calledAt));
  if(s.ts&&s.ts!==s.calledAt)metaParts.push('✓ '+ago(s.ts));

  return `<article class="card ${status&&!OPEN.has(status)?'closed':''}" data-id="${esc(it.id)}" style="animation-delay:${Math.min(idx,12)*25}ms">
    <div class="c-top">
      <div class="av" style="background:${color}">${esc(initials(it.name))}</div>
      <div class="c-name"><h3>${esc(it.name)}</h3>${it.sub?`<p>${esc(it.sub)}</p>`:''}</div>
      ${tag}
    </div>
    <div class="phone-row">
      ${ph?`<a class="num" href="tel:+${d}" data-a="call">${esc(fmt(ph))}</a>`:`<span class="num none">Номер не найден</span>`}
      ${alt}
    </div>
    ${!ph&&it.note?`<div class="hint">${esc(it.note)} — откройте сайт и запишитесь/напишите там.</div>`:''}
    <div class="acts">
      <a class="btn call ${ph?'':'off'}" href="${ph?'tel:+'+d:'#'}" data-a="call">${IC.phone}${ph?'Позвонить':'Нет номера'}</a>
      <a class="btn wa" href="${waUrl||'#'}" target="_blank" rel="noopener" title="WhatsApp" ${waUrl?'':'aria-disabled="true"'}>${IC.wa}</a>
      <a class="btn tg" href="${tgUrl||'#'}" target="_blank" rel="noopener" title="Telegram" ${tgUrl?'':'aria-disabled="true"'}>${IC.tg}</a>
      <a class="btn max" href="${maxUrl||'#'}" target="_blank" rel="noopener" title="MAX" ${maxUrl?'':'aria-disabled="true"'}>${IC.max}</a>
    </div>
    <div class="res">${Object.entries(STATUS).map(([k,v])=>`<button data-a="st" data-s="${k}" class="${status===k?'on':''}">${v.t}</button>`).join('')}</div>
    <textarea class="note" data-a="note" rows="1" placeholder="Заметка: ЛПР, время, что сказали…">${esc(s.n||'')}</textarea>
    <div class="meta">
      <a href="${esc(it.site)}" target="_blank" rel="noopener">${IC.ext}${esc(it.id.replace(/^www\./,''))}</a>
      <div class="meta-actions">
        <button class="meta-btn" data-a="copy" title="Копировать номер" ${ph?'':'aria-disabled="true"'}>${IC.copy}</button>
        <span>${metaParts.join(' · ')}</span>
      </div>
    </div>
  </article>`;
}

function render(){
  counts();
  const q=query.toLowerCase(),qd=query.replace(/\D/g,'');
  let list=items.filter(it=>passes(it)&&(!q||it.search.includes(q)||(qd.length>=3&&it.search.includes(qd))));
  list.sort((a,b)=>(!!b.phones.length-!!a.phones.length)||(((state[a.id]||{}).ts||0)-((state[b.id]||{}).ts||0))||a.i-b.i);
  $('list').innerHTML=list.length?list.map(cardHTML).join('')
    :`<div class="empty">${IC.empty}<div>${query?'Ничего не найдено':'Здесь пока пусто'}</div></div>`;
  $('list').querySelectorAll('.note').forEach(autosize);
  const next=nextItem();
  $('fab').hidden=!next;
  if(next)$('fabTxt').innerHTML=`Следующий <small>${esc(next.name.slice(0,22))}</small>`;
}

function nextItem(){return items.filter(it=>it.phones.length&&!statusOf(it)).sort((a,b)=>a.i-b.i)[0]}
function autosize(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,160)+'px'}