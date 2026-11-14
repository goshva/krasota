/* localStorage + доступ к state */
function loadState(){
  try{state=JSON.parse(localStorage.getItem(LS_KEY))||{}}catch(e){state={}}
}
function saveState(){
  try{localStorage.setItem(LS_KEY,JSON.stringify(state))}catch(e){}
}
const st=id=>state[id]||(state[id]={});