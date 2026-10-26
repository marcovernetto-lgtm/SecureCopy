(async()=>{
  const data=await window.diskNotice.get();
  const english=data.language==='en';
  document.documentElement.lang=english?'en':'it';
  document.getElementById('notice-title').textContent=data.card?(english?'Memory card connected':'Scheda di memoria collegata'):(english?'New drive connected':'Nuovo disco collegato');
  document.getElementById('volume-name').textContent=data.name;
  document.getElementById('notice-description').textContent=english?'Ready to make a copy of your footage?':'Vuoi preparare una copia del materiale?';
  document.getElementById('later').textContent=english?'Not now':'Non ora';
  document.getElementById('dismiss').setAttribute('aria-label',english?'Not now':'Non ora');
  document.getElementById('prepare').firstChild.textContent=english?'Prepare copy ':'Prepara copia ';
  const act=async action=>{
    for(const button of document.querySelectorAll('button'))button.disabled=true;
    try{await window.diskNotice.act(action);}catch(error){document.getElementById('notice-description').textContent=english?'The drive is no longer available.':'Il disco non è più disponibile.';document.getElementById('later').disabled=false;document.getElementById('dismiss').disabled=false;}
  };
  document.getElementById('prepare').onclick=()=>act('prepare');
  document.getElementById('later').onclick=document.getElementById('dismiss').onclick=()=>act('dismiss');
  document.addEventListener('keydown',event=>{if(event.key==='Escape')act('dismiss')});
})().catch(console.error);
