const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const root=require('node:path').resolve(__dirname,'..')+'/';
const options={apiKey:'fixture-public-key',authDomain:'mishoras-bb0cc.firebaseapp.com',projectId:'mishoras-bb0cc',appId:'1:282064047722:web:24a04aabeecb4a67394413',storageBucket:'fixture.invalid',messagingSenderId:'282064047722'};
async function fixture({check=async()=>({token:'synthetic-attestation'}),reply=async()=> '8,25 horas ficticias.',mismatch=null,bridgeMismatch=false,timeout=45000}={}){
 const {createService}=await import(root+'ai-service.js');let sends=0,checks=0,copies=0,signouts=0,loads=0,request;
 const events=[],app={options:{...options}},sourceAuth={app:{options:{...options}},currentUser:null},user={uid:'fixture-user',auth:sourceAuth};sourceAuth.currentUser=user;
 const auth={app,currentUser:null},attestation={app},aiClient={app};
 if(mismatch==='auth')auth.app={};if(mismatch==='appcheck')attestation.app={};if(mismatch==='ai')aiClient.app={};if(mismatch==='config')app.options.appId='different-fixture';
 const sdk=async()=>{loads++;return [{initializeApp:()=>app},{initializeAuth:()=>auth,inMemoryPersistence:{},updateCurrentUser:async(a,u)=>{copies++;a.currentUser=bridgeMismatch?{uid:'other-fixture'}:u;},signOut:async()=>{signouts++;auth.currentUser=null;}},{ReCaptchaEnterpriseProvider:class{},initializeAppCheck:()=>attestation,getToken:async(a,force)=>{assert.equal(a,attestation);assert.equal(force,false);checks++;return check();}},{GoogleAIBackend:class{},getAI:(a,options)=>{assert.equal(a,app);assert.equal(options.useLimitedUseAppCheckTokens,true);return aiClient;},getGenerativeModel:a=>{assert.equal(a,aiClient);return {generateContent:async p=>{request=p;sends++;return {response:{text:()=> reply()}};}};}}];};
 // Return synchronous response text, just like the official model response.
 let output;const wrappedSDK=async()=>{const modules=await sdk(),model=modules[3].getGenerativeModel;modules[3].getGenerativeModel=a=>{const client=model(a);return {generateContent:async p=>{await client.generateContent(p);output=await reply();return {response:{text:()=>output}};}};};return modules;};
 const service=createService(wrappedSDK,{timeout,enabled:true}),input={mode:'chat',question:'Consulta ficticia fija',context:{fictitious:true,calculated:{recordedHours:8.25}},options,user,session:'one',currentSession:()=> 'one',onStage:(stage,state)=>events.push([stage,state])};
 return {service,input,sourceAuth,user,events,get sends(){return sends;},get checks(){return checks;},get copies(){return copies;},get signouts(){return signouts;},get loads(){return loads;},get request(){return request;}};
}
test('session availability, matching Firebase instances, App Check and AI Logic have separate successful events',async()=>{
 const h=await fixture();assert.equal(await h.service.query(h.input),'8,25 horas ficticias.');
 for(const stage of ['session','instances','appcheck','auth','model'])assert(h.events.some(([s,state])=>s===stage&&state==='ok'));
 assert(h.events.findIndex(([s])=>s==='session')<h.events.findIndex(([s])=>s==='appcheck'));
 assert.equal(h.checks,1);assert.equal(h.sends,1);assert.equal(h.copies,1);
 assert(h.request.contents[0].parts[0].text.includes('"recordedHours":8.25'));assert(!JSON.stringify(h.request).includes(h.user.uid));
});
test('missing session and wrong source configuration stop before SDK initialization',async()=>{
 const h=await fixture();await assert.rejects(h.service.query({...h.input,user:null}),e=>e.stage==='session'&&e.code==='probe/no-session');assert.equal(h.loads,0);
 h.sourceAuth.app.options.projectId='different-fixture';await assert.rejects(h.service.query(h.input),e=>e.stage==='session'&&e.code==='probe/source-config-mismatch');assert.equal(h.loads,0);
});
test('every mismatched instance or destination configuration stops before attestation/model',async()=>{
 for(const mismatch of ['auth','appcheck','ai','config']){const h=await fixture({mismatch});await assert.rejects(h.service.query(h.input),e=>e.stage==='instances'&&e.kind==='configuration');assert.equal(h.checks,0);assert.equal(h.sends,0);}
});
test('attestation HTTP error preserves specific code/status and stops before user copy or AI request',async()=>{
 const h=await fixture({check:async()=>{throw {code:'appCheck/fetch-status-error',message:'Person Fictitious: token PRIVATE_FIXTURE',customData:{httpStatus:403,token:'PRIVATE_FIXTURE'}};}});
 await assert.rejects(h.service.query(h.input),e=>{assert.equal(e.stage,'appcheck');assert.equal(e.code,'appCheck/fetch-status-error');assert.equal(e.status,403);assert(e.message.includes('intercambio de atestación'));assert(!JSON.stringify(e).includes('PRIVATE'));return true;});assert.equal(h.checks,1);assert.equal(h.sends,0);assert.equal(h.copies,0);
});
test('missing or error attestation result never reaches AI Logic',async()=>{
 for(const result of [{},{token:''},{token:123},{token:'dummy',error:{code:'appCheck/recaptcha-error'}}]){const h=await fixture({check:async()=>result});await assert.rejects(h.service.query(h.input),e=>e.stage==='appcheck'&&e.kind==='permission');assert.equal(h.sends,0);}
});
test('Auth bridge failure is distinct from attestation and model failures',async()=>{
 const h=await fixture({bridgeMismatch:true});await assert.rejects(h.service.query(h.input),e=>e.stage==='auth'&&e.code==='probe/auth-bridge-mismatch');assert.equal(h.checks,1);assert.equal(h.sends,0);
});
test('real-world 401 App Check backend message remains distinguishable after successful preflight',async()=>{
 const h=await fixture({reply:async()=>{throw {code:'fetch-error',message:'Error fetching https://example.invalid/?key=PRIVATE_FIXTURE: [401] Firebase App Check token is invalid. email=person@example.invalid uid=fixture-user',customErrorData:{status:401,token:'PRIVATE_FIXTURE'}};}});
 await assert.rejects(h.service.query(h.input),e=>{assert.equal(e.stage,'model');assert.equal(e.code,'fetch-error');assert.equal(e.status,401);assert.equal(e.message,'La atestación de Firebase App Check no es válida.');assert(!JSON.stringify(e).includes('PRIVATE'));assert(!JSON.stringify(e).includes('example.invalid'));assert(!JSON.stringify(e).includes('fixture-user'));return true;});assert.equal(h.sends,1);
});
test('401 Firebase Auth message and 403 service-disabled reasons have distinct safe diagnostics',async()=>{
 const {classify}=await import(root+'ai-service.js');const auth=classify({code:'fetch-error',message:'Firebase Auth token is invalid.',customErrorData:{status:401}});assert.equal(auth.kind,'unauthenticated');assert.equal(auth.message,'La sesión de Firebase no es válida.');
 const api=classify({code:'api-not-enabled',message:'SERVICE_DISABLED project PRIVATE_FIXTURE',customErrorData:{status:403,errorDetails:[{reason:'SERVICE_DISABLED',metadata:{name:'PRIVATE_FIXTURE'}},{reason:'PRIVATE_FIXTURE'}]}});assert.equal(api.kind,'configuration');assert.deepEqual(api.reasons,['SERVICE_DISABLED']);assert(!JSON.stringify(api).includes('PRIVATE'));
});
test('unrecognized text, JWT-like codes, arbitrary error kind and metadata are never echoed',async()=>{
 const {classify}=await import(root+'ai-service.js');const result=classify({kind:'PRIVATE_FIXTURE',code:'eyJhbGci.fixture.signature',message:'Name Person Fictitious PRIVATE_FIXTURE email person@example.invalid account 1234567890 <script>alert(1)</script>',customData:{httpStatus:403,errorDetails:[{reason:'PRIVATE_FIXTURE',metadata:{token:'PRIVATE_FIXTURE'}}]}});assert.equal(result.code,'sdk-error');assert.deepEqual(result.reasons,[]);assert(result.message.includes('se omite'));for(const value of ['PRIVATE','person@example','1234567890','<script>'])assert(!JSON.stringify(result).includes(value));
});
test('model URL in SDK prefix does not turn an unrelated missing-user error into a model diagnosis',async()=>{
 const {classify}=await import(root+'ai-service.js');const e=classify({code:'fetch-error',message:'Error fetching from https://example.invalid/models/fixture-model: [403 Forbidden] user not found PRIVATE_FIXTURE',customErrorData:{status:403}});assert(e.message.includes('no reconocida'));assert(!e.message.includes('modelo solicitado'));
});
test('recognized restriction/model/quota messages retain their technical cause without original payload',async()=>{
 const {classify}=await import(root+'ai-service.js');for(const [message,want] of [['Your project has been denied access. UID PRIVATE_FIXTURE','Google ha denegado el acceso al proyecto.'],['API_KEY_HTTP_REFERRER_BLOCKED PRIVATE_FIXTURE','restricción de dominio'],['model PRIVATE_FIXTURE not found','modelo solicitado'],['quota exceeded PRIVATE_FIXTURE','límite de cuota']]){const e=classify({code:'fetch-error',message,customErrorData:{status:403}});assert(e.message.includes(want));assert(!e.message.includes('PRIVATE'));}
});
test('pending attestation locks duplicate sends and session change discards it',async()=>{
 let release;const h=await fixture({check:()=>new Promise(r=>release=r)});const pending=h.service.query(h.input);await new Promise(r=>setImmediate(r));await assert.rejects(h.service.query(h.input),e=>e.kind==='busy');h.service.invalidate();release({token:'synthetic'});await assert.rejects(pending,e=>e.kind==='cancelled');assert.equal(h.sends,0);assert.equal(h.sourceAuth.currentUser,h.user);
});
test('attestation timeout bounds work and retains lock until SDK finishes',async()=>{
 let release;const h=await fixture({check:()=>new Promise(r=>release=r),timeout:10});await assert.rejects(h.service.query(h.input),e=>e.kind==='timeout'&&e.stage==='appcheck');await assert.rejects(h.service.query(h.input),e=>e.kind==='busy');release({token:'synthetic'});await new Promise(r=>setImmediate(r));assert.equal(h.sends,0);
});

