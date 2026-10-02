import { $, esc, todayStr, fmt, LIGHT } from "./utils.js";
import { settings, whoAmI } from "./settings.js";
import { plants, putPlant, sessionToken } from "./sync.js";
import { isOutdoor, seasonContext, weatherContext } from "./weather.js";
import { plantState, formPhoto, formLight, formRevision, openForm, trimPlant, setFormLight, updateReminderUnit } from "./plants.js";
import { shrinkImage, pushDiary } from "./photos.js";
import { toast, openModal, closeModal } from "./ui.js";

/* ============ IA (Gemini, capa gratuita) ============ */
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"]; // si el primero falla, prueba el segundo

async function callGemini(parts){
  const key = (settings.geminiKey || "").trim();
  if(!key){
    closeModal("ai-modal");
    toast("Añade tu clave de Gemini en Ajustes ⚙️");
    setTimeout(()=>openModal("settings-modal"), 400);
    return null;
  }
  let lastErr = null;
  for(const model of GEMINI_MODELS){
    try{
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1500 }
        })
      });
      if(!r.ok){
        lastErr = new Error("Gemini no pudo responder (HTTP " + r.status + ")");
        if(r.status === 404 || r.status === 429) continue; // prueba el siguiente modelo
        throw lastErr;
      }
      const d = await r.json();
      const txt = (d.candidates?.[0]?.content?.parts || []).map(p=>p.text || "").join("").trim();
      if(txt) return txt;
      lastErr = new Error("Respuesta vacía de la IA");
    }catch(err){ lastErr = err; }
  }
  throw lastErr || new Error("No se pudo contactar con Gemini");
}

// Markdown ligero → HTML seguro (negritas, listas, títulos)
function mdToHtml(t){
  const lines = esc(t).split("\n");
  let html = "", inList = false;
  for(let ln of lines){
    ln = ln.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const trimmed = ln.trim();
    if(/^#{1,4}\s/.test(trimmed)){
      if(inList){ html += "</ul>"; inList = false; }
      html += `<h4>${trimmed.replace(/^#{1,4}\s*/, "")}</h4>`;
    } else if(/^[-*•]\s/.test(trimmed)){
      if(!inList){ html += "<ul>"; inList = true; }
      html += `<li>${trimmed.replace(/^[-*•]\s*/, "")}</li>`;
    } else if(trimmed === ""){
      if(inList){ html += "</ul>"; inList = false; }
    } else {
      if(inList){ html += "</ul>"; inList = false; }
      html += `<p>${trimmed}</p>`;
    }
  }
  if(inList) html += "</ul>";
  return html;
}

// Ficha completa en texto: todos los campos + estado calculado + historial
function fichaText(p){
  const {next, d, state, f} = plantState(p);
  const estado = state==="late" ? `revisión de humedad pendiente desde ${next}; no implica que necesite agua`
               : state==="today" ? "revisar humedad HOY; regar solo si lo necesita"
               : `revisión prevista el ${next} (en ${d} día(s)); humedad desconocida`;
  const hist = (p.history || []).slice(0, 20)
    .map(h=>`  - ${h.date}: ${h.t==="agua"?"riego":"abono"}${h.by?` (por ${h.by})`:""}`).join("\n") || "  (sin registros)";
  const clima = weatherContext(p);
  return [
    `FICHA DE LA PLANTA (datos guardados en la app):`,
    `- Nombre: ${p.name || "—"}`,
    `- Especie/tipo: ${p.species || "no indicada"}`,
    `- Ubicación: ${p.loc || "no indicada"}${isOutdoor(p) ? " (exterior)" : ""}`,
    `- Luz que recibe: ${LIGHT[p.light] || "no indicada"}`,
    `- Descripción/notas: ${p.desc || "sin notas"}`,
    `- Frecuencia orientativa para revisar humedad: cada ${f} días. No es una orden de regar.`,
    `- Último riego: ${p.lastWater || "—"} · Estado hoy (${todayStr()}): ${estado}`,
    `- Abono: ${p.fertFreq>0 ? `cada ${p.fertFreq} días, último el ${p.lastFert || "sin registrar"}` : "sin pauta de abono"}`,
    `- Maceta: ${p.potSize || "tamaño no indicado"}${p.potDate ? `, último trasplante el ${p.potDate}` : ""}`,
    clima,
    `- Historial reciente:`,
    hist
  ].filter(Boolean).join("\n");
}

