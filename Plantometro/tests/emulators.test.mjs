import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {spawnSync} from 'node:child_process';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createAIHandler,googleAccountAllowed} from '../server/core.js';
import {createStore} from '../server/store.js';

const project='demo-plantometro';
assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,'Run only through firebase emulators:exec');
assert.equal(process.env.GCLOUD_PROJECT,project,'Only the disposable demo project is allowed');
initializeApp({projectId:project});const db=getFirestore(),auth=getAuth();
// This emulator version cannot load security rules for named databases. The
// counters adapter uses the local default database ONLY in these tests. The
// cloud function uses plantometro-ai; its isolation awaits Google deployment.
const quotaDb=db;
const response={resumen:'Ejemplo de consejo.',consejo:'Comprueba la tierra.',confianza:'baja',motivo:'Proveedor de prueba, no Gemini.',sugerencias:{nombreComun:null,especie:null,revisarCadaDias:7,abonoCadaDias:null,luz:null}};
let modelCalls=0;const handler=createAIHandler({store:createStore(db,{quotaDb}),generate:async()=>{modelCalls++;return response;},dailyUserLimit:3,dailyGlobalLimit:6,
  authorize:async uid=>{const user=await auth.getUser(uid);return googleAccountAllowed(user);}});
// App Check has no local signed-token issuer. This harness bypasses ONLY that
// boundary, while exercising real callable Auth verification and Firestore.
const callable=onCall({cors:['https://franoo1.github.io']},async req=>{
  try{return await handler({...req,app:{appId:'local-attestation-adapter'}});}catch(e){throw new HttpsError(e.code||'unavailable','Consulta rechazada.');}
});
const requiredCheck=onCall({enforceAppCheck:true,consumeAppCheckToken:true,cors:['https://franoo1.github.io']},async()=>response);
const app=express();app.use(express.json({limit:'1mb'}));app.post('/check',requiredCheck);app.post('/',callable);
const server=http.createServer(app);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.terminate();});
async function token(uid,allowed=true){
  await auth.createUser({uid});if(allowed)await auth.updateUser(uid,{providerToLink:{providerId:'google.com',uid:'google-'+uid}});
  const custom=await auth.createCustomToken(uid);
  const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local-test-only',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
  const body=await r.json();assert(body.idToken,'Emulator sign-in failed');return body.idToken;
}
async function invoke(idToken,data={mode:'identify',draft:{name:'Test'}},path='/'){
  const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://franoo1.github.io',...(idToken?{Authorization:'Bearer '+idToken}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(10000)});
  return {status:r.status,body:await r.json()};
}
test('Real local Auth and callable: unauthenticated and accounts without Google provider rejected',async()=>{
  assert.equal((await invoke()).status,401);
  const t=await token('unapproved',false);assert.equal((await invoke(t)).status,403);assert.equal(modelCalls,0);
});
test('Real local App Check boundary rejects a missing attestation',async()=>{
  const t=await token('check-user');const r=await invoke(t,undefined,'/check');assert.equal(r.status,401);
});
test('Real local Firestore transaction enforces quota and preserves plants',async()=>{
  const t=await token('approved');const existing={id:'plant-a',name:'A',waterFreq:7,history:[{t:'agua',date:'2026-01-01',by:'Test'}],futureField:'keep'};
  await db.doc('users/approved/plants/plant-a').set(existing);
  for(let i=0;i<3;i++)assert.equal((await invoke(t,{mode:'review',plantId:'plant-a'})).status,200);
  const before=modelCalls;assert.equal((await invoke(t)).status,429);assert.equal(modelCalls,before);
  assert.deepEqual((await db.doc('users/approved/plants/plant-a').get()).data(),existing);
});
test('Concurrent reservations have one winner; lease release cannot erase a newer operation',async()=>{
  const store=createStore(db,{quotaDb}),params={uid:'concurrent',day:'2026-10-02',now:1000,dailyUserLimit:10,dailyGlobalLimit:200};
  const jobs=await Promise.allSettled(Array.from({length:5},(_,i)=>store.reserve({...params,lease:'lease-'+i})));
  assert.equal(jobs.filter(j=>j.status==='fulfilled').length,1);
  const ref=quotaDb.doc('_plantometro_ai_limits/2026-10-02/users/concurrent'),lease=(await ref.get()).data().lease;
  await store.release({...params,lease:'wrong-lease'});assert.equal((await ref.get()).data().lease,lease);
  await store.release({...params,lease});assert.equal((await ref.get()).data().busyUntil,0);
});
test('Real local security rules: own garden only; private quota inaccessible',async()=>{
  const t=await token('rule-user');await db.doc('users/rule-user/plants/one').set({name:'Own'});
  const base='http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+project+'/databases/(default)/documents/';
  const own=await fetch(base+'users/rule-user/plants/one',{headers:{Authorization:'Bearer '+t}});assert.equal(own.status,200);
  const other=await fetch(base+'users/approved/plants/plant-a',{headers:{Authorization:'Bearer '+t}});assert.equal(other.status,403);
  const privateBase=base;
  const privateRead=await fetch(privateBase+'_plantometro_ai_limits/2026-10-02',{headers:{Authorization:'Bearer '+t}});assert.equal(privateRead.status,403);
  const privateWrite=await fetch(privateBase+'_plantometro_ai_limits/2026-10-03',{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({fields:{calls:{integerValue:'0'}}})});assert.equal(privateWrite.status,403);
});
test('Disabling a Google account rejects even an existing signed token',async()=>{
  const t=await token('revoked-user');await auth.updateUser('revoked-user',{disabled:true});
  const before=modelCalls;assert.equal((await invoke(t)).status,401);assert.equal(modelCalls,before);
});
test('Actual browser SDK synchronizes disposable mobile/tablet accounts through real local services',async()=>{
  await auth.createUser({uid:'browser-owner'});await auth.createUser({uid:'browser-other'});
  await db.doc('users/browser-owner/plants/keep').set({id:'keep',name:'Ficha conservada de prueba',waterFreq:7,lastWater:'2026-01-01',history:[],gallery:[],futureField:'preserved'});
  const owner=await auth.createCustomToken('browser-owner'),other=await auth.createCustomToken('browser-other');
  const run=spawnSync('python',['-u','tests/browser_emulator.py'],{input:JSON.stringify({owner,other}),encoding:'utf8',timeout:150000});
  if(run.stdout)process.stdout.write(run.stdout);
  assert.equal(run.status,0,run.stderr||'Browser integration did not finish');
});
