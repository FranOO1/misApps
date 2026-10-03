import {openCameraPhoto} from "./camera.js";
import { $, esc, todayStr } from "./utils.js";
import { settings, whoAmI } from "./settings.js";
import { plants, putPlant, arrayUnion, sessionToken } from "./sync.js";
import { seasonContext, forecast } from "./weather.js";
import { formPhoto, formLight, formRevision, openForm, setFormLight, updateReminderUnit } from "./plants.js";
import { shrinkImage } from "./photos.js";
import { toast, openModal, closeModal, openDetail } from "./ui.js";
import { aiEnabled, aiStatus, aiErrorMessage, callPlantAI } from "./ai-service.js";
import { aiResponseText } from "../shared/ai-response.js";
import { LIGHT } from "./utils.js";

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


function aiContext(p){
 const fresh=forecast&&forecast.city===settings.city&&forecast.lat===Number(settings.lat)&&forecast.lon===Number(settings.lon)&&Number.isFinite(forecast.observedAt)&&Date.now()-forecast.observedAt<3*3600000&&navigator.onLine!==false;
 return {city:settings.city,date:todayStr(),season:seasonContext(),weather:fresh?'Lectura actual aproximada de Open-Meteo ('+new Date(forecast.observedAt).toISOString()+'): '+forecast.temp+' °C, humedad '+forecast.humidity+'%. No hay historial meteorológico anterior fiable.':'No hay lectura ni historial meteorológico reciente fiable. No uses la previsión futura como tiempo pasado.'};
}
let aiBusy=false,aiRun=0,aiPhotoPlantId=null;
function invalidateAI(){aiRun++;aiBusy=false;}
function showReview(response){
  const b=$('ai-body');b.replaceChildren();
  const title=document.createElement('h3');title.textContent=response.resumen;b.append(title);
  if(response.analisis){
    for(const [label,value] of [['Lo que se ve',response.analisis.observado],['Causas posibles',response.analisis.causas],['Qué comprobar ahora',response.analisis.comprobar],['Un paso práctico',response.analisis.recomendacion]]){
      const h=document.createElement('h4');h.textContent=label;b.append(h);
      const body=document.createElement(Array.isArray(value)?'ol':'p');if(Array.isArray(value))for(const item of value){const li=document.createElement('li');li.textContent=item;body.append(li);}else body.textContent=value;b.append(body);
    }
  }
  if(!response.analisis){const advice=document.createElement('p');advice.textContent=response.consejo;b.append(advice);}
  const confidence=document.createElement('p');confidence.className='note';
  confidence.textContent=(response.confianza==='alta'?'Recomendación orientativa. ':'Identificación o cuidados dudosos. ')+response.motivo;b.append(confidence);
  const label=document.createElement('p');label.className='note';label.textContent='Son sugerencias. La ficha sigue igual hasta que decidas guardar.';b.append(label);
}
async function saveReview(id,response,photo,session,button){
  if(session!==sessionToken())return;
  const current=plants.find(p=>p.id===id);if(!current)return;
  button.disabled=true;
  const updated={...current,lastAI:{date:todayStr(),text:aiResponseText(response)},updatedAt:new Date().toISOString(),updatedBy:whoAmI()};
  const patch={lastAI:updated.lastAI};
  if(photo){const entry={id:crypto.randomUUID(),at:new Date().toISOString(),date:todayStr(),by:whoAmI(),img:photo,note:response.resumen.slice(0,140)};updated.gallery=[entry,...(current.gallery||[])];patch.gallery=arrayUnion(entry);}
  const saved=await putPlant(updated,{patch,type:photo?'photoAdded':'edited'});
  if(session!==sessionToken())return;
  button.disabled=false;
  if(saved){
    toast(photo?'Foto y consejo guardados.':'Consejo guardado en la ficha.');
    if($('ai-modal').classList.contains('open')){closeModal('ai-modal');openDetail(id);}
  }
}
async function runAI(p,subtitle,request,diaryPhoto=null){
  if(!aiEnabled()){toast(aiErrorMessage({code:'unavailable'}));return null;}
  if(aiBusy){toast('Hay una consulta en curso.');return null;}
  const session=sessionToken(),run=++aiRun;aiBusy=true;
  $('ai-title').textContent=p.name;$('ai-sub').textContent=subtitle;
  $('ai-apply').style.display='none';$('ai-save').hidden=true;
  $('ai-body').innerHTML='<div class="ai-spin" role="status">Consultando… puedes cerrar esta ventana.</div>';
  openModal('ai-modal');
  const current=()=>session===sessionToken()&&run===aiRun&&$('ai-modal').classList.contains('open')&&plants.some(x=>x.id===p.id);
  try{
    const response=await callPlantAI(request);if(!current())return null;
    showReview(response);
    if(request.mode==='photo'){const note=document.createElement('p');note.className='note';note.textContent='No hay historial del tiempo disponible. Solo se incluye una lectura actual aproximada si está reciente.';$('ai-body').append(note);}
    $('ai-copy').onclick=()=>navigator.clipboard?.writeText(aiResponseText(response)).then(()=>toast('Consejo copiado.')).catch(()=>toast('No se pudo copiar.'));
    const save=$('ai-save');save.hidden=false;save.disabled=false;save.textContent=diaryPhoto?'Guardar foto y consejo':'Guardar consejo en la ficha';
    save.onclick=()=>saveReview(p.id,response,diaryPhoto,session,save);
    const values=response.sugerencias;
    if(Object.values(values).some(v=>v!=null)){
      const button=$('ai-apply');button.textContent='Revisar sugerencias';button.style.display='flex';
      button.onclick=()=>{
        if(session!==sessionToken()||!plants.some(x=>x.id===p.id))return;
        closeModal('ai-modal');closeModal('detail-modal');openForm(p.id);
        showPlantSuggestions({...values,confianza:response.confianza,motivo:response.motivo,consejo:response.consejo});
      };
    }
    return response;
  }catch(error){
    if(current()){
      $('ai-body').replaceChildren();const message=document.createElement('p');message.textContent=aiErrorMessage(error);$('ai-body').append(message);
    }
    return null;
  }finally{if(run===aiRun)aiBusy=false;}
}
function aiReviewCard(id){
  const p=plants.find(x=>x.id===id);if(!p)return;
  return runAI(p,'Recomendaciones para revisar',{mode:'review',plantId:id,context:aiContext(p)});
}
function aiPhotoDiag(id){
  if(!aiEnabled()){toast(aiErrorMessage({code:'unavailable'}));return;}
  const p=plants.find(x=>x.id===id);if(!p)return;const session=sessionToken();
  openCameraPhoto(photo=>{if(session===sessionToken()&&plants.some(x=>x.id===id))runAI(p,'Qué se ve y qué comprobar',{mode:'photo',plantId:id,photo,context:aiContext(p)},photo);});
}
async function aiPhotoPicked(e){
  const file=e.target.files[0];if(!file)return;
  const p=plants.find(x=>x.id===aiPhotoPlantId);if(!p)return;
  const session=sessionToken();
  try{
    const [photo,small]=await Promise.all([shrinkImage(file,768,.72),shrinkImage(file,480,.6)]);
    if(session!==sessionToken()||!plants.some(x=>x.id===p.id))return;
    await runAI(p,'Consejo sobre esta foto',{mode:'photo',plantId:p.id,photo,context:aiContext(p)},small);
  }catch{toast('No se pudo leer la foto.');}
}
async function identifyPlant(){
  const name=$('f-name').value.trim();
  if(!name&&!formPhoto){toast('Escribe un nombre o añade una foto primero.');return;}
  if(!aiEnabled()){toast(aiErrorMessage({code:'unavailable'}));return;}
  const revision=formRevision,session=sessionToken(),status=$('f-aistatus'),button=$('f-identify');
  button.disabled=true;$('f-suggestions').hidden=true;status.style.display='block';status.textContent='Consultando…';
  const current=()=>session===sessionToken()&&revision===formRevision&&$('form-modal').classList.contains('open');
  try{
    const response=await callPlantAI({mode:'identify',draft:{name,species:$('f-species').value,loc:$('f-loc').value,light:formLight,waterFreq:+$('f-freq').value,desc:$('f-desc').value},photo:formPhoto,context:aiContext()});
    if(!current())return;
    showPlantSuggestions({...response.sugerencias,confianza:response.confianza,motivo:response.motivo,consejo:response.consejo});
    status.textContent='Revisa, corrige y elige los datos que quieras usar. Aún no se ha aplicado nada.';
  }catch(error){if(current())status.textContent=aiErrorMessage(error);}
  finally{if(current())button.disabled=!aiEnabled();}
}

