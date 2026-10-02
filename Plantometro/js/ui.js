import { $, esc, todayStr, addDays, diffDays, fmt, LIGHT, PLANT_ART } from "./utils.js";
import { renderSettingsUI, maybeNotify } from "./settings.js";
import { plants, alive } from "./sync.js";
import { weatherContext } from "./weather.js";
import { plantState, openForm, water, correctWater, fertilize, delPlant, invalidateForm } from "./plants.js";
import { renderGallery } from "./photos.js";
import { aiReviewCard, aiPhotoDiag, mdToHtml } from "./gemini.js";

function toast(msg, actionLabel, actionFn){
  const t = $("toast");
  t.innerHTML = "";
  t.appendChild(document.createTextNode(msg));
  if(actionLabel && actionFn){
    const b = document.createElement("button");
    b.textContent = actionLabel;
    b.onclick = ()=>{ actionFn(); t.classList.remove("show"); };
    t.appendChild(b);
  }
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove("show"), actionLabel ? 5000 : 2600);
}
// A brief visual acknowledgement, without rewards or confetti.
function splash(el){
  if(!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate?.([{opacity:.6},{opacity:1}],{duration:220});
}

/* ============ Una portada, ordenada por la próxima revisión ============ */
function dateWords(date){
  const d=new Date(date+"T12:00:00");
  return d.toLocaleDateString("es-ES",{day:"numeric",month:"long",...(d.getFullYear()!==new Date().getFullYear()?{year:"numeric"}:{})});
}
function careDate(p){
  const {next,d,state}=plantState(p);
  if(state==="late")return "Recordatorio del " + dateWords(next);
  if(state==="today")return "Hoy toca mirar la tierra";
  if(d===1)return "Mañana, " + dateWords(next);
  return "Mirar la tierra el " + dateWords(next);
}
function toggleSearch(){
  const panel=$("search-panel");
  closeModal("settings-modal");
  if(!panel.hidden){closeSearch();return;}
  panel.hidden=false;$("search-toggle").setAttribute("aria-expanded","true");
  $("q").focus();
}
function closeSearch(){
  $("search-panel").hidden=true;$("q").value="";
  $("search-toggle").setAttribute("aria-expanded","false");render();
}
function render(){
  const list=alive(),due=list.filter(p=>plantState(p).d<=0).length;
  $("garden-summary").textContent=!list.length ? "Un rincón para tus plantas." : due ? `Hoy toca cuidar ${due===1?"una planta":due+" plantas"}.` : "Hoy, tu jardín puede esperar.";
  $("search-toggle").hidden=list.length<9;
  $("loclist").innerHTML=[...new Set(list.map(p=>p.loc).filter(Boolean))].map(l=>`<option value="${esc(l)}">`).join("");
  maybeNotify();
  const q=$("q").value.trim().toLocaleLowerCase("es");
  const shown=list.filter(p=>!q || (p.name+" "+(p.species||"")).toLocaleLowerCase("es").includes(q))
    .sort((a,b)=>plantState(a).d-plantState(b).d || a.name.localeCompare(b.name,"es"));
  if(!shown.length){
    $("grid").innerHTML=`<div class="empty">${PLANT_ART}<h2>${list.length?"No encuentro esa planta":"Tu jardín empieza aquí"}</h2><p>${list.length?"Prueba con otro nombre.":"Añade tu primera planta con el botón +."}</p></div>`;
    return;
  }
  $("grid").innerHTML=shown.map(p=>{
    const {state}=plantState(p);
    return `<article class="card ${state}" data-plant="${esc(p.id)}">
      <button type="button" class="card-open" data-open="${esc(p.id)}" aria-label="Abrir ficha de ${esc(p.name)}">
        <span class="card-photo">${PLANT_ART}${p.photo?`<img src="${esc(p.photo)}" alt="" loading="lazy" decoding="async">`:""}</span>
        <span class="card-info"><span class="name">${esc(p.name)}</span><span class="next ${state}">${careDate(p)}</span></span>
      </button>
      <div class="card-action"><button type="button" class="waterbtn" data-water="${esc(p.id)}">Ya la he regado</button></div>
    </article>`;
  }).join("");
  $("grid").querySelectorAll("[data-open]").forEach(el=>el.onclick=()=>openDetail(el.dataset.open));
  $("grid").querySelectorAll("[data-water]").forEach(el=>el.onclick=()=>water(el.dataset.water,el));
  // A failed image keeps a gentle placeholder; the saved photograph is untouched.
  $("grid").querySelectorAll(".card-photo img").forEach(img=>img.addEventListener("error",()=>img.remove()));
}

function openDetail(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  const {next,d,state,f} = plantState(p);
  $("d-name").textContent = p.name; $("d-species").textContent = p.species || "";
  $("d-photo").innerHTML = p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--surface2)">` : PLANT_ART;
  $("d-hero").classList.toggle("noimg", !p.photo);
  $("d-photo").querySelector("img")?.addEventListener("error",()=>{
    $("d-photo").innerHTML=PLANT_ART;$("d-hero").classList.add("noimg");
  });
  const st = $("d-state");
  st.className = "detail-date " + (state!=="ok" ? state : "");
  st.textContent = careDate(p);
  const context = weatherContext(p);
  $("d-rain").textContent = context;
  $("d-rain").style.display = context ? "block" : "none";
  $("d-desc").style.display = p.desc ? "block" : "none"; $("d-desc").textContent = p.desc || "";
  $("d-loc").textContent = p.loc || "—";
  $("d-light").textContent = LIGHT[p.light] || "—";
  $("d-freq").textContent = `Cada ${f===1?"día":f+" días"} · orientativo`;
  $("d-last").textContent = p.lastWater ? dateWords(p.lastWater) : "Sin riegos registrados";
  $("d-next").textContent = dateWords(next) + (state==="late" ? ` · recordatorio de hace ${Math.abs(d)} ${Math.abs(d)===1?"día":"días"}` : state==="today" ? " · hoy" : "");
  if(p.fertFreq>0){
    $("d-fertrow").style.display="flex";
    $("d-fert").textContent = p.lastFert ? fmt(addDays(p.lastFert, p.fertFreq)) : "Sin registrar";
  } else $("d-fertrow").style.display="none";
  // Maceta y trasplante
  if(p.potSize || p.potDate){
    $("d-potrow").style.display="flex";
    let v = p.potSize || "";
    if(p.potDate){
      const meses = Math.floor(diffDays(p.potDate, todayStr())/30);
      v += (v?" · ":"") + (meses<1 ? "trasplantada este mes" : `hace ${meses} mes${meses>1?"es":""}`);
      if(meses>=18) v += " ⚠️";
    }
    $("d-pot").textContent = v;
    $("d-pot").style.color = (p.potDate && diffDays(p.potDate, todayStr())>=540) ? "var(--amber)" : "";
  } else $("d-potrow").style.display="none";
  // Última revisión IA
  if(p.lastAI?.text){
    $("d-lastai").style.display="flex";
    $("d-lastai-txt").textContent = `Última consulta: ${fmt(p.lastAI.date)}`;
    $("d-lastai-btn").onclick = ()=>{
      $("ai-title").textContent = p.name;
      $("ai-sub").textContent = `Revisión guardada · ${fmt(p.lastAI.date)}`;
      $("ai-body").innerHTML = mdToHtml(p.lastAI.text);
      $("ai-apply").style.display="none";
      $("ai-copy").onclick = ()=>{ navigator.clipboard?.writeText(p.lastAI.text).then(()=>toast("Copiado 📄")).catch(()=>{}); };
      openModal("ai-modal");
    };
  } else $("d-lastai").style.display="none";
  renderGallery(p);
  $("d-hist").innerHTML = (p.history?.length)
    ? p.history.map(h=>`<div class="h">${h.t==="agua"?"Riego":"Abono"} · <b>${esc(h.by||"")}</b><span class="d">${fmt(h.date)}</span>${h.t==="agua" && h.eventId?`<button type="button" class="history-correct" data-correct="${esc(h.eventId)}">Corregir este riego</button>`:""}</div>`).join("")
    : "<p class='note'>Aún sin registros. El primer riego lo estrena.</p>";
  $("d-hist").querySelectorAll("[data-correct]").forEach(b=>b.onclick=()=>{if(confirm("¿Quitar solo este riego accidental? Los demás registros se conservarán."))correctWater(id,b.dataset.correct);});
  $("d-water").onclick = e=>{ water(id, e.currentTarget); openDetail(id); };
  $("d-water").dataset.plantId = id;
  $("d-aiphoto").onclick = ()=>aiPhotoDiag(id);
  $("d-aicard").onclick = ()=>aiReviewCard(id);
  $("d-fertbtn").onclick = ()=>fertilize(id);
  $("d-edit").onclick = ()=>{ closeModal("detail-modal"); openForm(id); };
  $("d-del").onclick = ()=>delPlant(id);
  const alreadyOpen=$("detail-modal").classList.contains("open");
  if(!alreadyOpen){
    document.querySelectorAll("#detail-modal details").forEach(section=>section.open=false);
    $("detail-modal").querySelector(".sheet").scrollTop=0;
  }
  openModal("detail-modal");
}

