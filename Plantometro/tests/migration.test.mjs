import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/settings.js',import.meta.url),'utf8');
async function load(raw,failWrite=false){
  const saved=new Map([['pg3b_settings',JSON.stringify(raw)],['pg3_cache_own','garden-marker'],['unrelated','keep']]);
  const ctx=vm.createContext({localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>{if(failWrite)throw Error('storage-blocked');saved.set(k,v);}},matchMedia:()=>({addEventListener(){}})});
  const mod=new vm.SourceTextModule(source,{context:ctx});
  await mod.link(spec=>new vm.SourceTextModule(spec.includes('utils')?'export const $=()=>({});':'export const toast=()=>{},render=()=>{},closeModal=()=>{};',{context:ctx}));
  await mod.evaluate();return {saved,settings:mod.namespace.settings,persist:mod.namespace.persistSettings};
}
test('Only Gemini credential is removed; all other stored preferences/garden remain',async()=>{
  const old={geminiKey:'test-only-marker',name:'Name',lat:1,lon:2,city:'City',theme:'dark',custom:{unknown:true},streak:4,lastNotif:'old'};
  const r=await load(old),expected={...old};delete expected.geminiKey;
  assert.deepEqual(JSON.parse(r.saved.get('pg3b_settings')),expected);
  assert.equal(r.saved.get('pg3_cache_own'),'garden-marker');assert.equal(r.saved.get('unrelated'),'keep');
  assert(!('geminiKey' in r.settings));r.settings.geminiKey='must-not-persist';r.persist();assert(!JSON.parse(r.saved.get('pg3b_settings')).geminiKey);
});
test('If the device blocks storage writes, preferences still load and no key is used',async()=>{
  const r=await load({geminiKey:'test-only-marker',name:'Name',city:'City',customPreference:'keep'},true);
  assert.equal(r.settings.name,'Name');assert.equal(r.settings.city,'City');assert.equal(r.settings.customPreference,'keep');assert(!('geminiKey' in r.settings));
});
