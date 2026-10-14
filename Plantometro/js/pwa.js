// Apply a downloaded update when it cannot interrupt a form or an unconfirmed save.
// This module starts separately from app.js: an old cached module must not prevent
// the new worker from installing and recovering a partially updated legacy page.
let started=false,pendingCheck=null;
function startPWA(check){
  if(typeof check==='function')pendingCheck=check;
  if(started||!('serviceWorker' in navigator))return;
  started=true;
  let alreadyControlled=!!navigator.serviceWorker.controller;
  let registration,updateReady=false,reloading=false,lastCheck=0;
  const reloadWhenIdle=()=>{
    const editing=document.querySelector('.modal.open,#toast.show button,#nickname-gate:not([hidden])') || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
    const saving=pendingCheck?pendingCheck():/Guardando cambios|Cambios pendientes en este dispositivo/.test(document.getElementById('sync-status')?.textContent||'');
    if(!updateReady||reloading||document.hidden||editing||saving)return;
    reloading=true;location.reload();
  };
  const checkUpdate=()=>{
    if(!registration||!navigator.onLine||Date.now()-lastCheck<60000)return;
    lastCheck=Date.now();registration.update().catch(()=>{});
  };
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(alreadyControlled){updateReady=true;reloadWhenIdle();}else alreadyControlled=true;
  });
  const observer=new MutationObserver(reloadWhenIdle);
  document.querySelectorAll('.modal').forEach(modal=>observer.observe(modal,{attributes:true,attributeFilter:['class']}));
  const toast=document.querySelector('#toast');if(toast)observer.observe(toast,{attributes:true,attributeFilter:['class'],childList:true});
  document.addEventListener('focusout',()=>queueMicrotask(reloadWhenIdle));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){reloadWhenIdle();checkUpdate();}});
  window.addEventListener('online',()=>{lastCheck=0;checkUpdate();reloadWhenIdle();});
  window.addEventListener('plantometro:sync-idle',reloadWhenIdle);
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(value=>{registration=value;checkUpdate();}).catch(()=>{});
}
startPWA();
export {startPWA};