const SUG_JSON = `\nNo deduzcas falta de agua por el calendario. riegoCadaDias representa días entre revisiones de humedad, no riegos obligatorios. La lluvia solo es relevante para plantas de exterior; no cambies la pauta por una predicción incierta.\nMUY IMPORTANTE: termina tu respuesta con EXACTAMENTE un bloque de código JSON con tus valores sugeridos para la ficha (usa null en lo que no cambiarías):\n\`\`\`json\n{"riegoCadaDias": número o null, "abonoCadaDias": número o null, "luz": "sol" | "media" | "sombra" | null}\n\`\`\``;

// dataURL → parte inline_data para Gemini
function dataUrlToPart(dataUrl){
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl || "");
  return m ? { inline_data: { mime_type: m[1], data: m[2] } } : null;
}

// Extrae el bloque JSON final de sugerencias y lo separa del texto visible
function extractSuggestions(txt){
  const m = /```json\s*(\{[\s\S]*?\})\s*```/i.exec(txt);
  if(!m) return { clean: txt, sug: null };
  let sug = null;
  try{ sug = JSON.parse(m[1]); }catch(e){}
  return { clean: txt.replace(m[0], "").trim(), sug };
}

let aiBusy = false;
async function runAI(p, subtitle, parts){
  if(aiBusy) return null;
  const session=sessionToken();
  aiBusy = true;
  $("ai-title").textContent = "🤖 " + p.name;
  $("ai-sub").textContent = subtitle;
  $("ai-apply").style.display = "none";
  $("ai-body").innerHTML = `<div class="ai-spin"><span class="leafspin">🌿</span>Analizando… puede tardar unos segundos</div>`;
  openModal("ai-modal");
  let clean = null;
  try{
    const txt = await callGemini(parts);
    if(session!==sessionToken() || !plants.some(x=>x.id===p.id)){aiBusy=false;return null;}
    p=plants.find(x=>x.id===p.id);
    if(txt === null){ aiBusy = false; return null; } // faltaba la clave
    const ex = extractSuggestions(txt);
    clean = ex.clean;
    $("ai-body").innerHTML = mdToHtml(clean);
    $("ai-copy").onclick = ()=>{ navigator.clipboard?.writeText(clean).then(()=>toast("Copiado 📄")).catch(()=>toast("No se pudo copiar")); };
    // Guardar como última revisión en la ficha
    p.lastAI = { date: todayStr(), text: clean.slice(0, 4000) };
    p.updatedAt = new Date().toISOString(); p.updatedBy = whoAmI();
    putPlant(trimPlant(p));
    if($("detail-modal").classList.contains("open")){
      $("d-lastai").style.display="flex";
      $("d-lastai-txt").textContent = `🤖 Última revisión: ${fmt(p.lastAI.date)}`;
    }
    // Cambios sugeridos aplicables
    const s = ex.sug || {};
    const nf = Number.isFinite(+s.riegoCadaDias) && +s.riegoCadaDias>=1 && +s.riegoCadaDias<=120 ? Math.round(+s.riegoCadaDias) : null;
    const na = s.abonoCadaDias != null && Number.isFinite(+s.abonoCadaDias) && +s.abonoCadaDias>=0 && +s.abonoCadaDias<=365 ? Math.round(+s.abonoCadaDias) : null;
    const nl = ["sol","media","sombra"].includes(s.luz) ? s.luz : null;
    const cambios = [];
    if(nf !== null && nf !== p.waterFreq) cambios.push(`revisar humedad cada ${nf} d`);
    if(na !== null && na !== (p.fertFreq||0)) cambios.push(na===0 ? "sin abono" : `abono cada ${na} d`);
    if(nl && nl !== p.light) cambios.push(`luz: ${LIGHT[nl]}`);
    if(cambios.length){
      const btn = $("ai-apply");
      btn.textContent = "Revisar sugerencias: " + cambios.join(" · ");
      btn.style.display = "flex";
      btn.onclick = ()=>{
        closeModal("ai-modal"); closeModal("detail-modal"); openForm(p.id);
        showPlantSuggestions({revisarCadaDias:nf, abonoCadaDias:na, luz:nl, confianza:"media", motivo:"Recomendaciones de la revisión. Selecciona solo lo que quieras cambiar; la IA puede equivocarse."});
      };
    }
  }catch(err){
    if(session!==sessionToken()){aiBusy=false;return null;}
    $("ai-body").innerHTML = `<p><b>❌ No se pudo completar el análisis.</b></p><p class="note">No se pudo obtener una respuesta válida.</p><p class="note">Comprueba tu clave de Gemini en Ajustes ⚙️ y tu conexión.</p>`;
  }
  aiBusy = false;
  return clean;
}

