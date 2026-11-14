/* Чистые helper-функции */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function keyOf(url){
  try{const u=new URL(String(url).trim());return (u.host+u.pathname).replace(/\/+$/,'').toLowerCase()}
  catch(e){return String(url).trim().toLowerCase()}
}
function digits(p){
  let d=String(p).replace(/\D/g,'');
  if(d.length===11&&d[0]==='8')d='7'+d.slice(1);
  if(d.length===10)d='7'+d;
  return d;
}
function fmt(p){
  const d=digits(p);
  return d.length===11?`+7 ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9)}`:p;
}
const isMobile=d=>/^79/.test(d);

function cleanName(n,key){
  n=String(n||'').split(/\s[|–—]\s|\s-\s/)[0].replace(/^"(.*)"$/,'$1').trim();
  return n||key.split('/')[0].replace(/^www\./,'');
}
function initials(n){
  const w=n.replace(/[^\p{L}\p{N}\s]/gu,'').trim().split(/\s+/);
  return ((w[0]||'?')[0]+(w[1]?w[1][0]:'')).toUpperCase();
}
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)}
function pick(row,re){
  const k=Object.keys(row).find(k=>re.test(String(k).trim()));
  return k?String(row[k]??'').trim():'';
}
function ago(ts){
  if(!ts)return'';
  const m=Math.round((Date.now()-ts)/60000);
  if(m<1)return'только что';
  if(m<60)return m+' мин назад';
  const h=Math.round(m/60);
  if(h<24)return h+' ч назад';
  return new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
}
function toast(t){
  const el=$('toast');el.textContent=t;el.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>el.classList.remove('show'),1800);
}