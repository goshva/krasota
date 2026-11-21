/* Очередь изменений → Google Sheets (POST no-cors, keepalive) */
const outbox=new Map();
let outTimer=null;

function queuePush(key,patch){
  const cur=outbox.get(key)||{};
  outbox.set(key,Object.assign(cur,patch));
  clearTimeout(outTimer);
  outTimer=setTimeout(flushOutbox,900);
}

async function flushOutbox(){
  if(!outbox.size)return;
  const entries=[...outbox.entries()];
  const sheet=isBeautyTheme()?undefined:theme;   // вкладка на момент отправки
  for(const [key,patch] of entries){
    const body=JSON.stringify({
      key,
      sheet,
      result:   patch.result,
      note:     patch.note,
      owner:    (typeof getOwner==='function'&&getOwner())||undefined  // пусто — не трогаем колонку
    });
    try{
      const blob=new Blob([body],{type:'text/plain;charset=UTF-8'});
      const resp=await fetch(API_URL,{method:'POST',mode:'no-cors',keepalive:true,body:blob});
      if(resp.type==='opaque'||resp.type==='basic')outbox.delete(key);
    }catch(e){
      console.warn('sync failed, will retry:',key,e);
    }
  }
}

/* досылка при уходе со страницы */
addEventListener('pagehide',()=>{flushOutbox()});