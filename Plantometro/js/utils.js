

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const addDays = (dStr, n) => { const d = new Date(dStr+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const diffDays = (a, b) => Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00")) / 864e5);
const fmt = dStr => { if(!dStr) return "—"; const d = new Date(dStr+"T12:00:00"); return d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}); };
const LIGHT = {sol:"☀️ Sol directo", media:"⛅ Luz media", sombra:"🌑 Sombra"};

export { $, esc, todayStr, addDays, diffDays, fmt, LIGHT };