// 📋 Revisión de la ficha guardada (detecta fallos en riegos, descripción, cuidados…)
function aiReviewCard(id){
  const p = plants.find(x=>x.id===id); if(!p) return;
  const prompt =
`Eres un experto jardinero. Te paso la ficha completa de una planta guardada en mi app de riegos (estamos en ${settings.city || "España"}, fecha de hoy: ${todayStr()}).
Revisa TODOS los campos de la ficha y detecta posibles fallos o mejoras. En concreto:
1. ¿La frecuencia para revisar humedad es orientativamente adecuada para esta especie, su luz y la época del año?
2. Describe el historial sin asumir que un intervalo largo indica falta de agua: no conocemos la humedad real.
3. ¿La pauta de abono es correcta (o falta)?
4. ¿La ubicación, la luz y la maceta son adecuadas para la especie? ¿Toca trasplante?
5. ¿Falta algo importante en la descripción/cuidados o hay algún dato incoherente en la ficha?
Si adjunto foto, úsala también para valorar el estado.
Responde en español, breve y práctico, con títulos (##) y listas con guiones. Incluye una sección "## Cambios sugeridos en la ficha" con valores concretos.${SUG_JSON}

${fichaText(p)}`;
  const parts = [{ text: prompt }];
  const photo = dataUrlToPart(p.photo);
  if(photo) parts.push(photo);
  runAI(p, "Revisión de la ficha 📋", parts);
}

