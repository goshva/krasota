/* Голосовой поиск (Chrome/Edge/Safari) */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition,mic=$('mic');
if(SR){
  const r=new SR();r.lang='ru-RU';
  r.onresult=e=>{
    const t=e.results[0][0].transcript;
    $('q').value=t;query=t.trim();
    $('searchBox').classList.add('has');
    render();
  };
  r.onend=r.onerror=()=>mic.classList.remove('rec');
  mic.addEventListener('click',e=>{
    e.preventDefault();
    if(mic.classList.contains('rec'))return r.stop();
    mic.classList.add('rec');r.start();
  });
}else{
  mic.style.display='none';
}