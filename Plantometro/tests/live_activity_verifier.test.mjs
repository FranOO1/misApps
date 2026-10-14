import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
// Only synthetic credentials and a fully intercepted fetch. No real service call.
function run(scenario){
 const dir=mkdtempSync(join(tmpdir(),'plantometro-verifier-'));
 try{
  writeFileSync(join(dir,'gcloud'),'#!/bin/sh\nprintf "%s" "synthetic-google-token"\n',{mode:0o700});
  writeFileSync(join(dir,'http.mjs'),`
   const scenario=${JSON.stringify(scenario)},documents=new Map();let writes=0;
   const reply=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
   globalThis.fetch=async(url,opts={})=>{
    const u=new URL(url);
    if(u.hostname==='identitytoolkit.googleapis.com')return reply(200,{email:scenario==='wrong-identity'?'wrong@example.invalid':'test@example.invalid',providerId:'google.com',localId:'test-uid',idToken:'synthetic-firebase-token'});
    if(u.hostname!=='firestore.googleapis.com')throw Error('Unexpected service');
    if(scenario==='wrong-identity')throw Error('Wrong identity must not access Firestore');
    if(!opts.headers.Authorization.includes('synthetic-firebase-token'))throw Error('Missing client auth');
    if(u.pathname.endsWith(':commit')){
      const batch=JSON.parse(opts.body).writes;const journal=batch.find(w=>w.update?.name.endsWith('/plantometroActivity/recent'));
      if(journal){const events=journal.update.fields.events.arrayValue.values;
       if(events.length>120&&scenario!=='broad-rule')return reply(403,{});
       if(!journal.updateTransforms)return reply(403,{});
      }
      for(const w of batch){writes++;if(w.delete)documents.delete(w.delete);else documents.set(w.update.name,{name:w.update.name,fields:{...w.update.fields,...(w.updateTransforms?{updatedAt:{timestampValue:'2026-10-04T12:00:00Z'}}:{})}});}
      return reply(200,{});
    }
    if(u.searchParams.has('pageSize'))return reply(200,{documents:scenario==='nonempty-garden'?[{name:'existing-test-plant'}]:[]});
    if(!u.pathname.includes('/users/test-uid/'))return reply(403,{});
    const key=u.pathname.replace('/v1/','');return documents.has(key)?reply(200,documents.get(key)):reply(404,{});
   };
   process.on('exit',()=>{
    if(scenario==='wrong-identity'||scenario==='nonempty-garden'){if(writes)process.exitCode=4;}
    else{if([...documents.keys()].some(k=>k.includes('/plants/')))process.exitCode=5;const journal=[...documents.values()][0];if(journal?.fields.events.arrayValue.values.length)process.exitCode=6;}
   });
  `);
  const run=spawnSync(process.execPath,['--import',join(dir,'http.mjs'),'scripts/verify-live-activity.mjs','test@example.invalid'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH},timeout:10000});
  assert(!run.stdout.includes('synthetic-google-token'));assert(!run.stdout.includes('synthetic-firebase-token'));
  return {code:run.status,body:JSON.parse(run.stdout)};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('Live-verifier harness validates published-rule contract and cleans its fixture',()=>{const r=run('valid');assert.equal(r.code,0);assert.equal(r.body.status,'PASS');assert.equal(r.body.checks.length,7);assert.match(r.body.cleanup,/removed/);});
test('An overly permissive rule blocks publication and still cleans test records',()=>{const r=run('broad-rule');assert.equal(r.code,1);assert.equal(r.body.status,'BLOCKED');assert.match(r.body.reason,/120/);assert.match(r.body.cleanup,/removed/);});
test('Nonempty test garden is never modified',()=>{const r=run('nonempty-garden');assert.equal(r.code,1);assert.match(r.body.reason,/tiene plantas/);assert(!r.body.cleanup);});
test('Wrong Google identity cannot read or write Firestore',()=>{const r=run('wrong-identity');assert.equal(r.code,1);assert.match(r.body.reason,/identidad/);assert(!r.body.cleanup);});