// 📸 Diagnóstico por foto nueva (cámara o galería) → se guarda en el diario
let aiPhotoPlantId = null;
function aiPhotoDiag(id){
  aiPhotoPlantId = id;
  $("ai-file").value = "";
  $("ai-file").click();
}
async function aiPhotoPicked(e){
  const file = e.target.files[0]; if(!file) return;
  const p = plants.find(x=>x.id===aiPhotoPlantId); if(!p) return;
  const session=sessionToken();
  let big, small;
  try{
    big = await shrinkImage(file, 1024, .85);   // para la IA
    small = await shrinkImage(file, 480, .6);   // para el diario
  }catch(err){ toast("No se pudo leer la imagen ❌"); return; }
  if(session!==sessionToken())return;
  const prompt =
`Eres un experto jardinero. Te envío una FOTO ACTUAL de mi planta junto con su ficha de la app (estamos en ${settings.city || "España"}, hoy es ${todayStr()}).
Analiza la foto y dime:
1. **Estado general** de la planta (¿está sana?). Empieza con una frase corta resumen.
2. **Problemas visibles**: hojas amarillas/marrones, plagas, hongos, falta o exceso de riego, falta de luz, maceta pequeña…
3. **Causas posibles** de cada problema, cruzando la foto y la ficha, sin deducir humedad real o necesidad de agua solo por fechas.
4. **Qué hacer esta semana**, en pasos concretos.
Responde en español, claro y breve, con títulos (##) y listas con guiones.${SUG_JSON}

${fichaText(p)}`;
  const txt = await runAI(p, "Diagnóstico por foto 📸", [{ text: prompt }, dataUrlToPart(big)]);
  if(txt && session===sessionToken()){
    const firstLine = txt.split("\n").map(s=>s.replace(/[#*]/g,"").trim()).filter(s=>s && !/^(estado|problemas|causa|qué hacer)/i.test(s))[0] || "";
    if(await pushDiary(plants.find(x=>x.id===p.id), small, firstLine))toast("Diagnóstico guardado en el diario 📷");
  }
}

// Reutiliza Gemini; nunca escribe en la ficha sin una elección explícita.
async function identifyPlant(){
  const name = $("f-name").value.trim();
  if(!name && !formPhoto){ toast("Escribe un nombre o añade una foto primero."); return; }
  if(!(settings.geminiKey || "").trim()){ toast("Añade tu clave de Gemini en Ajustes."); return; }
  const revision = formRevision, session=sessionToken();
  const st = $("f-aistatus"), btn = $("f-identify");
  btn.disabled = true; $("f-suggestions").hidden = true;
  st.style.display = "block"; st.textContent = "Consultando Gemini…";
  try{
    const prompt = `Sugiere una identificación y cuidados a partir del nombre y/o foto. El nombre puede ser un apodo, no una especie. No asumas una identificación segura. Responde SOLO con JSON:
{"nombreComun":string|null,"especie":string|null,"revisarCadaDias":number|null,"luz":"sol"|"media"|"sombra"|null,"confianza":"alta"|"media"|"baja","motivo":string,"consejo":string}
Los días son una frecuencia ORIENTATIVA para revisar humedad, NUNCA una orden de regar. Usa null cuando no puedas recomendar algo. Explica la incertidumbre y alternativas. No deduzcas humedad de una foto ni ajustes días por lluvia prevista. Contexto: ciudad ${settings.city}, latitud ${settings.lat}, fecha ${todayStr()}, ${seasonContext()}. Nombre introducido: ${name}. Especie introducida: ${$("f-species").value}. Ubicación: ${$("f-loc").value}.`;
    const parts = [{text:prompt}]; const photo = dataUrlToPart(formPhoto); if(photo) parts.push(photo);
    const txt = await callGemini(parts);
    if(session!==sessionToken() || revision !== formRevision || !$("form-modal").classList.contains("open")) return;
    if(!txt) return;
    const j = JSON.parse(txt.replace(/```json|```/gi, "").trim());
    if(!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Formato inválido");
    showPlantSuggestions(j);
    st.textContent = "Revisa, corrige y elige qué datos quieres usar. Aún no se ha aplicado nada.";
  }catch(e){
    if(session===sessionToken() && revision === formRevision) st.textContent = "No se pudo obtener una sugerencia válida. Puedes completar la ficha a mano o intentarlo otra vez.";
  }finally{ if(session===sessionToken() && revision === formRevision) btn.disabled = false; }
}
function showPlantSuggestions(j){
  const box = $("f-suggestions"); box.replaceChildren(); box.hidden = false;
  const confidence = j.confianza === "alta" ? "Identificación probable; comprueba que coincide." : "Identificación dudosa: es una hipótesis, no una especie confirmada.";
  const heading = document.createElement("h3"); heading.textContent = "Sugerencias para revisar"; box.append(heading);
  const note = document.createElement("p"); note.className = "note";
  note.textContent = confidence + " " + (typeof j.motivo === "string" ? j.motivo.slice(0,600) : ""); box.append(note);
  const candidates = [
    ["nombreComun", "Nombre común", "f-name"], ["especie", "Especie / tipo", "f-species"],
    ["revisarCadaDias", "Revisar humedad cada (días)", "f-freq"], ["luz", "Luz orientativa", "f-light"],
    ["abonoCadaDias", "Abono cada (días; 0 = sin abono)", "f-fertfreq"]
  ];
  const choices = [];
  for(const [key, label, target] of candidates){
    let value = j[key];
    if(key === "revisarCadaDias") value = value != null && Number.isFinite(+value) && +value >= 1 && +value <= 120 ? Math.round(+value) : null;
    else if(key === "abonoCadaDias") value = value != null && Number.isFinite(+value) && +value >= 0 && +value <= 365 ? Math.round(+value) : null;
    else if(key === "luz") value = ["sol","media","sombra"].includes(value) ? value : null;
    else value = typeof value === "string" ? value.trim().slice(0,120) : null;
    if(value == null || value === "") continue;
    const row = document.createElement("div"); row.className = "suggestion-row";
    const checkLabel = document.createElement("label"), check = document.createElement("input");
    check.type = "checkbox"; checkLabel.append(check, document.createTextNode("Usar: " + label)); row.append(checkLabel);
    const input = document.createElement(key === "luz" ? "select" : "input");
    input.id = "suggest-" + key; checkLabel.htmlFor = "use-" + key; check.id = "use-" + key;
    input.setAttribute("aria-label", "Corregir sugerencia: " + label);
    if(key === "luz") for(const [v,t] of Object.entries(LIGHT)){ const option = document.createElement("option"); option.value=v; option.textContent=t; input.append(option); }
    else { input.type = ["revisarCadaDias","abonoCadaDias"].includes(key) ? "number" : "text"; if(input.type === "number"){input.min=key === "abonoCadaDias"?"0":"1";input.max=key === "abonoCadaDias"?"365":"120";} }
    input.value = value; row.append(input);
    const current = document.createElement("p"); current.className="note";
    current.textContent = "Actual: " + (key === "luz" ? (LIGHT[formLight] || "sin indicar") : ($(target).value || "sin indicar")); row.append(current);
    box.append(row); choices.push({key,target,check,input});
  }
  const advice = document.createElement("p"); advice.className="note";
  advice.textContent = typeof j.consejo === "string" ? j.consejo.slice(0,700) : "Comprueba la tierra antes de regar."; box.append(advice);
  const apply = document.createElement("button"); apply.type="button"; apply.className="btn primary"; apply.textContent="Usar los datos seleccionados";
  apply.onclick = ()=>{
    const selected = choices.filter(c=>c.check.checked);
    if(!selected.length){ toast("Marca los datos que quieras usar o descarta la sugerencia."); return; }
    if(selected.some(c=>!c.input.checkValidity() || !c.input.value.trim())){toast("Revisa los valores seleccionados (entre 1 y 120 días).");return;}
    for(const c of selected){
      if(c.key === "luz"){ setFormLight(c.input.value); }
      else $(c.target).value=c.input.value.trim();
    }
    updateReminderUnit();
    $("f-details").open = true; box.hidden=true;
    $("f-aistatus").textContent="Sugerencias elegidas en el formulario. Revisa los datos y guarda la planta.";
  };
  const discard = document.createElement("button"); discard.type="button"; discard.className="btn soft"; discard.textContent="Descartar sugerencias";
  discard.onclick=()=>{box.hidden=true;box.replaceChildren();$("f-aistatus").textContent="Sugerencias descartadas. Tus datos siguen igual.";};
  box.append(apply,discard);
}

export { aiReviewCard, aiPhotoDiag, aiPhotoPicked, identifyPlant, showPlantSuggestions, mdToHtml };
