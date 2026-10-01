import { $, todayStr, addDays, diffDays } from "./utils.js";
import { whoAmI } from "./settings.js";
import { plants, putPlant, removePlant } from "./sync.js";
import { shrinkImage } from "./photos.js";
import { toast, splash, openDetail, openModal, closeModal } from "./ui.js";

function effectiveFreq(p){
  return Math.max(1, Math.min(120, +p.waterFreq || 7));
}
function plantState(p){
  const f = effectiveFreq(p);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(p.lastWater || "") ? p.lastWater : (p.createdAt || todayStr()).slice(0,10);
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
  const revision = ++formRevision;
  $("f-identify").disabled = false;
  $("f-suggestions").hidden = true;
  try{
    const photo = await shrinkImage(file, 640, .68);
    if(revision !== formRevision) return;
    formPhoto = photo;
    $("f-prev").innerHTML = `<img src="${formPhoto}" alt="Foto de la planta">`;
    $("f-aistatus").style.display = "block";
    $("f-aistatus").textContent = "Foto lista. Puedes pedir sugerencias con Gemini.";
  }catch(e){ toast("No se pudo leer la foto. Prueba con otra imagen."); }
}

function savePlant(e){
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
  putPlant(p); closeModal("form-modal"); toast(old ? "Planta actualizada ✏️" : "¡Planta añadida! 🌿");
}

/* ============ Acciones ============ */
function trimPlant(p){
  // Firestore limita cada documento a ~1MB: recorta diario e historial si hace falta
  while(JSON.stringify(p).length > 850000 && (p.gallery||[]).length > 1) p.gallery.pop();
  return p;
}
function water(id, el){
  const p = plants.find(x=>x.id===id); if(!p) return;
  const prev = { lastWater: p.lastWater, history: p.history ? [...p.history] : [] };
  splash(el);
  p.lastWater = todayStr();
  p.history = [{t:"agua", date:todayStr(), by:whoAmI()}, ...(p.history||[])];
  p.updatedAt = new Date().toISOString(); p.updatedBy = whoAmI();
  putPlant(p);
  toast(`💧 ${p.name} regada`, "Deshacer", ()=>{
    p.lastWater = prev.lastWater; p.history = prev.history;
    p.updatedAt = new Date().toISOString(); p.updatedBy = whoAmI();
    putPlant(p); toast("Riego deshecho ↩️");
    if($("detail-modal").classList.contains("open")) openDetail(id);
  });
}
function fertilize(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  p.lastFert = todayStr();
  p.history = [{t:"abono", date:todayStr(), by:whoAmI()}, ...(p.history||[])];
  p.updatedAt = new Date().toISOString(); p.updatedBy = whoAmI();
  putPlant(p); openDetail(id); toast(`🌱 ${p.name} abonada`);
}
function delPlant(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}"? Desaparecerá también del móvil de tu pareja.`)) return;
  removePlant(id); closeModal("detail-modal"); toast("Planta eliminada 🗑️");
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
function importData(e){
  const file = e.target.files[0]; e.target.value=""; if(!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try{
      const d = JSON.parse(ev.target.result);
      const list = Array.isArray(d) ? d : d.plants;
      if(!Array.isArray(list)) throw 0;
      let n=0;
      list.forEach(np=>{
        const local = plants.find(x=>x.id===np.id);
        if(!local || (np.updatedAt||"") > (local.updatedAt||"")){ delete np.deleted; putPlant(np); n++; }
      });
      closeModal("account-modal");
      toast(`Restauradas ${n} plantas ✅`);
    }catch(err){ toast("Ese archivo no es un jardín válido ❌"); }
  };
  r.readAsText(file);
}

export { effectiveFreq, plantState, formPhoto, formLight, formRevision, setLight, openForm, pickPhoto, savePlant, trimPlant, water, fertilize, delPlant, exportDownload, importData, invalidateForm, setFormLight };
