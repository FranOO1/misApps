import { validateBackup } from "./backup.js";
import { $, todayStr, addDays, diffDays, dateNumber } from "./utils.js";
import { whoAmI } from "./settings.js";
import { plants, putPlant, removePlant, putPlantsBatch, updatePlantTransaction, sessionToken } from "./sync.js";
import { shrinkImage } from "./photos.js";
import { toast, splash, openDetail, openModal, closeModal } from "./ui.js";

function effectiveFreq(p){
  return Math.max(1, Math.min(120, +p.waterFreq || 7));
}
function plantState(p){
  const f = effectiveFreq(p);
  const created=(p.createdAt||"").slice(0,10);
  const base=Number.isFinite(dateNumber(p.lastWater))?p.lastWater:Number.isFinite(dateNumber(created))?created:todayStr();
  const next = addDays(base, f);
  const d = diffDays(todayStr(), next);
  return { next, d, f, state: d<0 ? "late" : d===0 ? "today" : "ok" };
}
/* ============ Formulario ============ */
let formPhoto = null, formLight = "", formRevision = 0;
function setLight(v){ formLight = formLight===v ? "" : v; document.querySelectorAll("#f-light button").forEach(b=>b.classList.toggle("on", b.dataset.v===formLight)); }
function openForm(id){
  const p = id ? plants.find(x=>x.id===id) : null;
  $("form-title").textContent = p ? "Editar planta" : "Nueva planta";
  $("f-id").value = p?.id || "";
  $("f-name").value = p?.name || ""; $("f-species").value = p?.species || "";
  $("f-loc").value = p?.loc || ""; $("f-desc").value = p?.desc || "";
  $("f-freq").value = p?.waterFreq || 7; $("f-last").value = p?.lastWater || "";
  $("f-fertfreq").value = p?.fertFreq || 0; $("f-fertlast").value = p?.lastFert || "";
  $("f-potsize").value = p?.potSize || ""; $("f-potdate").value = p?.potDate || "";
  formRevision++;
  $("f-suggestions").hidden = true; $("f-suggestions").replaceChildren();
  $("f-identify").disabled = false;
  $("f-details").open = !!p;
  $("f-aistatus").style.display = "none";
  formPhoto = p?.photo || null; formLight = p?.light || "";
  $("f-prev").innerHTML = formPhoto ? `<img src="${formPhoto}" alt="">` : "🪴";
  $("f-photo").value = "";
  document.querySelectorAll("#f-light button").forEach(b=>b.classList.toggle("on", b.dataset.v===formLight));
  openModal("form-modal");
}
async function pickPhoto(e){
  const file = e.target.files[0]; if(!file) return;
  const revision = ++formRevision, session=sessionToken();
  $("f-identify").disabled = false;
  $("f-suggestions").hidden = true;
  try{
    const photo = await shrinkImage(file, 640, .68);
    if(revision !== formRevision || session!==sessionToken()) return;
    formPhoto = photo;
    $("f-prev").innerHTML = `<img src="${formPhoto}" alt="Foto de la planta">`;
    $("f-aistatus").style.display = "block";
    $("f-aistatus").textContent = "Foto lista. Puedes pedir sugerencias con Gemini.";
  }catch(e){ toast("No se pudo leer la foto. Prueba con otra imagen."); }
}

async function savePlant(e){
  e.preventDefault();
  const id = $("f-id").value || (Date.now().toString(36)+Math.random().toString(36).slice(2,7));
  const old = plants.find(x=>x.id===id);
  const p = {
    ...old,
    id,
    name: $("f-name").value.trim(),
    species: $("f-species").value.trim(),
    loc: $("f-loc").value.trim(),
    light: formLight,
    desc: $("f-desc").value.trim(),
    photo: formPhoto,
    waterFreq: Math.max(1, +$("f-freq").value || 7),
    lastWater: $("f-last").value || "",
    fertFreq: Math.max(0, +$("f-fertfreq").value || 0),
    lastFert: $("f-fertlast").value || "",
    potSize: $("f-potsize").value.trim(),
    potDate: $("f-potdate").value || "",
    gallery: old?.gallery || [],
    lastAI: old?.lastAI || null,
    history: old?.history || [],
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: whoAmI()
  };
  closeModal("form-modal");
  const session=sessionToken(), result=putPlant(p);toast("Ficha actualizada en este dispositivo. Consulta Cuenta para ver la sincronización.");
  if(!await result && session===sessionToken())openForm(id);
}

