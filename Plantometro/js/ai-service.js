import {makePrompt} from '../shared/ai-input.js';
import {aiConfig} from './ai-config.js';
import {auth,plants,sessionToken} from './sync.js';
import {normalizeAIResponse} from '../shared/ai-response.js';

const AI_UNAVAILABLE='Ayuda con IA no disponible';
const messages={
  'offline':'No hay conexión. Puedes seguir cuidando tus plantas y consultar más tarde.',
  'unavailable':AI_UNAVAILABLE+'. Puedes cuidar y guardar tus plantas sin ella.',
  'unauthenticated':'Entra con Google para consultar la ayuda con IA.',
  'permission-denied':AI_UNAVAILABLE+' para esta cuenta.',
  'resource-exhausted':'Se ha alcanzado el límite de consultas. Inténtalo más tarde.',
  'deadline-exceeded':'La consulta está tardando demasiado. Inténtalo otra vez.',
  'invalid-argument':'No se pudo leer la consulta. Revisa el nombre o la foto.',
  'data-loss':'La IA no devolvió una respuesta válida. Tus datos siguen igual.',
  'failed-precondition':'No se pudo verificar la consulta. Vuelve a abrir la app e inténtalo otra vez.'
};
function aiEnabled(){return aiConfig.enabled===true && !!aiConfig.appCheckSiteKey;}
function aiErrorMessage(error){return messages[String(error?.code||'').replace(/^functions\//,'')]||'No se pudo consultar la ayuda con IA. Tus datos siguen igual.';}
function aiStatus(){return aiEnabled()?'Ayuda opcional: revisa las sugerencias antes de guardar.':AI_UNAVAILABLE;}
let modelClient=null,modelInitializing=null,
 client=null,initializing=null,checkStarted=false;

async function firebaseAIRequest(data,session,uid){
  if(!modelClient){
    modelInitializing ||= (async()=>{
      const [checks,ai]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js'),import('https://www.gstatic.com/firebasejs/12.10.0/firebase-ai.js')]);
      if(!checkStarted){checks.initializeAppCheck(auth.app,{provider:new checks.ReCaptchaEnterpriseProvider(aiConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});checkStarted=true;}
      const S=ai.Schema,nullableText=()=>S.string({nullable:true});
      const suggestions=S.object({properties:{
        nombreComun:nullableText(),especie:nullableText(),ubicacion:nullableText(),
        revisarCadaDias:S.integer({nullable:true}),abonoCadaDias:S.integer({nullable:true}),
        luz:S.enumString({enum:['sol','media','sombra'],nullable:true})
      }});
      const schema=S.object({properties:{resumen:S.string(),consejo:S.string(),
        confianza:S.enumString({enum:['alta','media','baja']}),motivo:S.string(),sugerencias:suggestions,
        analisis:S.object({nullable:true,properties:{observado:S.string(),causas:S.array({items:S.string(),maxItems:3}),comprobar:S.array({items:S.string(),maxItems:3}),recomendacion:S.string()}})}});
      modelClient=ai.getGenerativeModel(ai.getAI(auth.app,{backend:new ai.GoogleAIBackend()}),{model:'gemini-3.1-flash-lite',generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:1000,temperature:.2,thinkingConfig:{thinkingLevel:'MINIMAL'}}},{timeout:35000});
    })().finally(()=>{modelInitializing=null;});await modelInitializing;
  }
  if(session!==sessionToken()||auth.currentUser?.uid!==uid)throw {code:'unauthenticated'};
  const plant=data.mode==='identify'?data.draft:plants.find(p=>p.id===data.plantId);
  if(!plant)throw {code:'invalid-argument'};
  const parts=[{text:makePrompt(data.mode,plant,data.context)}];
  const photo=typeof data.photo==='string'?data.photo:plant.photo;
  const image=(img,max)=>{if(typeof img!=='string'||img.length>max)return null;const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);return match?{inlineData:{mimeType:match[1],data:match[2]}}:null;};
  const current=image(photo,650000);if((data.photo||data.mode==='photo')&&!current)throw {code:'invalid-argument'};if(current)parts.push(current);
  if(data.mode==='photo')for(const entry of (plant.gallery||[]).slice(0,2)){const previous=image(entry.img,220000);if(previous)parts.push({text:'Foto anterior del diario: '+String(entry.date||'').slice(0,10)},previous);}
  const result=await modelClient.generateContent({contents:[{role:'user',parts}]});
  try{return normalizeAIResponse(result.response.text());}catch{throw {code:'data-loss'};}
}

async function callPlantAI(data){
  if(!aiEnabled())throw {code:'unavailable'};
  if(navigator.onLine===false)throw {code:'offline'};
  if(!auth?.currentUser)throw {code:'unauthenticated'};
  const session=sessionToken();
  let timer;
  try{
    const pending=(async()=>{
    if(aiConfig.provider==='firebase-ai'){const response=await firebaseAIRequest(data,session,auth.currentUser.uid);if(session!==sessionToken())throw {code:'unauthenticated'};return response;}
    if(!client){
      initializing ||= (async()=>{
        const [checks,functions]=await Promise.all([
          import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js'),
          import('https://www.gstatic.com/firebasejs/12.10.0/firebase-functions.js')
        ]);
        if(!checkStarted){
          checks.initializeAppCheck(auth.app,{provider:new checks.ReCaptchaEnterpriseProvider(aiConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});checkStarted=true;
        }
        client=functions.httpsCallable(functions.getFunctions(auth.app,aiConfig.region),aiConfig.functionName,{timeout:45000,limitedUseAppCheckTokens:true});
      })().finally(()=>{initializing=null;});
      await initializing;
    }
    if(session!==sessionToken())throw {code:'unauthenticated'};
    const result=await client(data);
    if(session!==sessionToken())throw {code:'unauthenticated'};
    try{return normalizeAIResponse(result.data);}catch{throw {code:'data-loss'};}
    })();
    return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:'deadline-exceeded'}),45000);})]);
  }catch(error){
    // Never expose SDK details, payloads, attestation/ID tokens or model responses.
    let code=String(error?.code||'unavailable').replace(/^(functions|ai)\//,'');
    if(code==='fetch-error'){const status=(error?.customErrorData||error?.customData)?.status;code=status===429?'resource-exhausted':status===401?'unauthenticated':status===403?'permission-denied':'unavailable';}
    if(code==='invalid-ai-response'||code==='response-error')code='data-loss';
    if(error?.name==='AbortError')code='deadline-exceeded';
    throw {code};
  }finally{clearTimeout(timer);}
}
export {AI_UNAVAILABLE,aiEnabled,aiStatus,aiErrorMessage,callPlantAI};
