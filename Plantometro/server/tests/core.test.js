import test from 'node:test';
import assert from 'node:assert/strict';
import {AIError,checkRequest,careInput,createAIHandler} from '../core.js';
import {createVertex} from '../vertex.js';
import {normalizeAIResponse,readableSavedAI} from '../../shared/ai-response.js';

const response={resumen:'Una planta que observar.',consejo:'Mira la tierra antes de decidir.',confianza:'baja',motivo:'La foto no confirma la especie.',sugerencias:{nombreComun:'Poto',especie:'Epipremnum aureum',revisarCadaDias:8,abonoCadaDias:null,luz:'media'}};
const request=()=>({auth:{uid:'test-user',token:{plantometroAI:true}},app:{appId:'test-app'},data:{mode:'identify',draft:{name:'Mi planta'}}});
const error=code=>e=>e instanceof AIError&&e.code===code;
test('Auth, allowed account, attestation, replay and bounded request are required',()=>{
  for(const [change,code] of [
    [{auth:null},'unauthenticated'],[{auth:{uid:'u',token:{}}},'permission-denied'],[{app:null},'failed-precondition'],
    [{app:{appId:'test-app',alreadyConsumed:true}},'failed-precondition'],[{data:{mode:'anything'}},'invalid-argument'],
    [{data:{mode:'review',plantId:'../other-user'}},'invalid-argument'],
    [{data:{mode:'identify',draft:{},photo:'https://internal.invalid'}},'invalid-argument'],
    [{data:{mode:'identify',draft:{},photo:'data:image/jpeg;base64,'+'A'.repeat(650001)}},'invalid-argument']
  ])assert.throws(()=>checkRequest({...request(),...change}),error(code));
  assert.equal(checkRequest(request()).mode,'identify');
});
test('Model responses are bounded and malformed/empty/raw text rejected',()=>{
  assert.deepEqual(normalizeAIResponse(JSON.stringify(response)),response);
  for(const bad of ['',null,[],{},'not json','{}',{...response,resumen:'{"raw":true}'},{...response,sugerencias:{revisarCadaDias:121}}, {...response,confianza:'certain'}])assert.throws(()=>normalizeAIResponse(bad));
  assert(!readableSavedAI(JSON.stringify({nombreComun:'Poto',consejo:'Observa la tierra.'})).includes('{'));
  assert(!readableSavedAI('{broken').includes('{'));
  assert.equal(readableSavedAI('Un consejo anterior.'),'Un consejo anterior.');
});
test('Gateway reads only the authenticated garden and never writes plants',async()=>{
  const calls=[];
  const store={reserve:async x=>calls.push(['reserve',x.uid]),release:async x=>calls.push(['release',x.uid]),readPlant:async(uid,id)=>{calls.push(['read',uid,id]);return {name:'Bob',photo:'https://example.invalid/photo.jpg'};}};
  let seen;const handler=createAIHandler({store,generate:async input=>{seen=input;return response;}});
  const req=request();req.data={mode:'review',plantId:'plant-1',uid:'someone-else'};
  assert.deepEqual(await handler(req),response);
  assert.deepEqual(calls,[['reserve','test-user'],['read','test-user','plant-1'],['release','test-user']]);
  assert.equal(seen.photo,null);assert.match(seen.prompt,/no es un calendario obligatorio/);
});
test('Quota rejection makes no provider call; failure releases its own lease',async()=>{
  let calls=0,released=0;
  const limited=createAIHandler({store:{reserve:async()=>{throw new AIError('resource-exhausted');}},generate:async()=>{calls++;}});
  await assert.rejects(limited(request()),error('resource-exhausted'));assert.equal(calls,0);
  for(const generator of [async()=>'',async()=>{throw Error('private provider details');},async()=>{throw new AIError('deadline-exceeded');}]){
    const handler=createAIHandler({store:{reserve:async()=>{},release:async()=>{released++;}},generate:generator});
    await assert.rejects(handler(request()),e=>['data-loss','unavailable','deadline-exceeded'].includes(e.code)&&!e.message.includes('private'));
  }
  assert.equal(released,3);
});
test('Only minimal fields reach the model, never author/account metadata',()=>{
  const safe=careInput({name:'Plant',waterFreq:7,geminiKey:'sensitive-marker',futureField:'preserved',history:[{t:'agua',date:'2026-01-01',by:'Person'}]});
  assert(!JSON.stringify(safe).includes('sensitive-marker'));assert(!JSON.stringify(safe).includes('Person'));assert(!JSON.stringify(safe).includes('futureField'));
});
test('Vertex uses runtime identity with a fixed model and structured output',async()=>{
  let sent;
  const vertex=createVertex({project:'demo-plantometro',googleAuth:{getAccessToken:async()=>'test-only-token'},fetcher:async(url,opts)=>{sent={url,opts};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(response)}]}}]})};}});
  assert.deepEqual(normalizeAIResponse(await vertex({prompt:'Care',photo:null})),response);
  assert.match(sent.url,/aiplatform.googleapis.com/);assert(!sent.url.includes('key='));
  assert.equal(sent.opts.headers.Authorization,'Bearer test-only-token');assert(!('x-goog-api-key' in sent.opts.headers));
  assert.equal(JSON.parse(sent.opts.body).generationConfig.responseMimeType,'application/json');
});
test('Vertex empty, quota, invalid JSON and network/timeout errors are safe',async()=>{
  for(const [fetcher,expected] of [
    [async()=>({ok:false,status:429}),'resource-exhausted'],[async()=>({ok:false,status:403}),'unavailable'],
    [async()=>({ok:true,json:async()=>{throw Error('body-secret');}}),'data-loss'],
    [async()=>{throw {name:'TimeoutError',message:'token-secret'};},'deadline-exceeded']
  ]){
    const vertex=createVertex({project:'demo-plantometro',googleAuth:{getAccessToken:async()=>'test-only-token'},fetcher});
    await assert.rejects(vertex({prompt:'Care'}),error(expected));
  }
});
