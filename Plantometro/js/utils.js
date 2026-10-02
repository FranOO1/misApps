

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
function dateNumber(s){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");if(!m)return NaN;
  const n=Date.UTC(+m[1],+m[2]-1,+m[3]);return new Date(n).toISOString().slice(0,10)===s?n:NaN;
}
const addDays=(s,n)=>new Date(dateNumber(s)+n*864e5).toISOString().slice(0,10);
const diffDays=(a,b)=>(dateNumber(b)-dateNumber(a))/864e5;
const fmt = dStr => { if(!dStr) return "—"; const d = new Date(dStr+"T12:00:00"); return d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"}); };
const LIGHT = {sol:"☀️ Sol directo", media:"⛅ Luz media", sombra:"🌑 Sombra"};

export { $, esc, todayStr, addDays, diffDays, dateNumber, fmt, LIGHT };

const PLANT_ART = `<svg viewBox="0 0 160 160" aria-hidden="true"><use href="#plant-art"/></svg>`;
export { PLANT_ART };