test('classifying an already sanitized UI error retains HTTP status and allowlisted reasons',async()=>{const {classify}=await import(root+'ai-service.js');const first=classify({code:'fetch-error',message:'Firebase App Check token is invalid. PRIVATE_FIXTURE',customErrorData:{status:401,errorDetails:[{reason:'APP_CHECK_TOKEN_INVALID'}]}});assert.deepEqual(classify(first),first);assert(!JSON.stringify(classify({...first,reasons:['PRIVATE_FIXTURE']})).includes('PRIVATE'));});


test('first rejected exchange survives SDK throttle without exposing body, key or token',async()=>{
 const {observeAppCheck}=await import(root+'app-check-diagnostic.js');let next=new Response(JSON.stringify({error:{message:'App not registered PRIVATE_FIXTURE',status:'INVALID_ARGUMENT',details:[{metadata:{token:'PRIVATE_FIXTURE'}}]},token:'PRIVATE_FIXTURE'}),{status:400});
 const transport={fetch:async()=>next},original=observeAppCheck(options,transport),url=`https://firebaseappcheck.googleapis.com/v1/projects/${options.projectId}/apps/${options.appId}:exchangeRecaptchaEnterpriseToken?key=PRIVATE_FIXTURE`;
 const response=await transport.fetch(url,{body:'PRIVATE_FIXTURE',headers:{secret:'PRIVATE_FIXTURE'}});assert.equal(response.status,400);assert.equal(original().cause,'app-not-registered');assert.equal(original().backendStatus,'INVALID_ARGUMENT');
 next=new Response('later',{status:429});await transport.fetch(url);assert.equal(original().status,400);
 const {classify}=await import(root+'ai-service.js');const diagnostic=classify({code:'appCheck/initial-throttle',customData:{httpStatus:400},original:original()});assert.deepEqual(classify(diagnostic),diagnostic);assert(!JSON.stringify(diagnostic).includes('PRIVATE'));assert.equal(await response.text(),JSON.stringify({error:{message:'App not registered PRIVATE_FIXTURE',status:'INVALID_ARGUMENT',details:[{metadata:{token:'PRIVATE_FIXTURE'}}]},token:'PRIVATE_FIXTURE'}));
});
test('observer never reads success bodies or other applications and keeps one wrapper',async()=>{
 const {observeAppCheck}=await import(root+'app-check-diagnostic.js');let reads=0,status=200;
 const transport={fetch:async()=>({status,clone(){reads++;throw Error('not to read');}})},first=observeAppCheck(options,transport),wrapped=transport.fetch;
 const second=observeAppCheck(options,transport);assert.equal(transport.fetch,wrapped);
 const path=`https://firebaseappcheck.googleapis.com/v1/projects/${options.projectId}/apps/${options.appId}:exchangeRecaptchaEnterpriseToken`;
 await transport.fetch(path);status=400;await transport.fetch(path.replace(options.appId,'different-app'));await transport.fetch(path.replace('firebaseappcheck.googleapis.com','different.invalid'));
 assert.equal(reads,0);assert.equal(first(),null);assert.equal(second(),null);
});
test('unknown or oversized rejection keeps HTTP status but never echoes arbitrary data',async()=>{
 const {describeRejection,observeAppCheck,safeOriginal}=await import(root+'app-check-diagnostic.js');
 for(const body of [null,{error:{message:'PRIVATE_FIXTURE',status:'PRIVATE_FIXTURE',details:[{reason:'PRIVATE_FIXTURE'}]}}]){const d=describeRejection(400,body);assert.equal(d.cause,'exchange-rejected');assert(!JSON.stringify(d).includes('PRIVATE'));}
 assert.equal(safeOriginal({status:200}),null);assert(!JSON.stringify(safeOriginal({status:400,cause:'PRIVATE_FIXTURE',message:'PRIVATE_FIXTURE',token:'PRIVATE_FIXTURE'})).includes('PRIVATE'));
 const transport={fetch:async()=>new Response(JSON.stringify({error:{message:'x'.repeat(17000)}}),{status:400})},first=observeAppCheck(options,transport);
 await transport.fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${options.projectId}/apps/${options.appId}:exchangeRecaptchaEnterpriseToken`);assert.equal(first().status,400);assert.equal(first().cause,'exchange-rejected');
});
test('safe rejection categories distinguish registration, site key, domain and attestation',async()=>{
 const {describeRejection}=await import(root+'app-check-diagnostic.js');for(const [message,cause] of [['App not registered','app-not-registered'],['site key does not match','site-key-mismatch'],['domain not authorized','domain-rejected'],['invalid appId','invalid-app'],['App attestation failed','attestation-rejected'],['SERVICE_DISABLED','service-disabled']])assert.equal(describeRejection(400,{error:{message}}).cause,cause);
});
test('paused service and fixed-only diagnostic reject before loading SDK or sending data',async()=>{
 const {createService,diagnosticQuestion}=await import(root+'ai-service.js');let loads=0;const load=async()=>{loads++;throw Error('not to load');},h=await fixture();
 const paused=createService(load);await assert.rejects(paused.query(h.input),e=>e.code==='probe/ai-paused');
 const probe=createService(load,{enabled:true,diagnosticOnly:true});for(const input of [h.input,{...h.input,question:diagnosticQuestion,context:{recordedHours:8.25}},{...h.input,question:diagnosticQuestion,mode:'payroll',text:'PRIVATE_FIXTURE'}])await assert.rejects(probe.query(input),e=>e.code==='probe/diagnostic-only');assert.equal(loads,0);
});
