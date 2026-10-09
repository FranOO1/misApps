import { validateBackup } from "./backup.js";
import { aiEnabled, aiStatus } from "./ai-service.js";
import { $, esc, todayStr, addDays, diffDays, dateNumber, PLANT_ART } from "./utils.js";
import { whoAmI } from "./settings.js";
import { plants, putPlant, removePlant, putPlantsBatch, updatePlantTransaction, sessionToken, patchPlant, arrayUnion, isPlantPending } from "./sync.js";
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
let formPhoto = null, formLight = "", formRevision = 0, formOriginal=null;
function renderFormPhoto(){
  $("f-prev").innerHTML = formPhoto ? `<img src="${esc(formPhoto)}" alt="Vista previa de la foto">` : PLANT_ART;
  $("f-photo-button").textContent = formPhoto ? "Cambiar foto" : "Añadir foto";
}
function chooseFormPhoto(){
  // Reset only the picker: cancelling leaves the current photo and draft intact.
  $("f-photo").value = "";
  $("f-photo").click();
}
function updateReminderUnit(){
  $("f-freq-unit").textContent = +$("f-freq").value === 1 ? "día" : "días";
}
function setLight(v){ formLight = formLight===v ? "" : v; document.querySelectorAll("#f-light button").forEach(b=>b.classList.toggle("on", b.dataset.v===formLight)); }
function openForm(id){
  const p = id ? plants.find(x=>x.id===id) : null;
  formOriginal=p?JSON.parse(JSON.stringify(p)):null;
  $("form-title").textContent = p ? "Editar planta" : "Nueva planta";
  $("f-id").value = p?.id || "";
  $("f-name").value = p?.name || ""; $("f-species").value = p?.species || "";
  $("f-loc").value = p?.loc || ""; $("f-desc").value = p?.desc || "";
  $("f-freq").value = p?.waterFreq || 7; $("f-last").value = p?.lastWater || "";
  updateReminderUnit();
  $("f-fertfreq").value = p?.fertFreq || 0; $("f-fertlast").value = p?.lastFert || "";
  $("f-potsize").value = p?.potSize || ""; $("f-potdate").value = p?.potDate || "";
  formRevision++;
  $("f-suggestions").hidden = true; $("f-suggestions").replaceChildren();
  $("f-identify").disabled = !aiEnabled();
  $("f-ai-availability").textContent = aiStatus();
  $("f-details").open = !!p;
  $("f-aistatus").style.display = "none";
  formPhoto = p?.photo || null; formLight = p?.light || "";
  renderFormPhoto();
  $("f-photo").value = "";
  document.querySelectorAll("#f-light button").forEach(b=>b.classList.toggle("on", b.dataset.v===formLight));
  openModal("form-modal");
}
async function pickPhoto(e){
  const file = e.target.files[0]; if(!file) return;
  const revision = ++formRevision, session=sessionToken();
  $("f-identify").disabled = !aiEnabled();
  $("f-suggestions").hidden = true;
  try{
    const photo = await shrinkImage(file, 640, .68);
    if(revision !== formRevision || session!==sessionToken()) return;
    formPhoto = photo;
    renderFormPhoto();
    $("f-aistatus").style.display = "block";
    $("f-aistatus").textContent = "Foto lista.";
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
  const fields=['name','species','loc','light','desc','photo','waterFreq','lastWater','fertFreq','lastFert','potSize','potDate'];
  const patch=formOriginal?Object.fromEntries(fields.filter(k=>JSON.stringify(formOriginal[k]??(typeof p[k]==='number'?0:''))!==JSON.stringify(p[k]??'')).map(k=>[k,p[k]])):null;
  if(patch&&Object.hasOwn(patch,'lastWater'))patch.lastWaterEventId='';
  closeModal('form-modal');
  if(patch&&!Object.keys(patch).length){toast('La ficha no ha cambiado.');return;}
  const session=sessionToken(),result=putPlant(p,{type:'edited',...(patch?{patch}:{})});
  toast(navigator.onLine===false?'Ficha pendiente de conexión.':'Guardando la ficha…');
  if(await result){if(session===sessionToken())toast(old?'Ficha actualizada.':'Planta añadida.');}
  else if(session===sessionToken())openForm(id);
}

/* ============ Acciones ============ */
function trimPlant(p){ return p; } // Nunca recortar fotos ni historial silenciosamente.

async function water(id,el){
  const original=plants.find(x=>x.id===id);if(!original||isPlantPending(id))return false;
  const p=JSON.parse(JSON.stringify(original)),eventId=crypto.randomUUID(),at=new Date().toISOString();
  const event={t:'agua',date:todayStr(),at,by:whoAmI(),eventId,previousLastWater:p.lastWater||'',previousWaterEventId:p.history?.find(h=>h.t==='agua')?.eventId||''};
  splash(el);p.lastWater=todayStr();p.lastWaterEventId=eventId;p.history=[event,...(p.history||[])];p.updatedAt=at;p.updatedBy=whoAmI();
  const session=sessionToken(),pending=patchPlant(p,{lastWater:p.lastWater,lastWaterEventId:eventId,history:arrayUnion(event)},'watered',{},eventId);
  toast(navigator.onLine===false?'Riego pendiente de conexión.':'Guardando riego…');
  const success=await pending;
  if(success&&session===sessionToken())toast('Riego guardado. Gracias por cuidarla.','Deshacer',()=>correctWater(id,eventId));
  return success;
}
function removeWaterEvent(p,eventId){
  const ordered=(p.history||[]).slice().sort((a,b)=>(Date.parse(b.at||b.date+'T12:00:00')||0)-(Date.parse(a.at||a.date+'T12:00:00')||0));
  const event=ordered.find(h=>h.eventId===eventId&&h.t==='agua');if(!event)return null;
  const newest=ordered.find(h=>h.t==='agua'),remaining=ordered.filter(h=>h.t==='agua'&&h.eventId!==eventId);
  const older=remaining.find(h=>(Date.parse(h.at||h.date+'T12:00:00')||0)<=(Date.parse(event.at||event.date+'T12:00:00')||0));
  const history=p.history.filter(h=>h.eventId!==eventId).map(h=>h.previousWaterEventId===eventId?{...h,previousWaterEventId:older?.eventId||event.previousWaterEventId||'',previousLastWater:older?.date||event.previousLastWater||''}:h);
  const wasLatest=p.lastWaterEventId? p.lastWaterEventId===eventId : newest.eventId===eventId&&p.lastWater===event.date;
  return {...p,history,...(wasLatest?{lastWater:remaining[0]?.date||event.previousLastWater||'',lastWaterEventId:remaining[0]?.eventId||''}:{}),updatedAt:new Date().toISOString(),updatedBy:whoAmI()};
}
async function correctWater(id,eventId){
  const result=await updatePlantTransaction(id,p=>removeWaterEvent(p,eventId),{correctsEventId:eventId});
  if(result&&$('detail-modal').classList.contains('open'))openDetail(id);
  return result;
}
async function fertilize(id){
  const original=plants.find(x=>x.id===id);if(!original||isPlantPending(id))return false;
  const p=JSON.parse(JSON.stringify(original)),eventId=crypto.randomUUID(),at=new Date().toISOString();
  const entry={t:'abono',date:todayStr(),at,by:whoAmI(),eventId};
  p.lastFert=todayStr();p.history=[entry,...(p.history||[])];p.updatedAt=at;p.updatedBy=whoAmI();
  const session=sessionToken(),pending=patchPlant(p,{lastFert:p.lastFert,history:arrayUnion(entry)},'fertilized',{},eventId);
  toast(navigator.onLine===false?'Abono pendiente de conexión.':'Guardando abono…');
  const success=await pending;if(success&&session===sessionToken()){openDetail(id);toast('Abono guardado.');}return success;
}
async function delPlant(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}"? También desaparecerá de tus otros dispositivos.`)) return;
  closeModal("detail-modal");
  const session=sessionToken();
  if(await removePlant(id))toast("Planta eliminada y confirmada en la nube.");
  else if(session===sessionToken())openDetail(id);
}

function invalidateForm(){
  formRevision++; $("f-identify").disabled=!aiEnabled(); $("f-suggestions").hidden=true;
  $("f-aistatus").style.display="none";
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
export {effectiveFreq,plantState,formPhoto,formLight,formRevision,setLight,openForm,chooseFormPhoto,updateReminderUnit,pickPhoto,savePlant,trimPlant,water,correctWater,removeWaterEvent,fertilize,delPlant,exportDownload,importData,invalidateForm,setFormLight};
