import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
assert(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,'Local emulators required');assert.equal(process.env.GCLOUD_PROJECT,'demo-plantometro');
initializeApp({projectId:'demo-plantometro'});const db=getFirestore(),auth=getAuth();after(()=>db.terminate());
test('Shared activity with real local SDKs and two device profiles',async()=>{
 const tokens={};for(const uid of ['social-owner','social-other','no-activity']){await auth.createUser({uid});tokens[uid]=await auth.createCustomToken(uid);}
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=';
 const plant={id:'bob',name:'Bob',waterFreq:7,lastWater:'2026-01-01',fertFreq:0,history:[{t:'agua',date:'2026-01-01'}],gallery:[{date:'2026-01-01',img:photo,note:'Conservar'}],photo,createdAt:'2026-01-01T12:00:00Z',futureField:'preserved'};
 await db.doc('users/social-owner/plants/bob').set(plant);await db.doc('users/no-activity/plants/bob').set(plant);
 const events=Array.from({length:100},(_,i)=>({id:'fixture-'+i,type:'watered',occurredAt:'2026-01-01T12:00:00Z',author:'Sin apodo antiguo',deviceId:'historical-fixture',plantId:'bob',plantName:'Bob',summary:'la regó'}));
 await db.doc('users/social-owner/plantometroActivity/recent').set({events,updatedAt:FieldValue.serverTimestamp()});
 const r=spawnSync('python',['-u','tests/social_browser.py'],{input:JSON.stringify(tokens),encoding:'utf8',timeout:300000,maxBuffer:1024*1024});process.stdout.write(r.stdout);if(r.status!==0)process.stderr.write(r.stderr);assert.equal(r.status,0);
 const saved=(await db.doc('users/social-owner/plantometroActivity/recent').get()).data();assert(saved.events.length<=80);assert.equal(new Set(saved.events.map(e=>e.id)).size,saved.events.length);assert(saved.events.some(e=>e.type==='deleted'));assert(!Object.keys(saved).some(k=>/read|seen|token/i.test(k)));
 assert.deepEqual((await db.doc('users/no-activity/plants/bob').get()).data(),plant);assert.equal((await db.doc('users/no-activity/plantometroActivity/recent').get()).exists,false);
 console.log('PASS journal: bounded/unique, deletion retained, read state private, rejected batch preserves original garden');
});
