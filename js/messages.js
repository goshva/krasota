/* Шаблоны сообщений в мессенджеры + отметка «писали» в таблице.
   Отправка только ручная: кнопка открывает чат с готовым текстом, человек сам жмёт «Отправить». */

const MSG_EXAMPLES=[
  ['Время красоты','https://davydovserg.github.io/studio-time-/'],
  ['Артелия','https://davydovserg.github.io/Arteliy/']
];
const MSG_LINKS=MSG_EXAMPLES.map(([n,u])=>`• ${n} — ${u}`).join('\n');

const MSG_TPL={
  talked:{
    t:'После разговора',
    text:n=>`Добрый день, «${n}»! Спасибо, что уделили время на разговор.\n\n`+
      `Как договаривались, присылаю примеры сайтов, которые мы сделали для салонов красоты:\n${MSG_LINKS}\n\n`+
      `Посмотрите, когда будет минутка, — с радостью ответим на вопросы.`
  },
  noanswer:{
    t:'Не взяли трубку',
    text:n=>`Добрый день, «${n}»! Звонили вам сегодня, но не дозвонились.\n\n`+
      `Хотели показать примеры сайтов, которые мы делаем для салонов красоты:\n${MSG_LINKS}\n\n`+
      `Если интересно — напишите, когда удобно созвониться.`
  }
};
const MSG_APP={wa:'WhatsApp',tg:'Telegram',max:'Max'};

/* выбранный шаблон: ручной выбор в карточке, иначе по статусу */
function tplOf(id){
  const s=state[id]||{};
  if(MSG_TPL[s.tpl])return s.tpl;
  return s.s==='noanswer'?'noanswer':'talked';
}
function msgText(it){
  const name=String(it.name||'').replace(/^[«"“]+|[»"”]+$/g,'').trim();
  return MSG_TPL[tplOf(it.id)].text(name);
}

/* ссылка на чат: WhatsApp — с текстом; Telegram — по номеру (текст в буфер);
   MAX не открывает чат по номеру — открываем MAX, текст в буфер */
function msgHref(action,d,it){
  if(!isBeautyTheme())it=null;                 // шаблоны — только для бьюти
  if(action==='wa')return 'https://wa.me/'+d+(it?'?text='+encodeURIComponent(msgText(it)):'');
  if(action==='tg')return 'https://t.me/+'+d;
  if(action==='max')return 'https://web.max.ru/';
  return '#';
}

function copyText(text){
  const legacy=()=>{
    const ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(e){}
    ta.remove();return ok;
  };
  if(navigator.clipboard&&window.isSecureContext){
    return navigator.clipboard.writeText(text).then(()=>true,()=>legacy());
  }
  return Promise.resolve(legacy());
}

/* последняя отметка «писали» из заметки: «WhatsApp: после разговора 16.11» */
const MSG_LOG_RE=/(WhatsApp|Telegram|Max): (после разговора|не взяли трубку) (\d{2}\.\d{2})/gi;
function lastMsgLog(note){
  const all=[...String(note||'').matchAll(MSG_LOG_RE)];
  return all.length?all[all.length-1][0]:'';
}

/* вызывается при клике по кнопке мессенджера (в карточке или в шторке) */
function onMessengerClick(id,action,phone){
  if(!isBeautyTheme()) return;                 // не бьюти: просто открыть чат
  const it=items.find(x=>x.id===id); if(!it) return;
  const s=st(id);
  const text=msgText(it);

  if(action==='tg'||action==='max'){
    copyText(text).then(ok=>{
      if(!ok){toast('Не удалось скопировать текст');return}
      toast(action==='tg'
        ?'Текст скопирован — вставьте в чат Telegram'
        :'Текст скопирован. В MAX найдите '+fmt(phone)+' и вставьте',4500);
    });
  }else{
    toast('Открываю WhatsApp — проверьте текст и отправьте');
  }

  // отметка в заметке → колонка «заметка» таблицы (существующий doPost)
  const date=new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
  const line=`${MSG_APP[action]}: ${MSG_TPL[tplOf(id)].t.toLowerCase()} ${date}`;
  const note=s.n||'';
  if(!note.split('\n').some(l=>l.trim()===line)){
    s.n=note?note.replace(/\s+$/,'')+'\n'+line:line;
  }
  s.ts=Date.now(); saveState();
  queuePush(id,{result:s.s?STATUS[s.s].t:'',note:s.n,calledAt:s.calledAt||0});

  // перерисовка после того, как ссылка уже открылась (отсоединённая <a> не переходит)
  setTimeout(()=>{
    const card=document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if(!card) return;
    card.outerHTML=cardHTML(it,0);
    const ta=document.querySelector(`.card[data-id="${CSS.escape(id)}"] .note`); if(ta) autosize(ta);
  },300);
}
