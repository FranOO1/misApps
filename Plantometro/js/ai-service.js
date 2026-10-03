import {aiConfig} from './ai-config.js';
import {auth,sessionToken} from './sync.js';
import {normalizeAIResponse} from '../shared/ai-response.js';

const AI_UNAVAILABLE='Ayuda con IA no disponible';
const messages={
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
let client=null,initializing=null,checkStarted=false;
async function callPlantAI(data){
  if(!aiEnabled())throw {code:'unavailable'};
  if(!auth?.currentUser)throw {code:'unauthenticated'};
  const session=sessionToken();
  let timer;
  try{
    const pending=(async()=>{
    if(!client){
      initializing ||= (async()=>{
        const [checks,functions]=await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js'),
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js')
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
    throw {code:String(error?.code||'unavailable').replace(/^functions\//,'')};
  }finally{clearTimeout(timer);}
}
export {AI_UNAVAILABLE,aiEnabled,aiStatus,aiErrorMessage,callPlantAI};
