// Targeted regression: cancelling Google access must not start a redirect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const message={textContent:''},ctx=vm.createContext({message,popupError:null,redirects:0});
const source=fs.readFileSync(new URL('../js/sync.js',import.meta.url),'utf8');
const mod=new vm.SourceTextModule(source,{context:ctx});
await mod.link(spec=>{
  let code,declared;
  if(spec.includes('firebase-auth'))code="export class GoogleAuthProvider{};export const signInWithPopup=async()=>{throw {code:popupError}};export const signInWithRedirect=async()=>{redirects++};";
  else if(spec.includes('utils'))code="export const $=()=>message;export const PLANT_ART='';";
  else if(spec.includes('ui'))code='export const toast=()=>{},render=()=>{},closeModal=()=>{};';
  else code='';
  declared=new Set(spec.includes('firebase-auth')?['GoogleAuthProvider','signInWithPopup','signInWithRedirect']:spec.includes('utils')?['$','PLANT_ART']:spec.includes('ui')?['toast','render','closeModal']:[]);
  const imports=source.match(new RegExp('import \\{([^}]+)\\} from ["\\\']'+spec.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\\\']'))?.[1].split(',').map(x=>x.trim())||[];
  for(const name of imports)if(!declared.has(name))code+='export const '+name+'=()=>{};';
  return new vm.SourceTextModule(code,{context:ctx});
});
await mod.evaluate();
for(const code of ['auth/popup-closed-by-user','auth/cancelled-popup-request']){
  ctx.popupError=code;await mod.namespace.doSignIn();assert.equal(ctx.redirects,0);assert.equal(message.textContent,'');
}
ctx.popupError='auth/popup-blocked';await mod.namespace.doSignIn();assert.equal(ctx.redirects,1);
console.log('PASS auth cancellation: closed/cancelled popup stays on login; blocked popup can redirect');
