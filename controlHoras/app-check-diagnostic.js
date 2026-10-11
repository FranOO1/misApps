// Observe only failed exchanges for this exact Firebase app. Never inspect request
// bodies/headers, successful attestation bodies, tokens, keys or free-form output.
const transports=new WeakMap();
const statuses=new Set(['INVALID_ARGUMENT','FAILED_PRECONDITION','PERMISSION_DENIED','NOT_FOUND','RESOURCE_EXHAUSTED','UNAUTHENTICATED','UNAVAILABLE','INTERNAL']);
const descriptions=Object.freeze({
  'app-not-registered':'La aplicación no está registrada en App Check.',
  'site-key-mismatch':'La clave de sitio no coincide con el registro de App Check.',
  'domain-rejected':'reCAPTCHA no ha autorizado este dominio.',
  'invalid-app':'El identificador de aplicación no es válido.',
  'attestation-rejected':'Google ha rechazado la verificación de la aplicación.',
  'service-disabled':'El servicio de verificación no está habilitado.',
  'exchange-rejected':'Google ha rechazado el intercambio de App Check; no ha indicado una causa reconocida.'
});
export function safeOriginal(value){
  const status=Number(value?.status);
  if(!Number.isInteger(status)||status<400||status>599)return null;
  const cause=Object.hasOwn(descriptions,value?.cause)?value.cause:'exchange-rejected';
  return {code:'appCheck/fetch-status-error',status,cause,message:descriptions[cause],...(statuses.has(value?.backendStatus)?{backendStatus:value.backendStatus}:{})};
}
export function describeRejection(status,body){
  const error=body?.error,message=typeof error?.message==='string'?error.message.slice(0,12000):'';
  const patterns=[
    [/app(?:lication)?(?: [^\n]{0,200})? (?:is )?not registered|APP_NOT_REGISTERED/i,'app-not-registered'],
    [/site.?key.*(?:mismatch|does not match|not match)|RECAPTCHA_SITE_KEY_MISMATCH/i,'site-key-mismatch'],
    [/domain.*(?:not allowed|not authorized|mismatch|invalid)|hostname.*(?:mismatch|invalid)/i,'domain-rejected'],
    [/app.?id.*(?:invalid|malformed)|invalid.*app.?id/i,'invalid-app'],
    [/SERVICE_DISABLED|API.*(?:not enabled|disabled)/i,'service-disabled'],
    [/App attestation failed|reCAPTCHA.*(?:invalid|failed)|invalid.*reCAPTCHA/i,'attestation-rejected']
  ];
  return safeOriginal({status,cause:patterns.find(([pattern])=>pattern.test(message))?.[1],backendStatus:error?.status});
}
async function rejectionBody(response){
  // Bound both time and size. Only a clone of an HTTP failure is inspected.
  let reader;
  const read=async()=>{
    reader=response.clone().body?.getReader();if(!reader)return null;
    let bytes=0,parts=[];
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384)return null;parts.push(value);}
    const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}
    try{return JSON.parse(new TextDecoder().decode(all));}catch{return null;}
  };
  let timer;try{return await Promise.race([read().catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),500);})]);}
  finally{clearTimeout(timer);if(reader)void reader.cancel().catch(()=>{});}
}
export function observeAppCheck(options,transport=globalThis){
  const path=`/v1/projects/${options.projectId}/apps/${options.appId}:exchangeRecaptchaEnterpriseToken`;
  if(typeof transport.fetch!=='function')return ()=>null;
  let state=transports.get(transport);
  if(!state){
    state={entries:new Map(),fetch:transport.fetch};transports.set(transport,state);
    transport.fetch=async function(...args){
      const response=await state.fetch.apply(this,args);
      let url;try{url=new URL(typeof args[0]==='string'||args[0] instanceof URL?args[0]:args[0]?.url);}catch{return response;}
      const entry=url.origin==='https://firebaseappcheck.googleapis.com'&&state.entries.get(url.pathname);
      if(entry&&!entry.original&&response.status>=400){
        // Reserve the first rejection before another request can overwrite it.
        entry.original=describeRejection(response.status,null);
        entry.original=describeRejection(response.status,await rejectionBody(response));
      }
      return response;
    };
  }
  if(!state.entries.has(path))state.entries.set(path,{original:null});
  return ()=>safeOriginal(state.entries.get(path).original);
}
