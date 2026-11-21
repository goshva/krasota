/* Фильтры, поиск, FAB, refresh, scroll */
function setFilter(f){
  filter=f;
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.f===f));
}
$('chips').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(!c)return;
  setFilter(c.dataset.f);render();
  window.scrollTo({top:0,behavior:'smooth'});
});

$('q').addEventListener('input',e=>{
  query=e.target.value.trim();
  $('searchBox').classList.toggle('has',!!query);
  render();
});
$('clearQ').addEventListener('click',e=>{
  e.preventDefault();
  $('q').value='';query='';
  $('searchBox').classList.remove('has');
  render();$('q').focus();
});

$('fab').addEventListener('click',()=>{
  const n=nextItem();if(!n)return;
  if(filter!=='left'&&filter!=='all')setFilter('left');
  query='';$('q').value='';
  $('searchBox').classList.remove('has');
  render();
  const c=document.querySelector(`.card[data-id="${CSS.escape(n.id)}"]`);
  if(c){c.scrollIntoView({behavior:'smooth',block:'center'});c.classList.add('ask');setTimeout(()=>c.classList.remove('ask'),2500)}
});

$('refreshBtn').addEventListener('click',loadData);
addEventListener('scroll',()=>$('head').classList.toggle('scrolled',scrollY>4),{passive:true});

/* Кто звонит: спрашиваем один раз, меняется тапом по имени в шапке */
function showOwner(){ const n=getOwner(); $('ownerName').textContent=n||'Имя'; $('ownerBtn').classList.toggle('empty',!n); }
function askOwner(){
  const v=prompt('Как вас зовут? Имя попадёт в колонку «кто занимается».', getOwner());
  if(v!==null){ setOwner(v); showOwner(); }
}
$('ownerBtn').addEventListener('click',askOwner);
showOwner();
if(!getOwner()) setTimeout(askOwner,600);
