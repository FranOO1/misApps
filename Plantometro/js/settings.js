import { $, todayStr } from "./utils.js";
import { alive } from "./sync.js";
import { plantState } from "./plants.js";
import { toast, render, closeModal } from "./ui.js";

/* ============ Ajustes locales (clima y tema) ============ */
let settings = { city:"Granada", lat:37.1773, lon:-3.5986, theme:"auto", name:"", geminiKey:"", summerMode:false, streak:0, streakDate:"", lastNotif:"" };
try {
  const s = localStorage.getItem("pg3b_settings");
  if (s) {
    const o = JSON.parse(s);
    if (!o.name && (o.u1 || o.u2)) o.name = (o.active===2 ? o.u2 : o.u1) || ""; // migración del formato antiguo
    settings = Object.assign(settings, o);
  }
} catch(e){}
function persistSettings(){ try{ localStorage.setItem("pg3b_settings", JSON.stringify(settings)); }catch(e){} }

function applyTheme(){
  const wantsDark = settings.theme==="dark" || (settings.theme==="auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", wantsDark);
  document.querySelectorAll("#themeopts button").forEach(b=>b.classList.toggle("on", b.dataset.v===settings.theme));
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
function setTheme(t){ settings.theme=t; persistSettings(); applyTheme(); }
function renderSettingsUI(){
  $("s-city").value = settings.city;
  $("s-name").value = settings.name || "";
  $("s-gkey").value = settings.geminiKey || "";
  $("s-summer").classList.toggle("on", !!settings.summerMode);
  $("s-summer-sw").textContent = settings.summerMode ? "SÍ" : "NO";
  $("s-notif-sw").textContent = !("Notification" in window) ? "N/D" : Notification.permission==="granted" ? "SÍ" : "NO";
  applyTheme();
}
function toggleSummer(){
  settings.summerMode = !settings.summerMode;
  persistSettings(); renderSettingsUI(); render();
  toast(settings.summerMode ? "☀️ Contexto de verano activado: comprueba la humedad" : "Modo verano desactivado");
}
async function enableNotifs(){
  if(!("Notification" in window)){ toast("Este navegador no admite notificaciones"); return; }
  const perm = await Notification.requestPermission();
  renderSettingsUI();
  toast(perm==="granted" ? "🔔 Avisos activados" : "Permiso de avisos denegado");
  if(perm==="granted") maybeNotify(true);
}
function maybeNotify(force){
  if(!("Notification" in window) || Notification.permission!=="granted") return;
  const t = todayStr();
  if(!force && settings.lastNotif===t) return;
  const hoy=[], tarde=[];
  alive().forEach(p=>{ const s=plantState(p).state; if(s==="today") hoy.push(p.name); if(s==="late") tarde.push(p.name); });
  if(!hoy.length && !tarde.length) return;
  settings.lastNotif = t; persistSettings();
  const body = [tarde.length?`🌱 Por revisar: ${tarde.join(", ")}`:"", hoy.length?`💧 Hoy: ${hoy.join(", ")}`:""].filter(Boolean).join("\n");
  navigator.serviceWorker?.ready.then(reg=>reg.showNotification("Plantómetro 🪴", {body: body + " · Comprueba la tierra antes de regar."})).catch(()=>{
    try{ new Notification("Plantómetro 🪴", {body: body + " · Comprueba la tierra antes de regar."}); }catch(e){}
  });
}
function saveSettings(){
  settings.name = $("s-name").value.trim();
  settings.geminiKey = $("s-gkey").value.trim();
  persistSettings(); renderSettingsUI(); closeModal("settings-modal"); toast("Ajustes guardados 🌿");
}


function whoAmI(){ return (settings.name || "").trim() || "Alguien"; }

export { settings, persistSettings, applyTheme, setTheme, renderSettingsUI, toggleSummer, enableNotifs, maybeNotify, saveSettings, whoAmI };
