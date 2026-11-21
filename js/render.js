/* Построение списка и HTML карточек */
function build(rows){
  const hadItems = items.length > 0;
  const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
  const seen=new Map();
  rows.forEach((row,i)=>{
    const site=pick(row,/^(сайт|site|url)$/i)||pick(row,/сайт|site|url/i);
    if(!site)return;
    const key=keyOf(site);
    if(seen.has(key))return;

    const c=CONTACTS[key]||{};
    if(isBeautyTheme()&&!c.name&&!isBeautyCategory(pick(row,/^(category|категория)$/i)))return;
    const sheetPhone=pick(row,/^телефон|phone/i);
    const fromSheet=splitPhones(sheetPhone);
    const fromContacts=splitPhones(c.phones||[]);
    const phones=[...new Set([...fromSheet,...fromContacts])];

    const sheetRes = pick(row,/результат/i);
    const sheetNote= pick(row,/заметка/i);
    const sheetCall= pick(row,/^звонок|called/i);
    const sheetUpd = pick(row,/^обновлено|updated/i);
    const resKey=Object.keys(STATUS).find(k=>STATUS[k].t.toLowerCase()===sheetRes.toLowerCase())||'';
    const calledAt=sheetCall?new Date(sheetCall).getTime():0;

    const local=state[key]||{};
    state[key]={
      s:       local.s||resKey||'',
      n:       local.n||sheetNote||'',
      calledAt:local.calledAt||calledAt||0,
      ts:      Math.max(local.ts||0,sheetUpd?new Date(sheetUpd).getTime():0),
      p:       local.p||0
    };

    if(local.s&&!resKey)        queuePush(key,{result:STATUS[local.s].t,note:local.n||'',calledAt:local.calledAt||0});
    else if(local.n&&!sheetNote)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n,calledAt:local.calledAt||0});
    else if(local.calledAt&&!calledAt)queuePush(key,{result:local.s?STATUS[local.s].t:'',note:local.n||'',calledAt:local.calledAt});

    const rowKey =pick(row,/^key$/i);
    const rowName=pick(row,/^(name|название)$/i)||(/^(https?:\/\/|[\w-]+\.[\w.-]+\/)/i.test(rowKey)?'':rowKey);
    const name=cleanName(c.name||rowName,key);
    const area=c.name?'':pick(row,/^note$/i);
    const sub=[c.category||pick(row,/^(category|категория)$/i),c.address||pick(row,/^(address|адрес)$/i),area].filter(Boolean).join(' · ');
    seen.set(key,{
      id:key,i,site,phones,
      name,
      sub,
      note:c.note||'',
      search:(name+' '+sub+' '+key+' '+phones.map(p=>digits(p)+' '+fmt(p)).join(' ')).toLowerCase()
    });
  });
  items=[...seen.values()];
  saveState();
  if (typeof saveItemsCache === 'function') saveItemsCache();
  render(hadItems);
  if (scrollY > 0) {
    requestAnimationFrame(()=>{ try{ window.scrollTo(0, scrollY); }catch(e){} });
  }
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
  for(const k in n){ const el=$('n-'+k); if(el.textContent!==String(n[k])){ el.textContent=n[k]; if(counts.ready)bump(el); } }
  if(items.length)counts.ready=true;
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
  const s=state[it.id]||{}, status=s.s||'';
  const phones=it.phones;
  const sel=Math.min(s.p||0,Math.max(phones.length-1,0));
  const active=phones[sel]||'';
  const activeD=active?digits(active):'';
  const mobiles=phones.filter(p=>isMobile(digits(p)));

  const tag=status?`<span class="tag" style="color:${STATUS[status].c};background:${STATUS[status].bg}">${STATUS[status].t}</span>`:'';
  const color=AV[hash(it.id)%AV.length];

  const multi=phones.length>1;
  const idxBadge=multi?`<span class="num-idx">${sel+1}/${phones.length}</span>`:'';

  // звонок: если телефонов >1 — открываем пикер
  const callA  = multi ? 'call-pick' : 'call';
  const callHref = multi ? '#' : (active?'tel:+'+activeD:'#');

  // мессенджеры — только мобильные; если мобильных >1, тоже пикер
  const waA  = mobiles.length>1?'wa-pick':(mobiles.length===1?'wa':null);
  const tgA  = mobiles.length>1?'tg-pick':(mobiles.length===1?'tg':null);
  const maxA = mobiles.length>1?'max-pick':(mobiles.length===1?'max':null);
  const m0 = mobiles[0]?digits(mobiles[0]):'';
  const waHref  = waA==='wa' ?msgHref('wa',m0,it):'#';
  const tgHref  = tgA==='tg' ?msgHref('tg',m0,it):'#';
  const maxHref = maxA==='max'?msgHref('max',m0,it):'#';
  const tpl=tplOf(it.id);
  const sentLog=lastMsgLog(s.n);

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
      ${active?`<a class="num" href="tel:+${activeD}" data-a="call">${esc(fmt(active))}</a>${idxBadge}`
              :`<span class="num none">Номер не найден</span>`}
    </div>
    ${!active&&it.note?`<div class="hint">${esc(it.note)} — откройте сайт и запишитесь/напишите там.</div>`:''}
    ${mobiles.length&&isBeautyTheme()?`<div class="tpl">
      <span class="tpl-lbl">Сообщение:</span>
      ${Object.entries(MSG_TPL).map(([k,v])=>`<button data-a="tpl" data-t="${k}" class="${tpl===k?'on':''}">${v.t}</button>`).join('')}
    </div>
    ${sentLog?`<div class="sent">✉ Уже писали — ${esc(sentLog)}</div>`:''}`:''}
    <div class="acts">
      <a class="btn call ${active?'':'off'}" href="${callHref}" data-a="${active?callA:'noop'}">${IC.phone}${active?(multi?' · '+(sel+1):''):'Нет номера'}</a>
      <a class="btn wa"  href="${waHref}"  data-a="${waA||'noop'}"  ${waA?'':'aria-disabled="true"'}  target="${waA==='wa'?'_blank':''}"  rel="noopener" title="WhatsApp">${IC.wa}</a>
      <a class="btn tg"  href="${tgHref}"  data-a="${tgA||'noop'}"  ${tgA?'':'aria-disabled="true"'}  target="${tgA==='tg'?'_blank':''}"  rel="noopener" title="Telegram">${IC.tg}</a>
      <a class="btn max" href="${maxHref}" data-a="${maxA||'noop'}" ${maxA?'':'aria-disabled="true"'} target="${maxA==='max'?'_blank':''}" rel="noopener" title="MAX">${IC.max}</a>
    </div>
    <div class="res">${Object.entries(STATUS).map(([k,v])=>`<button data-a="st" data-s="${k}" class="${status===k?'on':''}">${v.t}</button>`).join('')}</div>
    <textarea class="note" data-a="note" rows="1" placeholder="Заметка: ЛПР, время, что сказали…">${esc(s.n||'')}</textarea>
    <div class="meta">
      <a href="${esc(it.site)}" target="_blank" rel="noopener">${IC.ext}${esc(it.id.replace(/^www\./,''))}</a>
      <div class="meta-actions">
        <button class="meta-btn" data-a="share" title="Ссылка на карточку" aria-label="Ссылка на карточку"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
        <button class="meta-btn" data-a="copy" title="Копировать номер" ${active?'':'aria-disabled="true"'}>${IC.copy}</button>
        <span>${metaParts.join(' · ')}</span>
      </div>
    </div>
  </article>`;
}

function render(noAnim){
  counts();
  const q=query.toLowerCase(),qd=query.replace(/\D/g,'');
  let list=items.filter(it=>passes(it)&&(!q||it.search.includes(q)||(qd.length>=3&&it.search.includes(qd))));
  list.sort((a,b)=>(!!b.phones.length-!!a.phones.length)||(((state[a.id]||{}).ts||0)-((state[b.id]||{}).ts||0))||a.i-b.i);
  $('list').innerHTML=list.length?list.map(cardHTML).join('')
    :`<div class="empty">${IC.empty}<div>${query?'Ничего не найдено':'Здесь пока пусто'}</div></div>`;
  $('list').querySelectorAll('.note').forEach(autosize);
  markChanged();
  if (noAnim) {
    $('list').querySelectorAll('.card').forEach(c=>{c.style.animation='none'});
  }
  const next=nextItem();
  $('fab').hidden=!next;
  if(next)$('fabTxt').innerHTML=`Следующий <small>${esc(next.name.slice(0,22))}</small>`;
}

function nextItem(){return items.filter(it=>it.phones.length&&!statusOf(it)).sort((a,b)=>a.i-b.i)[0]}
function autosize(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,160)+'px'}

/* Плавная смена значений: прошлые статусы храним в localStorage,
   если статус карточки изменился — мягкий fade-up у ярлыка (≈400 мс) */
const LS_PREV_KEY='krasota_prev_status';
function bump(el){ el.classList.remove('changed'); void el.offsetWidth; el.classList.add('changed'); }
function markChanged(){
  let prev={}; try{ prev=JSON.parse(localStorage.getItem(LS_PREV_KEY))||{}; }catch(e){}
  const first=!Object.keys(prev).length;
  const now={};
  items.forEach(it=>{ now[it.id]=statusOf(it); });
  if(!first) document.querySelectorAll('#list .card').forEach(c=>{
    const id=c.dataset.id;
    if(id in prev && prev[id]!==now[id]){ const t=c.querySelector('.tag'); if(t) bump(t); }
  });
  try{ localStorage.setItem(LS_PREV_KEY,JSON.stringify(now)); }catch(e){}
}
