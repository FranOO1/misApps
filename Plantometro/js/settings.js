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
const legacyNickname=(settings.name||"").trim();
let nicknameUid=null;
function nicknameKey(uid){return "pg3_nickname_"+uid;}
function showCurrentName(){const el=$("current-name");if(el){el.textContent=settings.name?"Con "+settings.name:"";el.hidden=!settings.name;}}
function selectNickname(uid){
  const previous=nicknameUid;nicknameUid=uid||null;
  if(!uid){settings.name="";showCurrentName();$("nickname-gate").hidden=true;$("app-shell").inert=false;return;}
  let name="";
  try{
    name=localStorage.getItem(nicknameKey(uid))||"";
    // The old device nickname belongs only to the first account migrating here.
    if(!localStorage.getItem("pg3_nickname_migrated")&&!previous){
      if(!name)name=legacyNickname.slice(0,40);
      if(name)localStorage.setItem(nicknameKey(uid),name);
      localStorage.setItem("pg3_nickname_migrated",uid);
    }
  }catch{}
  settings.name=name;showCurrentName();renderSettingsUI();
  $("nickname-gate").hidden=!!name;$("app-shell").inert=!name;
  if(!name){$("nickname-input").value="";setTimeout(()=>$("nickname-input").focus(),0);}
}
function continueNickname(e){
  e?.preventDefault();if(!nicknameUid)return;
  const name=$("nickname-input").value.trim().slice(0,40);if(!name){$("nickname-input").focus();return;}
  try{localStorage.setItem(nicknameKey(nicknameUid),name);}catch{}
  settings.name=name;persistSettings();showCurrentName();renderSettingsUI();$("nickname-gate").hidden=true;$("app-shell").inert=false;window.dispatchEvent(new Event("plantometro:sync-idle"));
}
function saveSettings(){
  settings.name=$('s-name').value.trim().slice(0,40);if(nicknameUid){try{localStorage.setItem(nicknameKey(nicknameUid),settings.name);}catch{}}showCurrentName();persistSettings();renderSettingsUI();closeModal('settings-modal');toast('Ajustes guardados.');
}
function whoAmI(){return (settings.name||'').trim()||'Alguien';}
export {settings,persistSettings,applyTheme,setTheme,renderSettingsUI,toggleSummer,saveSettings,whoAmI,selectNickname,continueNickname};