/* ============ Modales e inicio ============ */
function syncModalLayout(){
  const open=!!document.querySelector?.(".modal.open");
  document.documentElement.classList.toggle("dialog-open",open);
  $("app-shell").inert=open;
}
function openModal(id){ if(id==="account-modal" || id==="weather-modal")closeModal("settings-modal"); $(id).classList.add("open"); if(id==="settings-modal") renderSettingsUI(); syncModalLayout(); }
function closeModal(id){ $(id).classList.remove("open"); if(id === "form-modal") invalidateForm(); syncModalLayout(); }

function setupLayout(){
  const root=document.documentElement,viewport=window.visualViewport,dock=$("add-dock");
  const fit=()=>{
    // Follow the space left by the keyboard/browser bars; leave pinch zoom native.
    if(viewport && viewport.scale===1){
      root.style.setProperty("--app-height",viewport.height+"px");
      root.style.setProperty("--app-top",viewport.offsetTop+"px");
    }else{
      root.style.removeProperty?.("--app-height");root.style.removeProperty?.("--app-top");
    }
  };
  const measure=()=>{
    if(dock.getBoundingClientRect)root.style.setProperty("--dock-height",dock.getBoundingClientRect().height+"px");
  };
  fit();measure();
  viewport?.addEventListener("resize",fit);viewport?.addEventListener("scroll",fit);
  window.addEventListener?.("resize",fit);
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(measure).observe(dock);
}

export { toast, splash, render, toggleSearch, closeSearch, dateWords, careDate, openDetail, openModal, closeModal, setupLayout };
