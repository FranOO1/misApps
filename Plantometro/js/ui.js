import { $, esc, todayStr, addDays, diffDays, fmt, LIGHT } from "./utils.js";
import { settings, renderSettingsUI, maybeNotify } from "./settings.js";
import { plants, alive } from "./sync.js";
import { isOutdoor, rainyToday, weatherContext } from "./weather.js";
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
function splash(el){
  if(!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  for(let i=0;i<7;i++){
    const s = document.createElement("span");
    s.className = "drop"; s.textContent = "💧";
    s.style.left = (r.left + r.width/2 - 8) + "px";
    s.style.top = (r.top + r.height/2 - 8) + "px";
    s.style.setProperty("--dx", (Math.random()*140-70)+"px");
    s.style.setProperty("--dy", (-50-Math.random()*80)+"px");
    s.style.animationDelay = (i*28)+"ms";
    document.body.appendChild(s);
    setTimeout(()=>s.remove(), 950);
  }
}

/* ============ Render ============ */
let filterLoc = "Todas las ubicaciones", filterState = "todo", view = "grid";
function ring(p){
  const {d, f, state} = plantState(p);
  const frac = Math.max(0, Math.min(1, d / f));
  const R=42, C=2*Math.PI*R;
  const col = d<0 ? "var(--grana)" : d===0 ? "var(--amber)" : "var(--blue)";
  const pill = state==="late" ? `${Math.abs(d)} d pend.` : state==="today" ? "HOY" : `en ${d} d`;
  return `<svg viewBox="0 0 92 92" width="92" height="92" aria-hidden="true">
    <circle cx="46" cy="46" r="${R}" fill="none" stroke="var(--line)" stroke-width="5.5"/>
    <circle cx="46" cy="46" r="${R}" fill="none" stroke="${col}" stroke-width="5.5" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C*(1-frac)}"/></svg>
    <span class="daypill ${state}">${pill}</span>`;
}

function setView(v){
  view = v;
  document.querySelectorAll("#viewseg button").forEach(b=>b.classList.toggle("on", b.dataset.view===v));
  $("grid").style.display = v==="grid" ? "grid" : "none";
  $("week").style.display = v==="week" ? "flex" : "none";
  render();
}

function renderWeek(shown){
  const t = todayStr();
  const byDay = {};
  shown.forEach(p=>{
    const {next, state} = plantState(p);
    const day = state==="ok" ? next : t; // atrasadas y de hoy → hoy
    if(diffDays(t, day) > 6) return;
    (byDay[day] = byDay[day] || []).push({p, state});
  });
  $("week").innerHTML = Array.from({length:7}, (_,i)=>{
    const day = addDays(t, i);
    const dd = new Date(day+"T12:00:00");
    const wd = i===0 ? "Hoy" : i===1 ? "Mañana" : dd.toLocaleDateString("es-ES",{weekday:"long"});
    const items = (byDay[day]||[]).sort((a,b)=>a.p.name.localeCompare(b.p.name));
    const inner = items.length
      ? items.map(({p,state})=>`<button class="wp ${state==="late"?"late":""}" data-open="${p.id}">
          <span class="mini">${p.photo?`<img src="${p.photo}" alt="">`:"🪴"}</span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${state==="late"?"⚠️ ":""}${esc(p.name)}</span></button>`).join("")
      : `<div class="free">Sin revisiones con estos filtros</div>`;
    return `<div class="wday ${i===0?"today":""}"><div class="wd-h">${esc(wd)}</div><div class="wd-d">${dd.toLocaleDateString("es-ES",{day:"numeric",month:"short"})} · ${items.length?items.length+(items.length>1?" revisiones":" revisión"):"—"}</div>${inner}</div>`;
  }).join("");
  $("week").querySelectorAll("[data-open]").forEach(el=>el.onclick=()=>openDetail(el.dataset.open));
}

function render(){
  const list = alive();
  let today=0, late=0;
  list.forEach(p=>{ const s=plantState(p).state; if(s==="today") today++; if(s==="late") late++; });
  // No gamificar el cumplimiento de una pauta de riego orientativa.
  $("st-total").textContent=list.length; $("st-today").textContent=today; $("st-late").textContent=late;
  $("st-total-label").textContent=list.length===1?"planta":"plantas";
  $("st-today-label").textContent=today===1?"revisión hoy":"revisiones hoy";
  $("st-late-label").textContent=late===1?"revisión pendiente":"revisiones pendientes";
  $("st-streak").textContent = settings.streak || 0;
  $("st-today").parentElement.classList.toggle("zero", !today);
  $("st-late").parentElement.classList.toggle("zero", !late);
  $("st-streak").parentElement.classList.toggle("zero", !(settings.streak||0));
  notifyDue();

  const locs = ["Todas las ubicaciones", ...new Set(list.map(p=>p.loc).filter(Boolean))];
  const states = [["todo","Todos los estados"],["pend","Hoy y pendientes"],["today","Solo hoy"],["late","Días anteriores"]];
  $("chips").innerHTML =
    states.map(([v,t])=>`<button class="chip ${filterState===v?'on':''}" data-fs="${v}">${t}</button>`).join("") +
    locs.map((l,i)=>`<button class="chip ${filterLoc===l?'on':''}" data-fl="${i}">${esc(l)}</button>`).join("");
  $("chips").querySelectorAll("[data-fs]").forEach(b=>b.onclick=()=>{filterState=b.dataset.fs;render();});
  $("chips").querySelectorAll("[data-fl]").forEach(b=>b.onclick=()=>{filterLoc=locs[+b.dataset.fl];render();});
  $("loclist").innerHTML = locs.slice(1).map(l=>`<option value="${esc(l)}">`).join("");


  const q = $("q").value.trim().toLowerCase();
  const shown = list.filter(p=>{
    const s = plantState(p).state;
    if(filterLoc!=="Todas las ubicaciones" && p.loc!==filterLoc) return false;
    if(filterState==="pend" && s==="ok") return false;
    if(filterState==="today" && s!=="today")return false;
    if(filterState==="late" && s!=="late") return false;
    if(q && !(p.name+" "+(p.species||"")).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=> plantState(a).d - plantState(b).d);

  if(view === "week"){ renderWeek(shown); return; }

  if(!shown.length){
    $("grid").innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="big">🪴</div><h3>${list.length? "Nada por aquí" : "Vuestro jardín está vacío"}</h3>
      <p>${list.length? "Prueba con otro filtro o búsqueda." : "Pulsa el botón + para añadir la primera planta. La verá tu pareja al momento."}</p></div>`;
    return;
  }
  $("grid").innerHTML = shown.map(p=>{
    const {next,d,state,f} = plantState(p);
    const nextTxt = state==="late" ? `Revisión pendiente desde ${fmt(next)} · ${Math.abs(d)} ${Math.abs(d)===1?"día":"días"}` : state==="today" ? "Revisar humedad hoy" : `Revisar humedad: ${fmt(next)}`;
    const fert = p.fertFreq>0 && p.lastFert ? diffDays(todayStr(), addDays(p.lastFert, p.fertFreq))<=0 : false;
    const rain = (state!=="ok") && isOutdoor(p) && rainyToday();
    const lastBy = p.history?.[0]?.by ? `· último: ${esc(p.history[0].by)}` : "";
    return `<article class="card ${state!=="ok"?state:""}">
      <div class="body" data-open="${p.id}">
        <div class="ringwrap">${ring(p)}<div class="ph">${p.photo?`<img src="${p.photo}" alt="">`:"🪴"}</div></div>
        <div class="info">
          <div class="name">${esc(p.name)}</div>
          ${p.species?`<div class="species">${esc(p.species)}</div>`:""}
          <div class="meta">
            ${p.loc?`<span class="tag">📍 ${esc(p.loc)}</span>`:""}
            ${rain?`<span class="tag rain">🌧️ lluvia prevista</span>`:""}
            ${fert?`<span class="tag" style="color:var(--amber);border-color:var(--amber)">🌱 abonar</span>`:""}
          </div>
          <div class="next ${state}">${nextTxt} <span style="color:var(--ink2);font-weight:400">${lastBy}</span></div>
        </div>
      </div>
      <div class="foot">
        <button class="waterbtn" data-water="${p.id}">💧 Ya la he regado</button>
        <button data-open="${p.id}">Ver ficha</button>
      </div>
    </article>`;
  }).join("");
  $("grid").querySelectorAll("[data-open]").forEach(el=>el.onclick=()=>openDetail(el.dataset.open));
  $("grid").querySelectorAll("[data-water]").forEach(el=>el.onclick=e=>{e.stopPropagation();water(el.dataset.water, el);});
}

function openDetail(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  const {next,d,state,f} = plantState(p);
  $("d-name").textContent = p.name; $("d-species").textContent = p.species || "";
  $("d-photo").innerHTML = p.photo ? `<img src="${p.photo}" alt="${esc(p.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : "🪴";
  $("d-hero").classList.toggle("noimg", !p.photo);
  const st = $("d-state");
  st.className = "hstate " + (state!=="ok" ? state : "");
  st.textContent = state==="late" ? "REVISIÓN PENDIENTE" : state==="today" ? "REVISAR HUMEDAD HOY" : "REVISIÓN PROGRAMADA";
  const context = weatherContext(p);
  $("d-rain").textContent = context;
  $("d-rain").style.display = context ? "block" : "none";
  $("d-desc").style.display = p.desc ? "block" : "none"; $("d-desc").textContent = p.desc || "";
  $("d-loc").textContent = p.loc || "—";
  $("d-light").textContent = LIGHT[p.light] || "—";
  $("d-freq").textContent = `Cada ${f} días · orientativo`;
  $("d-last").textContent = fmt(p.lastWater);
  $("d-next").innerHTML = `<span style="color:${state==='late'?'var(--grana)':state==='today'?'var(--amber)':'var(--blue)'}">${fmt(next)}${state==='late'?` · ${Math.abs(d)} ${Math.abs(d)===1?"día":"días"} pendiente de revisar`:state==='today'?' · hoy':''}</span>`;
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
    $("d-lastai-txt").textContent = `🤖 Última revisión: ${fmt(p.lastAI.date)}`;
    $("d-lastai-btn").onclick = ()=>{
      $("ai-title").textContent = "🤖 " + p.name;
      $("ai-sub").textContent = `Revisión guardada · ${fmt(p.lastAI.date)}`;
      $("ai-body").innerHTML = mdToHtml(p.lastAI.text);
      $("ai-apply").style.display="none";
      $("ai-copy").onclick = ()=>{ navigator.clipboard?.writeText(p.lastAI.text).then(()=>toast("Copiado 📄")).catch(()=>{}); };
      openModal("ai-modal");
    };
  } else $("d-lastai").style.display="none";
  renderGallery(p);
  $("d-hist").innerHTML = (p.history?.length)
    ? p.history.map(h=>`<div class="h">${h.t==="agua"?"💧 Riego":"🌱 Abono"} · <b>${esc(h.by||"")}</b><span class="d">${fmt(h.date)}</span>${h.t==="agua" && h.eventId?`<button type="button" class="history-correct" data-correct="${esc(h.eventId)}">Corregir este riego</button>`:""}</div>`).join("")
    : "<p class='note'>Aún sin registros. El primer riego lo estrena.</p>";
  $("d-hist").querySelectorAll("[data-correct]").forEach(b=>b.onclick=()=>{if(confirm("¿Quitar solo este riego accidental? Los demás registros se conservarán."))correctWater(id,b.dataset.correct);});
  $("d-water").onclick = e=>{ water(id, e.currentTarget); openDetail(id); };
  $("d-water").dataset.plantId = id;
  $("d-aiphoto").onclick = ()=>aiPhotoDiag(id);
  $("d-aicard").onclick = ()=>aiReviewCard(id);
  $("d-fertbtn").onclick = ()=>fertilize(id);
  $("d-edit").onclick = ()=>{ closeModal("detail-modal"); openForm(id); };
  $("d-del").onclick = ()=>delPlant(id);
  openModal("detail-modal");
}

/* ============ Aviso interno de revisiones pendientes ============ */
function notifyDue(){
  const el = $("due-banner");
  const hoy=[], tarde=[];
  alive().forEach(p=>{ const s=plantState(p).state; if(s==="today") hoy.push(p); if(s==="late") tarde.push(p); });
  if(!hoy.length && !tarde.length){ el.style.display="none"; return; }
  const head = tarde.length
    ? `🌱 <b>${tarde.length}</b> ${tarde.length===1?"revisión pendiente":"revisiones pendientes"}${hoy.length?` · <b>${hoy.length}</b> para hoy`:""}`
    : `🌱 <b>${hoy.length}</b> ${hoy.length===1?"revisión":"revisiones"} para hoy`;
  el.innerHTML = head + ` <span style="font-weight:400;color:var(--ink2)">· comprueba la tierra antes de regar</span><button type="button" class="btn soft" id="due-action">${tarde.length+hoy.length===1?"Ver ficha":"Ver plantas para revisar"}</button>`;
  $("due-action").onclick=()=>{if(tarde.length+hoy.length===1)openDetail([...tarde,...hoy][0].id);else{filterState="pend";filterLoc="Todas las ubicaciones";$("q").value="";setView("grid");$("grid").scrollIntoView({behavior:"smooth",block:"start"});}};;
  el.style.background = tarde.length ? "color-mix(in srgb, var(--grana) 12%, var(--surface))" : "color-mix(in srgb, var(--amber) 12%, var(--surface))";
  el.style.border = "1.5px solid " + (tarde.length ? "var(--grana)" : "var(--amber)");
  el.style.color = "var(--ink)";
  el.style.fontSize = "13.5px";
  el.style.display = "block";
  maybeNotify();
}

/* ============ Modales e inicio ============ */
function openModal(id){ $(id).classList.add("open"); if(id==="settings-modal") renderSettingsUI(); }
function closeModal(id){ $(id).classList.remove("open"); if(id === "form-modal") invalidateForm(); }

export { toast, splash, render, setView, openDetail, openModal, closeModal };
