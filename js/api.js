/* Чтение из Google Sheets через JSONP (обход CORS) */
function loadData(){
  $('refreshBtn').classList.add('spin');
  $('err').classList.remove('show');
  const cb='jsonp_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
  let done=false;

  const fail=msg=>{
    if(done)return;done=true;delete window[cb];
    $('refreshBtn').classList.remove('spin');
    $('err').textContent=msg;$('err').classList.add('show');
    if(!items.length)build(Object.keys(CONTACTS).map(k=>({'сайт':'https://'+k})));
  };
  const t=setTimeout(()=>fail('Таблица не ответила за 15 секунд — показываю сохранённый список.'),15000);

  window[cb]=data=>{
    if(done)return;done=true;
    clearTimeout(t);delete window[cb];
    $('refreshBtn').classList.remove('spin');
    if(!Array.isArray(data)){
      done=false;
      return fail(data&&data.error?('Ошибка таблицы: '+data.error):'Неожиданный ответ таблицы.');
    }
    build(data);toast('Список обновлён');
  };

  const s=document.createElement('script');
  s.src=API_URL+'?callback='+cb+'&t='+Date.now();
  s.onerror=()=>{clearTimeout(t);fail('Не удалось загрузить таблицу — показываю сохранённый список.')};
  document.body.appendChild(s);
}