import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
assert(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,'Local emulators required');assert.equal(process.env.GCLOUD_PROJECT,'demo-plantometro');
initializeApp({projectId:'demo-plantometro'});const db=getFirestore(),auth=getAuth();after(()=>db.terminate());
test('Actual v16→v19 worker with SDKs and disposable emulator account',async()=>{
 await auth.createUser({uid:'pwa-owner'});const token=await auth.createCustomToken('pwa-owner');
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=';
 const fixture={id:'pwa-fixture',name:'Planta de prueba PWA',photo,waterFreq:7,lastWater:'2026-01-01',history:[{t:'agua',date:'2026-01-01',by:'Frank'}],gallery:[{date:'2026-01-01',img:photo,note:'No perder'}],futureField:'keep',createdAt:'2026-01-01T12:00:00Z'};
 await db.doc('users/pwa-owner/plants/pwa-fixture').set(fixture);
 const r=spawnSync('python',['-u','tests/social_pwa.py'],{input:JSON.stringify({token,fixture}),encoding:'utf8',timeout:240000,maxBuffer:1024*1024});process.stdout.write(r.stdout);if(r.status!==0)process.stderr.write(r.stderr);assert.equal(r.status,0);assert.deepEqual((await db.doc('users/pwa-owner/plants/pwa-fixture').get()).data(),fixture);
});
