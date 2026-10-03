import {GoogleAuth} from 'google-auth-library';
import {AIError} from './core.js';
const nullableString={type:'STRING',nullable:true};
const responseSchema={type:'OBJECT',required:['resumen','consejo','confianza','motivo','sugerencias'],properties:{
  resumen:{type:'STRING'},consejo:{type:'STRING'},confianza:{type:'STRING',enum:['alta','media','baja']},motivo:{type:'STRING'},
  sugerencias:{type:'OBJECT',required:['nombreComun','especie','revisarCadaDias','abonoCadaDias','luz'],properties:{
    nombreComun:nullableString,especie:nullableString,revisarCadaDias:{type:'INTEGER',nullable:true},
    abonoCadaDias:{type:'INTEGER',nullable:true},luz:{type:'STRING',enum:['sol','media','sombra'],nullable:true}
  }}
}};
function createVertex({project,location='europe-west1',model='gemini-2.5-flash',googleAuth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}),fetcher=fetch}){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||'') || !/^[a-z]+-[a-z]+\d$/.test(location) || model!=='gemini-2.5-flash')throw new AIError('unavailable');
  return async({prompt,photo})=>{
    const token=await googleAuth.getAccessToken();if(!token)throw new AIError('unavailable');
    const parts=[{text:prompt}];
    if(photo){const [,mimeType,data]=/^data:(image\/[^;]+);base64,(.+)$/.exec(photo);parts.push({inlineData:{mimeType,data}});}
    let response;
    try{response=await fetcher(`https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema,temperature:0.2,maxOutputTokens:1000}}),
      signal:AbortSignal.timeout(35000)
    });}catch(error){throw new AIError(error.name==='TimeoutError'?'deadline-exceeded':'unavailable');}
    if(!response.ok)throw new AIError(response.status===429?'resource-exhausted':'unavailable');
    let value;try{value=await response.json();}catch{throw new AIError('data-loss');}
    return (value.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  };
}
export {createVertex,responseSchema};
