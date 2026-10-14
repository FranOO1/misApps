// Real client module + deterministic SDK doubles. No production network/session.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const reply={resumen:'Consejo de prueba.',consejo:'Comprueba la tierra.',confianza:'media',motivo:'Orientación limitada.',sugerencias:{nombreComun:null,especie:null,luz:null,revisarCadaDias:null,abonoCadaDias:null}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture({attestation=async()=>({token:'test-attestation'}),generate=async()=>({response:{text:()=>JSON.stringify(reply)}}),fakeClock=false}={}){
 const h={session:1,app:{name:'plant-test',options:{projectId:'demo-plantometro',appId:'test-web'}},calls:[],checks:0,options:null,timer:null};
 h.auth={app:h.app,currentUser:{uid:'test-owner'}};
 h.plants=[{id:'p',name:'Planta de prueba',species:'Poto',photo:'data:image/png;base64,dGVzdA==',history:[{t:'agua',date:'2026-10-10',by:'private-author'}],waterFreq:7}];
 h.attest=async()=>{h.checks++;return attestation();};h.generate=async(payload,options)=>{h.calls.push({payload,signal:options.signal});return generate(payload,options);};
 const context=vm.createContext({h,navigator:{onLine:true},AbortController,console,setTimeout:fakeClock?(callback)=>{h.timer=callback;return 1;}:setTimeout,clearTimeout:fakeClock?()=>{}:clearTimeout});
 const mods=new Map();
 function mod(id){
  if(mods.has(id))return mods.get(id);
  let code;
  if(id.endsWith('/sync.js'))code='export const auth=h.auth,plants=h.plants;export const sessionToken=()=>h.session;';
  else if(id.endsWith('/ai-config.js'))code="export const aiConfig={enabled:true,provider:'firebase-ai',appCheckSiteKey:'public-test'};";
  else if(id.endsWith('/firebase-app-check.js'))code=`export class ReCaptchaEnterpriseProvider{};export const initializeAppCheck=(app,options)=>{h.checkApp=app;h.checkOptions=options;return {app};};export const getToken=h.attest;`;
  else if(id.endsWith('/firebase-ai.js'))code=`export class GoogleAIBackend{};export const Schema=new Proxy({},{get:()=>options=>options});export const getAI=(app,options)=>{h.aiApp=app;h.aiOptions=options;return {app};};export const getGenerativeModel=(client,options)=>{h.model=options;return {generateContent:h.generate};};`;
  else code=fs.readFileSync(id,'utf8');
  const m=new vm.SourceTextModule(code,{identifier:id,context,importModuleDynamically:async(spec)=>{const m=mod(spec);if(m.status==='unlinked')await m.link(link);if(m.status==='linked')await m.evaluate();return m;}});mods.set(id,m);return m;
 }
 const link=(spec,parent)=>mod(spec.startsWith('https:')?spec:path.resolve(path.dirname(parent.identifier),spec));
 const client=mod(path.join(root,'js/ai-service.js'));await client.link(link);await client.evaluate();
 return {h,client:client.namespace,context};
}
const q={mode:'question',plantId:'p',question:'¿Por qué amarillean las hojas?'};
test('Auth, App Check and AI share one app; limited-use tokens and bounded question context',async()=>{
 const {h,client}=await fixture();const conversation=Array.from({length:12},()=>({role:'assistant',text:'x'.repeat(3000),email:'never-send'}));
 const result=await client.callPlantAI({...q,conversation});assert.equal(result.resumen,reply.resumen);
 assert.equal(h.aiApp,h.auth.app);assert.equal(h.checkApp,h.auth.app);assert.equal(h.aiOptions.useLimitedUseAppCheckTokens,true);assert.equal(h.checkOptions.isTokenAutoRefreshEnabled,false);assert.equal(h.checks,1);
 const prompt=h.calls[0].payload.contents[0].parts[0].text;
 assert(prompt.includes(q.question));assert.equal(h.calls[0].payload.contents[0].parts.length,1);assert(!prompt.includes('private-author'));assert(!prompt.includes('never-send'));
 const safe=JSON.parse(prompt.split('Pregunta y conversación: ')[1]);assert.equal(safe.conversacion.length,6);assert(safe.conversacion.every(m=>m.text.length===1200));assert.equal(h.plants[0].history.length,1);
});
test('App Check rejects before model call, no raw error or automatic retry',async()=>{
 const {h,client}=await fixture({attestation:async()=>{throw {code:'appCheck/initial-throttle',message:'PRIVATE_TOKEN_NOT_FOR_UI'};}});
 await assert.rejects(client.callPlantAI(q),e=>e.code==='app-check'&&!JSON.stringify(e).includes('PRIVATE_TOKEN'));
 await assert.rejects(client.callPlantAI(q),e=>e.code==='app-check');assert.equal(h.checks,1);assert.equal(h.calls.length,0);
});
test('Empty or error attestation prevents generation',async()=>{
 for(const token of [{},{token:'dummy',error:{code:'appCheck/error'}}]){const {h,client}=await fixture({attestation:async()=>token});await assert.rejects(client.callPlantAI(q),e=>e.code==='app-check');assert.equal(h.calls.length,0);}
});
test('Cancel while checking holds the lock and prevents a late send',async()=>{
 const gate=deferred(),{h,client}=await fixture({attestation:()=>gate.promise});const running=client.callPlantAI(q);
 while(!h.checks)await new Promise(r=>setImmediate(r));client.cancelPlantAI();
 await assert.rejects(client.callPlantAI(q),e=>e.code==='busy');gate.resolve({token:'test'});await assert.rejects(running,e=>e.code==='cancelled');assert.equal(h.calls.length,0);
});
test('Changing account during App Check prevents sending the old plant',async()=>{
 const gate=deferred(),{h,client}=await fixture({attestation:()=>gate.promise});const running=client.callPlantAI(q);while(!h.checks)await new Promise(r=>setImmediate(r));h.session++;h.auth.currentUser={uid:'other-owner'};gate.resolve({token:'test'});await assert.rejects(running,e=>e.code==='unauthenticated');assert.equal(h.calls.length,0);
});
test('Outer deadline aborts; another request cannot overlap an unsettled transport',async()=>{
 const gate=deferred(),{h,client}=await fixture({generate:()=>gate.promise,fakeClock:true});const running=client.callPlantAI(q);while(!h.calls.length)await new Promise(r=>setImmediate(r));h.timer();await assert.rejects(running,e=>e.code==='deadline-exceeded');assert(h.calls[0].signal.aborted);
 await assert.rejects(client.callPlantAI(q),e=>e.code==='busy');gate.resolve({response:{text:()=>JSON.stringify(reply)}});await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);
});
test('Empty question/offline/429 stay safe and never change plants',async()=>{
 const {h,client,context}=await fixture({generate:async()=>{throw {code:'ai/fetch-error',customErrorData:{status:429},message:'PRIVATE_MODEL_BODY'};}});
 await assert.rejects(client.callPlantAI({...q,question:''}),e=>e.code==='invalid-argument');assert.equal(h.checks,0);
 context.navigator.onLine=false;await assert.rejects(client.callPlantAI(q),e=>e.code==='offline');context.navigator.onLine=true;
 await assert.rejects(client.callPlantAI(q),e=>e.code==='resource-exhausted'&&!JSON.stringify(e).includes('PRIVATE_MODEL'));assert.equal(h.plants[0].history.length,1);
});

test('AI Logic invalid App Check token blocks retries even after cached preflight',async()=>{
 const {h,client}=await fixture({generate:async()=>{throw {code:'ai/fetch-error',customErrorData:{status:403},message:'Firebase App Check token is invalid PRIVATE_TOKEN'};}});
 await assert.rejects(client.callPlantAI(q),e=>e.code==='app-check'&&!JSON.stringify(e).includes('PRIVATE_TOKEN'));
 await assert.rejects(client.callPlantAI(q),e=>e.code==='app-check');assert.equal(h.calls.length,1);assert.equal(h.checks,1);
});
