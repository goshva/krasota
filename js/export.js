/* Экспорт текущих данных в CSV (Excel/Google Sheets) */
$('exportBtn').addEventListener('click',()=>{
  const rows=[['Название','Адрес','Телефоны','Сайт','Статус','Заметка','Звонок','Обновлено']];
  items.forEach(it=>{
    const s=state[it.id]||{};
    rows.push([
      it.name,it.sub,it.phones.map(fmt).join(', '),it.site,
      s.s?STATUS[s.s].t:'',
      s.n||'',
      s.calledAt?new Date(s.calledAt).toLocaleString('ru-RU'):'',
      s.ts?new Date(s.ts).toLocaleString('ru-RU'):''
    ]);
  });
  const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='obzvon_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();toast('CSV скачан');
});