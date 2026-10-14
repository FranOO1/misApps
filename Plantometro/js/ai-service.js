import {observeAppCheck,safeOriginal} from './app-check-diagnostic.js';
import {makePrompt} from '../shared/ai-input.js';
import {aiConfig} from './ai-config.js';
import {auth,plants,sessionToken} from './sync.js';
import {normalizeAIResponse} from '../shared/ai-response.js';

const AI_UNAVAILABLE='Ayuda con IA no disponible';
const messages={
  'busy':'Hay una consulta en curso. Espera un momento.',
  'app-check':'No se pudo verificar la aplicación (App Check). Reabre la app para volver a intentarlo.',
  'cancelled':'Consulta cerrada. Tus datos siguen igual.',
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
function aiErrorMessage(error){
 const code=String(error?.code||'').replace(/^functions\//,'');
 const detail=code==='app-check'?safeOriginal(error?.diagnostic):null;
 return detail?'App Check · HTTP '+detail.status+': '+detail.message+' Reabre la app para volver a intentarlo.':messages[code]||'No se pudo consultar la ayuda con IA. Tus datos siguen igual.';
}
function aiStatus(){return aiEnabled()?'Ayuda opcional: revisa las sugerencias antes de guardar.':AI_UNAVAILABLE;}
let modelClient=null,modelInitializing=null,
 client=null,initializing=null,checkStarted=false,appCheck=null,checkSDK=null,activeRequest=null,blockedSession=null,firstCheckRejection=()=>null;
function cancelPlantAI(){if(activeRequest){activeRequest.cancelled=true;activeRequest.controller.abort();}}
function requireCurrent(request){if(request.cancelled)throw {code:'cancelled'};if(request.session!==sessionToken()||auth.currentUser?.uid!==request.uid)throw {code:'unauthenticated'};}

async function firebaseAIRequest(data,request){
  if(!modelClient){
    modelInitializing ||= (async()=>{
      const [checks,ai]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-check.js'),import('https://www.gstatic.com/firebasejs/12.14.0/firebase-ai.js')]);
      if(!checkStarted){firstCheckRejection=observeAppCheck(auth.app.options);appCheck=checks.initializeAppCheck(auth.app,{provider:new checks.ReCaptchaEnterpriseProvider(aiConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:false});checkSDK=checks;checkStarted=true;}
      const S=ai.Schema,nullableText=()=>S.string({nullable:true});
      const suggestions=S.object({properties:{
        nombreComun:nullableText(),especie:nullableText(),ubicacion:nullableText(),
        revisarCadaDias:S.integer({nullable:true}),abonoCadaDias:S.integer({nullable:true}),
        luz:S.enumString({enum:['sol','media','sombra'],nullable:true})
      }});
      const schema=S.object({properties:{resumen:S.string(),consejo:S.string(),
        confianza:S.enumString({enum:['alta','media','baja']}),motivo:S.string(),sugerencias:suggestions,
        analisis:S.object({nullable:true,properties:{observado:S.string(),causas:S.array({items:S.string(),maxItems:3}),comprobar:S.array({items:S.string(),maxItems:3}),recomendacion:S.string()}})}});
      modelClient=ai.getGenerativeModel(ai.getAI(auth.app,{backend:new ai.GoogleAIBackend(),useLimitedUseAppCheckTokens:true}),{model:'gemini-3.1-flash-lite',generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:1000,temperature:.2,thinkingConfig:{thinkingLevel:'MINIMAL'}}},{timeout:35000});
    })().finally(()=>{modelInitializing=null;});await modelInitializing;
  }
  requireCurrent(request);
  // The official AI SDK can otherwise send a dummy token after attestation fails.
  try{const token=await checkSDK.getToken(appCheck,false);requireCurrent(request);if(token?.error)throw token.error;if(!token?.token)throw {code:'app-check'};}
  catch(error){if(error?.code==='cancelled'||error?.code==='unauthenticated')throw error;blockedSession=request.session;throw {code:'app-check'};}
  requireCurrent(request);
  const plant=data.mode==='identify'?data.draft:plants.find(p=>p.id===data.plantId);
  if(!plant)throw {code:'invalid-argument'};
  const parts=[{text:makePrompt(data.mode,plant,data.context,data)}];
  const photo=typeof data.photo==='string'?data.photo:data.mode==='question'?null:plant.photo;
  const image=(img,max)=>{if(typeof img!=='string'||img.length>max)return null;const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);return match?{inlineData:{mimeType:match[1],data:match[2]}}:null;};
  const current=image(photo,650000);if((data.photo||data.mode==='photo')&&!current)throw {code:'invalid-argument'};if(current)parts.push(current);
  if(data.mode==='photo')for(const entry of (plant.gallery||[]).slice(0,2)){const previous=image(entry.img,220000);if(previous)parts.push({text:'Foto anterior del diario: '+String(entry.date||'').slice(0,10)},previous);}
  const result=await modelClient.generateContent({contents:[{role:'user',parts}]},{signal:request.controller.signal});
  requireCurrent(request);
  try{return normalizeAIResponse(result.response.text());}catch{throw {code:'data-loss'};}
}

async function callPlantAI(data){
  if(!aiEnabled())throw {code:'unavailable'};
  if(navigator.onLine===false)throw {code:'offline'};
  if(!auth?.currentUser)throw {code:'unauthenticated'};
  if(!data||!['identify','review','photo','question'].includes(data.mode))throw {code:'invalid-argument'};
  if(data.mode==='question'&&(typeof data.question!=='string'||!data.question.trim()||data.question.length>1000))throw {code:'invalid-argument'};
  if(activeRequest)throw {code:'busy'};
  const session=sessionToken();if(blockedSession===session)throw {code:'app-check',diagnostic:firstCheckRejection()};
  const request={session,uid:auth.currentUser.uid,cancelled:false,controller:new AbortController()};activeRequest=request;
  let timer;
  try{
    const pending=(async()=>{
    if(aiConfig.provider==='firebase-ai'){const response=await firebaseAIRequest(data,request);if(session!==sessionToken())throw {code:'unauthenticated'};return response;}
    if(!client){
      initializing ||= (async()=>{
        const [checks,functions]=await Promise.all([
          import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-check.js'),
          import('https://www.gstatic.com/firebasejs/12.14.0/firebase-functions.js')
        ]);
        if(!checkStarted){
          appCheck=checks.initializeAppCheck(auth.app,{provider:new checks.ReCaptchaEnterpriseProvider(aiConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:false});checkSDK=checks;checkStarted=true;
        }
        client=functions.httpsCallable(functions.getFunctions(auth.app,aiConfig.region),aiConfig.functionName,{timeout:45000,limitedUseAppCheckTokens:true});
      })().finally(()=>{initializing=null;});
      await initializing;
    }
    requireCurrent(request);
    const result=await client(data);
    requireCurrent(request);
    try{return normalizeAIResponse(result.data);}catch{throw {code:'data-loss'};}
    })();
    // Keep the lock until the transport settles, including after timeout/cancel.
    pending.then(()=>{if(activeRequest===request)activeRequest=null;},()=>{if(activeRequest===request)activeRequest=null;});
    return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{request.cancelled=true;request.controller.abort();reject({code:'deadline-exceeded'});},45000);})]);
  }catch(error){
    // Never expose SDK details, payloads, attestation/ID tokens or model responses.
    let code=String(error?.code||'unavailable').replace(/^(functions|ai)\//,'');
    if(code==='fetch-error'){const status=(error?.customErrorData||error?.customData)?.status;code=status===429?'resource-exhausted':status===401?'unauthenticated':status===403?'permission-denied':'unavailable';}
    if(code==='invalid-ai-response'||code==='response-error')code='data-loss';
    if(error?.name==='AbortError')code=request.cancelled?'cancelled':'deadline-exceeded';
    if(String(error?.code||'').startsWith('appCheck/')||/Firebase App Check token is (?:invalid|missing)/i.test(String(error?.message||'').slice(0,12000))){code='app-check';blockedSession=session;}
    throw {code,...(code==='app-check'?{diagnostic:firstCheckRejection()}: {})};
  }finally{clearTimeout(timer);}
}
export {AI_UNAVAILABLE,aiEnabled,aiStatus,aiErrorMessage,callPlantAI,cancelPlantAI};