function showPlantSuggestions(j){
  const box = $("f-suggestions"); box.replaceChildren(); box.hidden = false;
  const confidence = j.confianza === "alta" ? "Identificación probable; comprueba que coincide." : "Identificación dudosa: los cuidados o la especie no están confirmados.";
  const heading = document.createElement("h3"); heading.textContent = "Sugerencias para revisar"; box.append(heading);
  const note = document.createElement("p"); note.className = "note";
  note.textContent = confidence + " " + (typeof j.motivo === "string" ? j.motivo.slice(0,600) : ""); box.append(note);
  const candidates = [
    ["nombreComun", "Nombre común", "f-name"], ["especie", "Especie / tipo", "f-species"], ["ubicacion", "Ubicación recomendada", "f-loc"],
    ["revisarCadaDias", "Recordarme cada (días)", "f-freq"], ["luz", "Luz orientativa", "f-light"],
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
  apply.hidden=!choices.length;
  const discard = document.createElement("button"); discard.type="button"; discard.className="btn soft"; discard.textContent="Descartar sugerencias";
  discard.onclick=()=>{box.hidden=true;box.replaceChildren();$("f-aistatus").textContent="Sugerencias descartadas. Tus datos siguen igual.";};
  box.append(apply,discard);
}


export {aiReviewCard,aiPhotoDiag,aiPhotoPicked,identifyPlant,showPlantSuggestions,mdToHtml,invalidateAI};
