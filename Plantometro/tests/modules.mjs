// Integration checks using the real ES modules, a small DOM adapter and synthetic services.
// Run: node --experimental-vm-modules Plantometro/tests/modules.mjs
// These checks complement (and do not replace) the Chromium layout/PWA suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const elements=new Map();

class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.value='';this.hidden=false;this.checked=false;this.open=false;this.textContent='';this.innerHTML='';this.classList={items:new Set(),add(...x){x.forEach(v=>this.items.add(v));},remove(...x){x.forEach(v=>this.items.delete(v));},contains(x){return this.items.has(x);},toggle(x,enabled){if(enabled)this.add(x);else this.remove(x);}};}
  set id(v){this._id=v;elements.set(v,this);} get id(){return this._id;}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(){}
  querySelectorAll(){return [];}
  querySelector(){return new Element('button');}
  checkValidity(){return this.type!=='number'||(Number.isFinite(+this.value)&&+this.value>=+this.min&&+this.value<=+this.max);}
  click(){this.onclick?.();} remove(){}
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const el=new Element(m[1]);el.parentElement=new Element('div');el.id=m[3];el.value=/\bvalue="([^"]*)"/.exec(m[2])?.[1]||'';
}
const document={getElementById:id=>{assert(elements.has(id),`Missing DOM id ${id}`);return elements.get(id);},querySelectorAll:()=>[],createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),addEventListener(){},documentElement:new Element('html')};
const originalSettings={name:'Fran',city:'Granada',lat:37.1773,lon:-3.5986,theme:'dark',geminiKey:'migration-test-marker',summerMode:true,customPreference:'keep'};
const storage=new Map([['pg3b_settings',JSON.stringify(originalSettings)]]);
const writes=[];
const existing={id:'old',name:'Mi planta',species:'Monstera',light:'media',waterFreq:7,lastWater:'2020-01-01',loc:'Terraza',gallery:[{date:'2020-01-01',note:'old',img:''}],history:Array.from({length:65},()=>({t:'agua',date:'2020-01-01',by:'Pareja'})),createdAt:'2020-01-01T12:00:00Z',futureField:'preserve'};
const context=vm.createContext({document,window:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},matchMedia:()=>({matches:false,addEventListener(){}}),navigator:{},setTimeout:()=>0,clearTimeout(){},Date,console,URL,Blob,TextEncoder,crypto:webcrypto,confirm:()=>true,fetch:async url=>{
  if(url.includes('open-meteo'))return {json:async()=>({current:{temperature_2m:34,relative_humidity_2m:30,weather_code:61},daily:{precipitation_probability_max:[80,70],precipitation_sum:[4,2]}})};
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({nombreComun:'Monstera',especie:'Monstera deliciosa',revisarCadaDias:5,luz:'media',confianza:'baja',motivo:'Dudosa',consejo:'Comprueba la humedad'})}]}}]})};
}});
const mocks={
 'firebase-app.js': 'export const initializeApp=()=>({});',
 'firebase-auth.js': `export const getAuth=()=>({currentUser:{uid:'test'}});export class GoogleAuthProvider{};export const getRedirectResult=async()=>{};export const onAuthStateChanged=(a,cb)=>cb({uid:'test',displayName:'Test',email:'test@example.invalid'});export const signInWithPopup=async()=>{};export const signInWithRedirect=async()=>{};export const signOut=async()=>{};`,
 'firebase-firestore.js': `export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});export const persistentMultipleTabManager=()=>({});export const collection=(...a)=>a;export const doc=(...a)=>a;export const onSnapshot=(r,cb)=>{cb({docs:[{data:()=>testExisting}]});return ()=>{};};export const writeBatch=()=>({set(){},commit:async()=>{}});export const runTransaction=async(db,cb)=>cb({get:async()=>({exists:()=>true,data:()=>testExisting}),set:(ref,p)=>{Object.assign(testExisting,p);testWrites.push(JSON.parse(JSON.stringify({ref:ref.slice(1),plant:p})));}});export const setDoc=async(r,p)=>testWrites.push(JSON.parse(JSON.stringify({ref:r.slice(1),plant:p})));export const deleteDoc=async()=>{};`
};
context.testExisting=existing;context.testWrites=writes;
const modules=new Map();
function getModule(id){
  if(modules.has(id))return modules.get(id);
  let code=id.startsWith('https:')?mocks[id.split('/').at(-1)]:fs.readFileSync(id,'utf8');
  if(id.endsWith('/ai-service.js'))code=`export const AI_UNAVAILABLE='Ayuda con IA no disponible';export const aiEnabled=()=>true;export const aiStatus=()=> 'IA simulada en pruebas';export const aiErrorMessage=()=> 'No disponible';export const callPlantAI=async()=>({resumen:'Consejo de ejemplo.',consejo:'Comprueba la tierra.',confianza:'baja',motivo:'Dudosa',sugerencias:{nombreComun:'Monstera',especie:'Monstera deliciosa',revisarCadaDias:5,abonoCadaDias:null,luz:'media'}});`;
  assert(code,`Missing module ${id}`);
  const mod=new vm.SourceTextModule(code,{context,identifier:id});modules.set(id,mod);return mod;
}
const app=getModule(path.join(root,'js/app.js'));
await app.link((specifier,parent)=>getModule(specifier.startsWith('https:')?specifier:path.resolve(path.dirname(parent.identifier),specifier)));
await app.evaluate();
const ns=file=>modules.get(path.join(root,'js',file)).namespace;
const ui=ns('ui.js'),plants=ns('plants.js'),sync=ns('sync.js'),settings=ns('settings.js'),weather=ns('weather.js'),gemini=ns('gemini.js');
const el=id=>elements.get(id);
assert.equal(sync.plants.length,1);
const migrated=JSON.parse(storage.get('pg3b_settings')),expectedSettings={...originalSettings};delete expectedSettings.geminiKey;assert.deepEqual(migrated,expectedSettings);assert(!('geminiKey' in settings.settings));
assert(!html.includes('s-gkey'));assert(!html.includes('s-notif-sw'));
assert.equal(plants.plantState(existing).state,'late');
assert.match(el('grid').innerHTML,/Recordatorio del/);
settings.settings.name='Fran';settings.settings.summerMode=true;
assert.equal(plants.effectiveFreq(existing),7);
await weather.loadWeather();
assert.match(weather.weatherContext(existing),/Lluvia prevista/);
assert.equal(weather.weatherContext({...existing,loc:'Salón'}),'');
ui.openDetail('old');assert.equal(el('d-freq').textContent,'Cada 7 días · orientativo');
await plants.water('old');assert.equal(writes.at(-1).plant.history.length,66);assert.equal(writes.at(-1).plant.history[0].by,'Fran');
assert.equal(JSON.stringify(writes.at(-1).plant.gallery),JSON.stringify(existing.gallery));
assert.equal(writes.at(-1).plant.futureField,'preserve');
assert.equal(JSON.stringify(writes.at(-1).ref),JSON.stringify(['users','test','plants','old']));
plants.openForm('old');
assert.equal(el('f-photo-button').textContent,'Añadir foto');
const originalPhoto=plants.formPhoto,beforeCancel=writes.length;
plants.chooseFormPhoto();await plants.pickPhoto({target:{files:[]}});
assert.equal(plants.formPhoto,originalPhoto);assert.equal(writes.length,beforeCancel);
el('f-name').value='Nombre editado';await plants.savePlant({preventDefault(){}});
assert.equal(writes.at(-1).plant.name,'Nombre editado');assert.equal(writes.at(-1).plant.history.length,66);assert.equal(writes.at(-1).plant.futureField,'preserve');
plants.openForm();el('f-name').value='Mi apodo';
await gemini.identifyPlant();assert.equal(el('f-name').value,'Mi apodo');assert.equal(el('f-freq').value,7);
assert.equal(el('f-suggestions').hidden,false);
const buttons=el('f-suggestions').children.filter(c=>c.tagName==='BUTTON');
buttons.at(-1).click();assert.equal(el('f-suggestions').hidden,true);assert.equal(el('f-name').value,'Mi apodo');
await gemini.identifyPlant();el('use-especie').checked=true;el('use-revisarCadaDias').checked=true;el('suggest-revisarCadaDias').value='9';
el('f-suggestions').children.find(c=>c.tagName==='BUTTON').click();
assert.equal(el('f-name').value,'Mi apodo');assert.equal(el('f-freq').value,'9');assert.equal(el('f-species').value,'Monstera deliciosa');
await plants.savePlant({preventDefault(){}});assert.equal(writes.at(-1).plant.lastWater,'');assert.equal(writes.at(-1).plant.history.length,0);
assert.equal(sync.plants.length,2);
gemini.showPlantSuggestions({revisarCadaDias:500,confianza:'baja'});
assert(!el('f-suggestions').children.some(c=>c.children?.some(x=>x.id==='suggest-revisarCadaDias')));
gemini.showPlantSuggestions({revisarCadaDias:1,confianza:'baja'});
el('suggest-revisarCadaDias').value='1';
el('use-revisarCadaDias').checked=true;
el('f-suggestions').children.find(c=>c.tagName==='BUTTON').click();
assert.equal(el('f-freq-unit').textContent,'día');
assert(!/<style|on(click|change|input|submit)=/.test(html));
assert.equal((html.match(/<script/g)||[]).length,1);
// Calendar dates are exact across DST; a synthetic 77-day delay remains 77.
const utils=ns('utils.js'),backup=ns('backup.js');
assert.equal(utils.diffDays('2026-03-28','2026-03-30'),2);
assert.equal(utils.addDays('2026-03-28',2),'2026-03-30');
assert(Number.isNaN(utils.dateNumber('2026-02-30')));
const bob={...existing,lastWater:utils.addDays(utils.todayStr(),-84),waterFreq:7};
assert.equal(plants.plantState(bob).d,-77);
assert.doesNotThrow(()=>plants.plantState({...bob,lastWater:'2026-02-30'}));
assert.throws(()=>backup.validateBackup([{id:'missing',name:'X'}]));
assert.throws(()=>backup.validateBackup([{...bob,history:[{t:'agua',date:'2026-02-30'}]}]));
assert.throws(()=>backup.validateBackup([bob,bob]));
const one={...existing,gallery:[],history:[]};assert.equal(backup.validateBackup([one]).length,1);
// Execute service-worker lifecycle with a cache adapter, checking scope and routes.
const events={},cacheKeys=new Set(['plantometro-v7','horas-v1','parte-v2']),core=[];
const swcontext=vm.createContext({self:{location:{origin:'https://franoo1.github.io'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>events[name]=fn},caches:{open:async name=>{cacheKeys.add(name);return {addAll:async paths=>core.push(...paths)};},keys:async()=>[...cacheKeys],delete:async name=>cacheKeys.delete(name)},URL});
vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),swcontext);
let pending;events.install({waitUntil:p=>pending=p});await pending;events.activate({waitUntil:p=>pending=p});await pending;
assert(cacheKeys.has('plantometro-v14'));assert(!cacheKeys.has('plantometro-v7'));assert(cacheKeys.has('horas-v1'));assert(cacheKeys.has('parte-v2'));
for(const file of core.filter(f=>f!=='./' && !f.startsWith('https:')))assert(fs.existsSync(path.join(root,file)),`Missing cache asset ${file}`);
for(const file of ['styles.css',...fs.readdirSync(path.join(root,'js')).map(n=>'js/'+n)])assert(core.includes('./'+file),`Uncached asset ${file}`);
let intercepted=false;events.fetch({request:{method:'POST',url:'https://generativelanguage.googleapis.com/'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).display,'standalone');
console.log('PASS: actual module graph and startup, add/edit, explicit Gemini preview/correction/discard, history preservation, Firebase paths, manual frequency, exterior weather, service-worker lifecycle and cached routes.');