/* ============ Acciones ============ */
function trimPlant(p){ return p; } // Nunca recortar fotos ni historial silenciosamente.

function water(id, el){
  const p = plants.find(x=>x.id===id); if(!p) return;
  const eventId=crypto.randomUUID();
  const event={t:"agua",date:todayStr(),by:whoAmI(),eventId,previousLastWater:p.lastWater||"",previousWaterEventId:p.history?.find(h=>h.t==="agua")?.eventId||""};
  splash(el);p.lastWater=todayStr();p.history=[event,...(p.history||[])];
  p.updatedAt=new Date().toISOString();p.updatedBy=whoAmI();
  const pending=putPlant(p);
  toast(`💧 ${p.name}: riego registrado en este dispositivo`,"Deshacer",()=>correctWater(id,eventId));
  return pending;
}
function removeWaterEvent(p,eventId){
  const event=p.history?.find(h=>h.eventId===eventId && h.t==="agua");if(!event)return null;
  const newest=p.history.find(h=>h.t==="agua");
  const history=p.history.filter(h=>h.eventId!==eventId).map(h=>h.previousWaterEventId===eventId ? {...h,previousWaterEventId:event.previousWaterEventId||"",previousLastWater:event.previousLastWater||""}:h);
  return {...p,history,lastWater:newest.eventId===eventId && p.lastWater===event.date ? (event.previousLastWater||"") : p.lastWater,updatedAt:new Date().toISOString(),updatedBy:whoAmI()};
}
async function correctWater(id,eventId){
  const result=await updatePlantTransaction(id,p=>removeWaterEvent(p,eventId));
  if(result && $("detail-modal").classList.contains("open"))openDetail(id);
  return result;
}

function fertilize(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  p.lastFert = todayStr();
  p.history = [{t:"abono", date:todayStr(), by:whoAmI()}, ...(p.history||[])];
  p.updatedAt = new Date().toISOString(); p.updatedBy = whoAmI();
  putPlant(p); openDetail(id); toast(`🌱 ${p.name} abonada`);
}
async function delPlant(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}"? Desaparecerá también del móvil de tu pareja.`)) return;
  closeModal("detail-modal");
  const session=sessionToken();
  if(await removePlant(id))toast("Planta eliminada y confirmada en la nube.");
  else if(session===sessionToken())openDetail(id);
}

function invalidateForm(){
  formRevision++; $("f-identify").disabled=false; $("f-suggestions").hidden=true;
}
function setFormLight(value){
  formLight=value;
  document.querySelectorAll("#f-light button").forEach(b=>b.classList.toggle("on",b.dataset.v===formLight));
}
/* ============ Copia de seguridad ============ */
function exportDownload(){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({app:"plantometro",v:3,exported:new Date().toISOString(),plants})],{type:"application/json"}));
  a.download = `plantometro_${todayStr()}.json`; a.click();
  toast("Copia descargada 💾");
}
async function importData(e){
  const file=e.target.files[0];e.target.value="";if(!file)return;
  const session=sessionToken();
  try{
    if(file.size>10*1024*1024)throw Error("El archivo supera 10 MB");
    const list=validateBackup(JSON.parse(await file.text()));
    if(session!==sessionToken())throw Error("La cuenta cambió; abre la copia de nuevo");
    const selected=list.filter(np=>{const old=plants.find(p=>p.id===np.id);return !old || (np.updatedAt||"")>(old.updatedAt||"");});
    if(!selected.length){toast("La copia es válida; todas las fichas ya son iguales o más recientes.");return;}
    if(!confirm(`Copia válida: restaurar ${selected.length} ${selected.length===1?'planta':'plantas'} y conservar ${list.length-selected.length} fichas más recientes. Se aplicará en una sola operación. ¿Continuar?`))return;
    if(await putPlantsBatch(selected)){toast(`Restauración confirmada: ${selected.length} ${selected.length===1?'planta':'plantas'}.`);closeModal("account-modal");}
  }catch(err){toast("No se restauró ninguna ficha: " + (err.message||"copia inválida"));}
}
export {effectiveFreq,plantState,formPhoto,formLight,formRevision,setLight,openForm,pickPhoto,savePlant,trimPlant,water,correctWater,removeWaterEvent,fertilize,delPlant,exportDownload,importData,invalidateForm,setFormLight};
