// Execute the actual worker's handlers. CacheStorage, lifecycle and fetch are
// adapters: this does not establish real browser/PWA installation or updating.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..'),scope='https://fixture.invalid/controlHoras/';
function worker(){
 const handlers={},stores=new Map(),requests=[];let network=async()=>new Response('fixture',{headers:{'content-type':'application/javascript'}}),skips=0,claims=0;
 const normalize=req=>new URL(typeof req==='string'||req instanceof URL?req:req.url,scope).href;
 const cache=name=>{if(!stores.has(name))stores.set(name,new Map());const items=stores.get(name);return {
  match:async req=>items.get(normalize(req))?.clone(),put:async(req,res)=>items.set(normalize(req),res.clone()),keys:async()=>[...items.keys()].map(url=>new Request(url)),
  addAll:async reqs=>{for(const req of reqs){requests.push(req);const file=root+'/'+new URL(req.url).pathname.split('/').at(-1);items.set(req.url,new Response(fs.readFileSync(file)));}}
 };};
 const ctx=vm.createContext({URL,Request,Response,Promise,AbortController,setTimeout,clearTimeout,self:{registration:{scope},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{skips++;},clients:{claim:async()=>{claims++;}}},caches:{open:async n=>cache(n),keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n)},fetch:(...args)=>network(...args)});
 vm.runInContext(fs.readFileSync(root+'/sw.js','utf8'),ctx);const name=vm.runInContext('CACHE',ctx);
 const lifecycle=async type=>{let work;handlers[type]({waitUntil:p=>work=p});await work;};
 const request=(url,{navigate=false,method='GET'}={})=>{const req=new Request(new URL(url,scope),{method});if(navigate)Object.defineProperty(req,'mode',{value:'navigate'});return req;};
 const fetch=async(req)=>{let result,extra=[];handlers.fetch({request:req,respondWith:p=>result=p,waitUntil:p=>extra.push(p)});const response=await result;await Promise.all(extra);return response;};
 return {stores,requests,name,lifecycle,request,fetch,cache:()=>cache(name),get skips(){return skips;},get claims(){return claims;},set network(fn){network=fn;}};
}
test('install includes existing complete local shell, forces fresh resources and preserves unrelated caches',async()=>{
 const w=worker();w.stores.set('plantometro-v19',new Map());w.stores.set('horas-v3-previous',new Map());await w.lifecycle('install');
 assert(w.requests.some(r=>r.url.endsWith('/core.js')));assert(w.requests.some(r=>r.url.endsWith('/sync.js')));assert(w.requests.some(r=>r.url.endsWith('/ai-service.js')));assert(w.requests.some(r=>r.url.endsWith('/app-check-diagnostic.js')));assert(w.requests.every(r=>r.cache==='reload'));assert.equal(w.skips,1);
 await w.lifecycle('activate');assert.equal(w.claims,1);assert(w.stores.has('plantometro-v19'));assert(w.stores.has(w.name));assert(!w.stores.has('horas-v3-previous'));
});
test('offline uses cached scripts, navigation alone can fall back to the HTML shell, and missing resources fail',async()=>{
 const w=worker();await w.lifecycle('install');w.network=async()=>{throw Error('Offline');};
 const script=await w.fetch(w.request('./core.js'));assert((await script.text()).includes('Shared deterministic'));
 const page=await w.fetch(w.request('./unknown-path',{navigate:true}));assert(/<!doctype html>/i.test(await page.text()));
 for(const file of ['./missing.js','./missing.mjs','./missing.css','./missing.json'])assert.equal((await w.fetch(w.request(file))).type,'error');
});
test('an HTML response cannot replace or poison a cached JavaScript resource',async()=>{
 const w=worker();await w.lifecycle('install');const cached=await (await w.cache().match(w.request('./core.js'))).text();w.network=async()=>new Response('<html>Login/error page</html>',{headers:{'content-type':'text/html'}});
 assert.equal(await (await w.fetch(w.request('./core.js'))).text(),cached);assert.equal(await (await w.cache().match(w.request('./core.js'))).text(),cached);assert.equal((await w.fetch(w.request('./missing.js'))).type,'error');
});
test('production Auth, Firestore, App Check and AI requests and other apps never enter this worker cache',async()=>{
 const w=worker();let called=0;w.network=async()=>{called++;return new Response('private');};
 for(const req of [w.request('https://firestore.googleapis.com/v1/projects/fixture'),w.request('https://firebaseappcheck.googleapis.com/v1/projects/fixture'),w.request('https://firebasevertexai.googleapis.com/v1beta/fixture'),w.request('https://identitytoolkit.googleapis.com/v1/accounts:lookup'),w.request('https://fixture.invalid/Plantometro/index.html'),w.request('./index.html',{method:'POST'})])assert.equal(await w.fetch(req),undefined);
 assert.equal(called,0);assert.equal(w.stores.size,0);
});
test('approved SDK dependencies are cached for offline reuse without HTML substitutes',async()=>{
 const w=worker(),req=w.request('https://www.gstatic.com/firebasejs/12.14.0/firebase-ai.js');w.network=async()=>new Response('SDK fixture',{headers:{'content-type':'application/javascript'}});assert.equal(await (await w.fetch(req)).text(),'SDK fixture');w.network=async()=>{throw Error('Offline');};assert.equal(await (await w.fetch(req)).text(),'SDK fixture');
 assert.equal((await w.fetch(w.request('https://www.gstatic.com/firebasejs/12.14.0/missing.js'))).type,'error');
});
test('a CDN outage still installs the local shell and preserves compatible SDKs from the previous cache only',async()=>{
 const w=worker(),sdk='https://www.gstatic.com/firebasejs/12.14.0/firebase-auth-compat.js';w.network=async()=>{throw Error('CDN unavailable');};
 w.stores.set('horas-v3-previous',new Map([[sdk,new Response('Previous compatible SDK',{headers:{'content-type':'application/javascript'}})],[scope+'index.html',new Response('OLD shell')],['https://firestore.googleapis.com/private',new Response('PRIVATE response')]]));
 await w.lifecycle('install');assert.equal(w.skips,1);await w.lifecycle('activate');assert.equal(await (await w.cache().match(sdk)).text(),'Previous compatible SDK');assert.notEqual(await (await w.cache().match(scope+'index.html')).text(),'OLD shell');assert.equal(await w.cache().match('https://firestore.googleapis.com/private'),undefined);assert(!w.stores.has('horas-v3-previous'));
});

