// Untrusted model output: the browser and server share this small contract.
const CONFIDENCE = ['alta', 'media', 'baja'];
function normalizeAIResponse(value){
  if(typeof value==='string'){
    const text=value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    if(!text || text.length>12000)throw Error('invalid-ai-response');
    try{value=JSON.parse(text);}catch{throw Error('invalid-ai-response');}
  }
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('invalid-ai-response');
  const text=(v,max,required=false)=>{
    if(v==null && !required)return null;
    if(typeof v!=='string' || !v.trim() || v.length>max || /^(?:```|[\[{])/.test(v.trim()))throw Error('invalid-ai-response');
    return v.trim();
  };
  const number=(v,min,max)=>{if(v==null)return null;if(!Number.isInteger(v)||v<min||v>max)throw Error('invalid-ai-response');return v;};
  const s=value.sugerencias;
  if(!s || typeof s!=='object' || Array.isArray(s) || !CONFIDENCE.includes(value.confianza))throw Error('invalid-ai-response');
  if(s.luz!=null && !['sol','media','sombra'].includes(s.luz))throw Error('invalid-ai-response');
  let analysis;
  if(value.analisis!=null){
    const a=value.analisis;if(typeof a!=='object'||Array.isArray(a))throw Error('invalid-ai-response');
    const list=v=>{if(!Array.isArray(v)||v.length>3)throw Error('invalid-ai-response');return v.map(x=>text(x,220,true));};
    analysis={observado:text(a.observado,300,true),causas:list(a.causas),comprobar:list(a.comprobar),recomendacion:text(a.recomendacion,400,true)};
  }
  return {
    ...(analysis?{analisis:analysis}:{}),resumen:text(value.resumen,300,true),consejo:text(value.consejo,700,true),
    confianza:value.confianza,motivo:text(value.motivo,600,true),
    sugerencias:{nombreComun:text(s.nombreComun,120),especie:text(s.especie,160),
      revisarCadaDias:number(s.revisarCadaDias,1,120),abonoCadaDias:number(s.abonoCadaDias,0,365),luz:s.luz||null,...(s.ubicacion!=null?{ubicacion:text(s.ubicacion,160)}:{})}
  };
}
function aiResponseText(value){
  const r=normalizeAIResponse(value);
  const detail=r.analisis?'\n\n'+r.analisis.observado+'\nCausas posibles: '+r.analisis.causas.join('; ')+'\nQué comprobar: '+r.analisis.comprobar.join('; ')+'\n'+r.analisis.recomendacion:'';
  return r.resumen+detail+'\n\n'+r.consejo+'\n\n'+(r.confianza==='baja'?'Identificación dudosa. ':'')+r.motivo;
}
function readableSavedAI(text){
  const value=typeof text==='string'?text.trim():'';
  if(!value)return 'La revisión guardada está vacía.';
  if(value.startsWith('{') || /^```(?:json)?\s*\{/i.test(value)){
    try{return aiResponseText(value);}catch{}
    try{
      const j=JSON.parse(value.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      const pieces=[j.nombreComun,j.especie,j.motivo,j.consejo].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.slice(0,700));
      if(pieces.length)return 'Recomendación guardada, sin confirmar.\n\n'+pieces.join('\n\n');
    }catch{}
    return 'Esta revisión guardada no contiene un texto legible. Puedes volver a consultar cuando la ayuda con IA esté disponible.';
  }
  return value.replace(/```json\s*\{[\s\S]*?\}\s*```/gi,'').trim() || 'La revisión guardada no contiene un consejo.';
}
export {normalizeAIResponse,aiResponseText,readableSavedAI};
