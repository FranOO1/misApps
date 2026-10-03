import { $ } from "./utils.js";
import { toast, render, closeModal } from "./ui.js";

/* Device preferences; migrate only the legacy Gemini credential. */
let settings = { city:"Granada", lat:37.1773, lon:-3.5986, theme:"auto", name:"", summerMode:false, streak:0, streakDate:"", lastNotif:"" };
try {
  const s=localStorage.getItem("pg3b_settings");
  if(s){
    const o=JSON.parse(s);
    if(o && typeof o==='object' && !Array.isArray(o)){
      if(Object.hasOwn(o,'geminiKey')){
        delete o.geminiKey;
        try{localStorage.setItem('pg3b_settings',JSON.stringify(o));}catch{}
      }
      if(!o.name && (o.u1||o.u2))o.name=(o.active===2?o.u2:o.u1)||'';
      settings=Object.assign(settings,o);
    }
  }
}catch{}
function persistSettings(){
  delete settings.geminiKey;
  try{localStorage.setItem('pg3b_settings',JSON.stringify(settings));}catch{}
}
function applyTheme(){
  const wantsDark=settings.theme==='dark'||(settings.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',wantsDark);
  document.querySelectorAll('#themeopts button').forEach(b=>b.classList.toggle('on',b.dataset.v===settings.theme));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
function setTheme(t){settings.theme=t;persistSettings();applyTheme();}
function renderSettingsUI(){
  $('s-city').value=settings.city;$('s-name').value=settings.name||'';
  $('s-summer').classList.toggle('on',!!settings.summerMode);
  $('s-summer-sw').textContent=settings.summerMode?'SÍ':'NO';applyTheme();
}
function toggleSummer(){
  settings.summerMode=!settings.summerMode;persistSettings();renderSettingsUI();render();
  toast(settings.summerMode?'Contexto de verano activado':'Modo verano desactivado');
}
function saveSettings(){
  settings.name=$('s-name').value.trim();persistSettings();renderSettingsUI();closeModal('settings-modal');toast('Ajustes guardados.');
}
function whoAmI(){return (settings.name||'').trim()||'Alguien';}
export {settings,persistSettings,applyTheme,setTheme,renderSettingsUI,toggleSummer,saveSettings,whoAmI};
