const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const root=require('node:path').resolve(__dirname,'..')+'/';
const options={apiKey:'fixture-public-key',authDomain:'mishoras-bb0cc.firebaseapp.com',projectId:'mishoras-bb0cc',appId:'1:282064047722:web:24a04aabeecb4a67394413',storageBucket:'fixture.invalid',messagingSenderId:'282064047722'};
async function fixture({check=async()=>({token:'synthetic-attestation'}),reply=async()=> '8,25 horas ficticias.',mismatch=null,bridgeMismatch=false,timeout=45000}={}){
 const {createService}=await import(root+'ai-service.js');let sends=0,checks=0,copies=0,signouts=0,loads=0,request;
 const events=[],app={options:{...options}},sourceAuth={app:{options:{...options}},currentUser:null},user={uid:'fixture-user',auth:sourceAuth};sourceAuth.currentUser=user;
 const auth={app,currentUser:null},attestation={app},aiClient={app};
 if(mismatch==='auth')auth.app={};if(mismatch==='appcheck')attestation.app={};if(mismatch==='ai')aiClient.app={};if(mismatch==='config')app.options.appId='different-fixture';
 const sdk=async()=>{loads++;return [{initializeApp:()=>app},{initializeAuth:()=>auth,inMemoryPersistence:{},updateCurrentUser:async(a,u)=>{copies++;a.currentUser=bridgeMismatch?{uid:'other-fixture'}:u;},signOut:async()=>{signouts++;auth.currentUser=null;}},{ReCaptchaEnterpriseProvider:class{},initializeAppCheck:()=>attestation,getToken:async(a,force)=>{assert.equal(a,attestation);assert.equal(force,false);checks++;return check();}},{GoogleAIBackend:class{},getAI:a=>{assert.equal(a,app);return aiClient;},getGenerativeModel:a=>{assert.equal(a,aiClient);return {generateContent:async p=>{request=p;sends++;return {response:{text:()=> reply()}};}};}}];};
 // Return synchronous response text, just like the official model response.
 let output;const wrappedSDK=async()=>{const modules=await sdk(),model=modules[3].getGenerativeModel;modules[3].getGenerativeModel=a=>{const client=model(a);return {generateContent:async p=>{await client.generateContent(p);output=await reply();return {response:{text:()=>output}};}};};return modules;};
 const service=createService(wrappedSDK,{timeout}),input={mode:'chat',question:'Consulta ficticia fija',context:{fictitious:true,calculated:{recordedHours:8.25}},options,user,session:'one',currentSession:()=> 'one',onStage:(stage,state)=>events.push([stage,state])};
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
 await assert.rejects(h.service.query(h.input),e=>{assert.equal(e.stage,'appcheck');assert.equal(e.code,'appCheck/fetch-status-error');assert.equal(e.status,403);assert(e.message.includes('attestation exchange'));assert(!JSON.stringify(e).includes('PRIVATE'));return true;});assert.equal(h.checks,1);assert.equal(h.sends,0);assert.equal(h.copies,0);
});
test('missing or error attestation result never reaches AI Logic',async()=>{
 for(const result of [{},{token:''},{token:123},{token:'dummy',error:{code:'appCheck/recaptcha-error'}}]){const h=await fixture({check:async()=>result});await assert.rejects(h.service.query(h.input),e=>e.stage==='appcheck'&&e.kind==='permission');assert.equal(h.sends,0);}
});
test('Auth bridge failure is distinct from attestation and model failures',async()=>{
 const h=await fixture({bridgeMismatch:true});await assert.rejects(h.service.query(h.input),e=>e.stage==='auth'&&e.code==='probe/auth-bridge-mismatch');assert.equal(h.checks,1);assert.equal(h.sends,0);
});
test('real-world 401 App Check backend message remains distinguishable after successful preflight',async()=>{
 const h=await fixture({reply:async()=>{throw {code:'fetch-error',message:'Error fetching https://example.invalid/?key=PRIVATE_FIXTURE: [401] Firebase App Check token is invalid. email=person@example.invalid uid=fixture-user',customErrorData:{status:401,token:'PRIVATE_FIXTURE'}};}});
 await assert.rejects(h.service.query(h.input),e=>{assert.equal(e.stage,'model');assert.equal(e.code,'fetch-error');assert.equal(e.status,401);assert.equal(e.message,'Firebase App Check token is invalid.');assert(!JSON.stringify(e).includes('PRIVATE'));assert(!JSON.stringify(e).includes('example.invalid'));assert(!JSON.stringify(e).includes('fixture-user'));return true;});assert.equal(h.sends,1);
});
test('401 Firebase Auth message and 403 service-disabled reasons have distinct safe diagnostics',async()=>{
 const {classify}=await import(root+'ai-service.js');const auth=classify({code:'fetch-error',message:'Firebase Auth token is invalid.',customErrorData:{status:401}});assert.equal(auth.kind,'unauthenticated');assert.equal(auth.message,'Firebase authentication token is invalid.');
 const api=classify({code:'api-not-enabled',message:'SERVICE_DISABLED project PRIVATE_FIXTURE',customErrorData:{status:403,errorDetails:[{reason:'SERVICE_DISABLED',metadata:{name:'PRIVATE_FIXTURE'}},{reason:'PRIVATE_FIXTURE'}]}});assert.equal(api.kind,'configuration');assert.deepEqual(api.reasons,['SERVICE_DISABLED']);assert(!JSON.stringify(api).includes('PRIVATE'));
});
test('unrecognized text, JWT-like codes, arbitrary error kind and metadata are never echoed',async()=>{
 const {classify}=await import(root+'ai-service.js');const result=classify({kind:'PRIVATE_FIXTURE',code:'eyJhbGci.fixture.signature',message:'Name Person Fictitious PRIVATE_FIXTURE email person@example.invalid account 1234567890 <script>alert(1)</script>',customData:{httpStatus:403,errorDetails:[{reason:'PRIVATE_FIXTURE',metadata:{token:'PRIVATE_FIXTURE'}}]}});assert.equal(result.code,'sdk-error');assert.deepEqual(result.reasons,[]);assert(result.message.includes('se omite'));for(const value of ['PRIVATE','person@example','1234567890','<script>'])assert(!JSON.stringify(result).includes(value));
});
test('model URL in SDK prefix does not turn an unrelated missing-user error into a model diagnosis',async()=>{
 const {classify}=await import(root+'ai-service.js');const e=classify({code:'fetch-error',message:'Error fetching from https://example.invalid/models/fixture-model: [403 Forbidden] user not found PRIVATE_FIXTURE',customErrorData:{status:403}});assert(e.message.includes('no reconocida'));assert(!e.message.includes('requested model'));
});
test('recognized restriction/model/quota messages retain their technical cause without original payload',async()=>{
 const {classify}=await import(root+'ai-service.js');for(const [message,want] of [['Your project has been denied access. UID PRIVATE_FIXTURE','Your project has been denied access. Please contact support.'],['API_KEY_HTTP_REFERRER_BLOCKED PRIVATE_FIXTURE','HTTP referrer'],['model PRIVATE_FIXTURE not found','requested model'],['quota exceeded PRIVATE_FIXTURE','RESOURCE_EXHAUSTED']]){const e=classify({code:'fetch-error',message,customErrorData:{status:403}});assert(e.message.includes(want));assert(!e.message.includes('PRIVATE'));}
});
test('pending attestation locks duplicate sends and session change discards it',async()=>{
 let release;const h=await fixture({check:()=>new Promise(r=>release=r)});const pending=h.service.query(h.input);await new Promise(r=>setImmediate(r));await assert.rejects(h.service.query(h.input),e=>e.kind==='busy');h.service.invalidate();release({token:'synthetic'});await assert.rejects(pending,e=>e.kind==='cancelled');assert.equal(h.sends,0);assert.equal(h.sourceAuth.currentUser,h.user);
});
test('attestation timeout bounds work and retains lock until SDK finishes',async()=>{
 let release;const h=await fixture({check:()=>new Promise(r=>release=r),timeout:10});await assert.rejects(h.service.query(h.input),e=>e.kind==='timeout'&&e.stage==='appcheck');await assert.rejects(h.service.query(h.input),e=>e.kind==='busy');release({token:'synthetic'});await new Promise(r=>setImmediate(r));assert.equal(h.sends,0);
});

test('classifying an already sanitized UI error retains HTTP status and allowlisted reasons',async()=>{const {classify}=await import(root+'ai-service.js');const first=classify({code:'fetch-error',message:'Firebase App Check token is invalid. PRIVATE_FIXTURE',customErrorData:{status:401,errorDetails:[{reason:'APP_CHECK_TOKEN_INVALID'}]}});assert.deepEqual(classify(first),first);assert(!JSON.stringify(classify({...first,reasons:['PRIVATE_FIXTURE']})).includes('PRIVATE'));});
