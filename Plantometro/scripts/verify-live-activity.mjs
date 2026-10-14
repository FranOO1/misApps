/** Run in Cloud Shell with a separately authorized TEST Google account.
 * Uses client Auth/Firestore APIs and published rules, never Admin writes.
 * No credentials are printed, stored, exported or committed.
 */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sync=readFileSync(fileURLToPath(new URL('../js/sync.js',import.meta.url)),'utf8');
const apiKey=/apiKey:\s*"([^"]+)"/.exec(sync)?.[1];
const projectId=/projectId:\s*"([^"]+)"/.exec(sync)?.[1];
const email=process.argv[2]?.trim().toLowerCase();
if(projectId!=='mishoras-bb0cc'||!apiKey||!email||!/^\S+@\S+\.\S+$/.test(email)){
 console.error('Uso: node scripts/verify-live-activity.mjs CORREO_GOOGLE_DE_PRUEBA');process.exit(1);
}
const toField=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(toField)}}:typeof v==='object'?{mapValue:{fields:toFields(v)}}:typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{stringValue:v};
const toFields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,toField(v)]));
const fromField=v=>'arrayValue'in v?(v.arrayValue.values||[]).map(fromField):'mapValue'in v?fromFields(v.mapValue.fields||{}):'integerValue'in v?Number(v.integerValue):'booleanValue'in v?v.booleanValue:'nullValue'in v?null:v.stringValue??v.timestampValue;
const fromFields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,fromField(v)]));
const ensure=(condition,label)=>{if(!condition)throw Error(label);};
let uid,idToken,plantPath,journalPath,initial=null,haveBaseline=false,touched=false,created=false;
const result={project:projectId,method:'Google test OAuth + real client Auth/Firestore REST; published rules',checks:[]};
async function authPost(action,data){
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
 const body=await r.json();if(!r.ok)throw Error('Auth rechazó '+action+' (HTTP '+r.status+'). No se realizó ninguna escritura de jardín.');return body;
}
const root='projects/'+projectId+'/databases/(default)/documents/';
async function request(path,options={}){
 const r=await fetch('https://firestore.googleapis.com/v1/'+path,{...options,headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
 let body={};try{body=await r.json();}catch{}return {status:r.status,body};
}
const plantWrite=p=>({update:{name:root+plantPath,fields:toFields(p)}});
const journalWrite=events=>({update:{name:root+journalPath,fields:toFields({events})},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]});
async function commit(writes){return request('projects/'+projectId+'/databases/(default)/documents:commit',{method:'POST',body:JSON.stringify({writes})});}
const get=path=>request(root+path);
try{
 // Explicit --account avoids borrowing the administrator's or personal account.
 let googleToken;try{googleToken=execFileSync('gcloud',['auth','print-access-token','--account='+email,'--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('La cuenta Google de prueba no está autorizada en gcloud. Ejecuta gcloud auth login '+email+' y usa esa cuenta de prueba.');}
 const signed=await authPost('signInWithIdp',{postBody:'access_token='+encodeURIComponent(googleToken)+'&providerId=google.com',requestUri:'https://franoo1.github.io',returnSecureToken:true,returnIdpCredential:false});googleToken='';
 ensure(signed.email?.toLowerCase()===email&&signed.providerId==='google.com','La identidad no coincide con la cuenta Google de prueba.');
 uid=signed.localId;idToken=signed.idToken;ensure(uid&&idToken,'No se obtuvo una sesión de prueba.');
 result.checks.push('Google test account authenticated');
 const id='verification-'+randomUUID();plantPath='users/'+uid+'/plants/'+id;journalPath='users/'+uid+'/plantometroActivity/recent';
 const before=await get(journalPath);ensure([200,404].includes(before.status),'No se puede leer el diario de la cuenta de prueba (HTTP '+before.status+').');
 initial=before.status===200?fromFields(before.body.fields||{}):{events:[]};
 ensure(Array.isArray(initial.events)&&initial.events.length===0,'Esta cuenta tiene actividad: no se usa un jardín existente para pruebas. Elige otra cuenta Google de prueba.');
 // Read only the test account; ensure it is empty before writing any fixture.
 const garden=await request(root+'users/'+uid+'/plants?pageSize=1');ensure(garden.status===200,'No se puede comprobar el jardín de prueba.');ensure(!garden.body.documents?.length,'Esta cuenta tiene plantas: no se usa ese jardín para pruebas.');haveBaseline=true;
 const other='plantometro-rule-verification-'+randomUUID();ensure((await get('users/'+other+'/plantometroActivity/recent')).status===403,'La regla permite acceso a otro UID: detener la publicación.');result.checks.push('Other UID activity access denied');
 const p={id,name:'Planta temporal de comprobación',waterFreq:7,fertFreq:0,lastWater:'',history:[],gallery:[],createdAt:new Date().toISOString()};
 const event=(type,author)=>({id:randomUUID(),type,author,deviceId:'verification-'+author,plantId:id,plantName:p.name,occurredAt:new Date().toISOString(),summary:type==='watered'?'la regó':type==='corrected'?'corrigió un riego':'añadió la planta'});
 const added=event('created','Frank');let events=[added];
 touched=true;created=true;const first=await commit([plantWrite(p),journalWrite(events)]);ensure(first.status===200,'Alta y actividad rechazadas (HTTP '+first.status+').');created=true;touched=true;result.checks.push('Atomic plant + activity creation accepted');
 const watered=event('watered','Rosita');events.push(watered);p.lastWater=new Date().toISOString().slice(0,10);p.history=[{t:'agua',date:p.lastWater,at:watered.occurredAt,by:'Rosita',eventId:watered.id}];p.lastActivity=watered;
 ensure((await commit([plantWrite(p),journalWrite(events)])).status===200,'Riego y actividad rechazados.');
 const readA=await get(journalPath),readB=await get(journalPath);ensure(readA.status===200&&readB.status===200,'No se sincroniza la lectura.');const saved=fromFields(readB.body.fields||{});
 ensure(JSON.stringify(fromFields(readA.body.fields||{}).events)===JSON.stringify(saved.events)&&saved.events.length===2&&saved.events[1].author==='Rosita','Dos lecturas no coinciden con el autor y riego esperado.');result.checks.push('Confirmed Rosita watering visible in independent reads');
 const correction=event('corrected','Frank');events.push(correction);p.lastWater='';p.history=[];p.lastActivity=correction;
 ensure((await commit([plantWrite(p),journalWrite(events)])).status===200,'Corrección rechazada.');const corrected=await get(plantPath);ensure(corrected.status===200&&fromFields(corrected.body.fields||{}).history.length===0,'La corrección no conserva un historial coherente.');result.checks.push('Frank correction atomically restores test history');
 const denied=await commit([plantWrite({...p,name:'Este cambio debe rechazarse'}),journalWrite(Array(121).fill(added))]);ensure(denied.status===403,'Más de 120 eventos no se rechazaron: revisar reglas publicadas.');const unchanged=await get(plantPath);ensure(fromFields(unchanged.body.fields||{}).name===p.name,'La operación denegada guardó parte del cambio.');result.checks.push('Oversized journal rejected; atomic batch left plant unchanged');
 const noTimestamp=await commit([{update:{name:root+journalPath,fields:toFields({events})}}]);ensure(noTimestamp.status===403,'updatedAt sin timestamp de servidor no se rechazó: revisar reglas publicadas.');result.checks.push('Missing request-time timestamp rejected');
 result.status='PASS';
}catch(error){result.status='BLOCKED';result.reason=error.message;}
finally{
 if(idToken&&haveBaseline&&(touched||created)){
  // The rule forbids deleting the journal. Restore an empty test journal instead.
  let cleanup;try{cleanup=await commit([...(created?[{delete:root+plantPath}]:[]),journalWrite(initial.events)]);}catch{cleanup={status:'sin conexión'};}
  result.cleanup=cleanup.status===200?'Temporary plant removed; test journal restored empty':'Cleanup failed (HTTP '+cleanup.status+'); remove ONLY the verification plant in this test account';
  if(cleanup.status!==200)result.status='BLOCKED';
 }
 idToken='';console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;
}
