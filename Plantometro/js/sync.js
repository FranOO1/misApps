import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, arrayUnion, arrayRemove, serverTimestamp, onSnapshot, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, PLANT_ART } from "./utils.js";
import { toast, render, closeModal } from "./ui.js";
import {whoAmI} from './settings.js';
import {localDeviceId,startActivity,stopActivity} from './activity.js';
import {makeActivity,sortHistory} from './activity-model.js';

/* ============ Firebase: configuración (incrustada, proyecto misApps) ============ */
const fbConfig = {
  apiKey: "AIzaSyBkQ4NcoxU0V_R3jXnkH5Eu9WRDpr9eKXo",
  authDomain: "mishoras-bb0cc.firebaseapp.com",
  projectId: "mishoras-bb0cc",
  storageBucket: "mishoras-bb0cc.firebasestorage.app",
  messagingSenderId: "282064047722",
  appId: "1:282064047722:web:24a04aabeecb4a67394413"
};
try { localStorage.removeItem("pg3_fbconfig"); } catch(e){} // limpieza de la config antigua guardada

/* ============ Firebase: sesión y datos ============ */
let auth=null, fs=null, user=null, unsub=null, plants=[];
let epoch=0, operations=new Map(), confirmed=new Map(),transactions=new Set(),pendingWrites=new Set(),remotePlants=new Map();
const hasPendingWrites=()=>pendingWrites.size>0||transactions.size>0;
// Awaiting actions must finish their UI (notably Undo) before an update reloads.
function notifySyncIdle(){if(typeof window.dispatchEvent==='function')setTimeout(()=>window.dispatchEvent(new Event('plantometro:sync-idle')),0);}
const clone = value => JSON.parse(JSON.stringify(value));
const cacheKey = uid => "pg3_cache_" + uid;
try{localStorage.removeItem("pg3_cache");}catch(e){}
function clearGarden(uid){
  epoch++; if(unsub){unsub();unsub=null;}
  stopActivity();
  plants=[]; confirmed.clear();remotePlants.clear(); operations.clear();transactions.clear();pendingWrites.clear();
  try{localStorage.removeItem("pg3_cache");if(uid)localStorage.removeItem(cacheKey(uid));}catch(e){}
  document.querySelectorAll(".modal.open").forEach(m=>closeModal(m.id));
  $("acc-name").textContent=""; $("acc-email").textContent=""; $("acc-photo").src="";
  for(const id of ["d-name","d-species","d-desc","d-photo","d-gal","d-hist","d-lastai-txt","ai-title","ai-sub","ai-body","pm-note","f-suggestions"]){$(id).replaceChildren();}
  $("pm-img").src="";$("f-prev").innerHTML=PLANT_ART;
  for(const id of ["f-id","f-name","f-species","f-loc","f-desc"]){$(id).value="";}
  $("q").value="";$("search-panel").hidden=true;$("search-toggle").setAttribute("aria-expanded","false");
  render();
}
function saveCache(){
  if(user)try{localStorage.setItem(cacheKey(user.uid),JSON.stringify(plants));}catch(e){}
}
function reportWriteError(err,action){
  const code=err?.code || "unknown";
  const message=code.includes("permission-denied") ? "Firestore rechazó el permiso. No se guardó el cambio; revisa las reglas de esta cuenta."
    : code.includes("unauthenticated") ? "La sesión ha caducado. Vuelve a entrar con Google."
    : code.includes("unavailable") ? "El servicio no está disponible. La operación falló; revisa la conexión y vuelve a intentarlo."
    : code.includes("resource-exhausted") ? "Se ha alcanzado un límite de Firestore. Vuelve a intentarlo más tarde."
    : code==='not-found' ? "La planta ya no existe. No se guardó ni se volvió a crear."
    : "No se pudo " + action + ". El cambio no está confirmado; vuelve a intentarlo.";
  $("sync-status").textContent=message;toast(message);
}
function requireSession(){
  if(!user || !auth?.currentUser){toast("Entra con Google antes de cambiar el jardín.");return false;}return true;
}
function optimistic(p){const i=plants.findIndex(x=>x.id===p.id);if(i<0)plants.push(clone(p));else plants[i]=clone(p);saveCache();render();}
function rollback(id){const previous=confirmed.get(id);plants=plants.filter(p=>p.id!==id);if(previous)plants.push(clone(previous));saveCache();render();}
function track(ids,action,write){
  const session=epoch,uid=user.uid,op=Symbol(); ids.forEach(id=>operations.set(id,op));
  pendingWrites.add(op);
  render();
  $("sync-status").textContent=navigator.onLine===false ? "Cambios pendientes en este dispositivo; se enviarán al volver la conexión." : "Guardando cambios…";
  return Promise.resolve().then(write).then(()=>{
    if(epoch!==session || user?.uid!==uid)return false;
    ids.forEach(id=>{if(operations.get(id)===op){operations.delete(id);const p=remotePlants.get(id)||plants.find(p=>p.id===id);plants=plants.filter(x=>x.id!==id);if(p){plants.push(clone(p));confirmed.set(id,clone(p));}else confirmed.delete(id);}});
    $("sync-status").textContent="Cambios confirmados en la nube.";saveCache();render();return true;
  }).catch(err=>{
    if(epoch!==session || user?.uid!==uid)return false;
    ids.forEach(id=>{if(operations.get(id)===op){operations.delete(id);rollback(id);}});reportWriteError(err,action);return false;
  }).finally(()=>{pendingWrites.delete(op);notifySyncIdle();});
}

function showGate(mode){
  $("gate").style.display = mode ? "flex" : "none";
  $("gate-login").style.display = mode==="login" ? "block" : "none";
}

function startFirebase(){
  const app = initializeApp(fbConfig);
  auth = getAuth(app);
  try {
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch(e) { fs = initializeFirestore(app, {}); }

  getRedirectResult(auth).catch(err=>{ $("gate-error").textContent = friendlyAuthError(err); });

  onAuthStateChanged(auth, u => {
    const oldUid=user?.uid;
    if(oldUid !== u?.uid)clearGarden(oldUid);
    user=u;
    if(u){
      try{const cached=JSON.parse(localStorage.getItem(cacheKey(u.uid))||"[]");if(Array.isArray(cached))plants=cached;}catch(e){}
      confirmed=new Map(plants.map(p=>[p.id,clone(p)]));
      $("acc-name").textContent=u.displayName||"";$("acc-email").textContent=u.email||"";$("acc-photo").src=u.photoURL||"";
      render();showGate(null);listenPlants();startActivity(fs,u.uid);
    }else{clearGarden(oldUid);showGate("login");}
  });
}

function friendlyAuthError(err){
  if(!err) return "";
  const c = err.code || "";
  if(c.includes("unauthorized-domain")) return "Este dominio no está autorizado en Firebase → Authentication → Settings → Dominios autorizados.";
  if(c.includes("popup-blocked")) return "El navegador bloqueó la ventana. Vuelve a intentarlo.";
  if(c.includes("operation-not-allowed")) return "Activa el proveedor Google en Firebase → Authentication.";
  return "No se pudo iniciar sesión ("+c+")";
}
async function doSignIn(){
  $("gate-error").textContent = "";
  const prov = new GoogleAuthProvider();
  try { await signInWithPopup(auth, prov); }
  catch(err){
    if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(err.code)) { try { await signInWithRedirect(auth, prov); } catch(e2){ $("gate-error").textContent = friendlyAuthError(e2); } }
    else if(!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(err.code)) $("gate-error").textContent = friendlyAuthError(err);
  }
}
async function doSignOut(){
  const uid=user?.uid;
  try{await signOut(auth);clearGarden(uid);user=null;showGate("login");}
  catch(err){toast("No se pudo cerrar sesión. Vuelve a intentarlo.");}
}
function listenPlants(){
  if(unsub)unsub();const uid=user.uid,session=epoch;
  unsub=onSnapshot(collection(fs,"users",uid,"plants"),{includeMetadataChanges:true},snap=>{
    if(session!==epoch || user?.uid!==uid)return;
    const remote=snap.docs.map(d=>{const p=d.data();return {...p,history:sortHistory(p.history),gallery:sortHistory(p.gallery)};});
    remotePlants=new Map(remote.map(p=>[p.id,clone(p)]));
    if(!snap.metadata?.hasPendingWrites){
      for(const p of remote)confirmed.set(p.id,clone(p));
      for(const id of confirmed.keys())if(!remote.some(p=>p.id===id))confirmed.delete(id);
    }
    plants=[...remote.filter(p=>!operations.has(p.id)),...plants.filter(p=>operations.has(p.id))];
    saveCache();render();
  },err=>{if(session===epoch){reportWriteError(err,"cargar el jardín");}});
}
function journalRef(){return doc(fs,'users',user.uid,'plantometroActivity','recent');}
function appendActivity(batch,event,ref=journalRef()){batch.set(ref,{events:arrayUnion(event),updatedAt:serverTimestamp()},{merge:true});}
function fitsPlant(p){
  if(new TextEncoder().encode(JSON.stringify(p)).length<=850000)return true;
  toast('La ficha es demasiado grande. Exporta una copia antes de reducir fotos; no se eliminó ninguna automáticamente.');return false;
}
function putPlant(p,options={}){
  if(!requireSession()||!fitsPlant(p))return Promise.resolve(false);
  const previous=confirmed.get(p.id),batch=writeBatch(fs),ref=doc(fs,'users',user.uid,'plants',p.id);
  if(!previous){
    const event=makeActivity('created',p,whoAmI(),localDeviceId);
    const saved={...clone(p),lastActivity:event};batch.set(ref,saved);appendActivity(batch,event);optimistic(saved);
  }else{
    const patch=options.patch||Object.fromEntries(Object.entries(p).filter(([key,value])=>JSON.stringify(previous[key])!==JSON.stringify(value)));
    const meaningful=Object.keys(patch).some(key=>!['updatedAt','updatedBy'].includes(key));
    if(!meaningful)return Promise.resolve(true);
    const event=options.type?makeActivity(options.type,p,whoAmI(),localDeviceId):null;
    const fields={...patch,updatedAt:p.updatedAt||new Date().toISOString(),updatedBy:p.updatedBy||whoAmI(),...(event?{lastActivity:event}:{})};
    batch.update(ref,fields);if(event)appendActivity(batch,event);optimistic({...previous,...p,...(event?{lastActivity:event}:{})});
  }
  return track([p.id],'guardar la ficha y su actividad',()=>batch.commit());
}
// Field transforms preserve concurrent histories/photos and cannot recreate a
// plant deleted on another device. One batch confirms the action and its event.
function patchPlant(p,fields,type,extra={},eventId){
  if(!requireSession()||!fitsPlant(p))return Promise.resolve(false);
  const event=makeActivity(type,p,whoAmI(),localDeviceId,eventId,extra),batch=writeBatch(fs);
  batch.update(doc(fs,'users',user.uid,'plants',p.id),{...fields,updatedAt:p.updatedAt||event.occurredAt,updatedBy:event.author,lastActivity:event});
  appendActivity(batch,event);optimistic({...p,lastActivity:event});
  return track([p.id],'guardar el cambio y su actividad',()=>batch.commit());
}
function removePlant(id){
  if(!requireSession())return Promise.resolve(false);
  const p=plants.find(p=>p.id===id);if(!p)return Promise.resolve(false);
  const batch=writeBatch(fs),event=makeActivity('deleted',p,whoAmI(),localDeviceId);
  const ref=doc(fs,'users',user.uid,'plants',id);
  // An existence precondition keeps a queued second deletion from announcing
  // an action on an already removed plant. Both writes commit atomically.
  batch.update(ref,{updatedAt:event.occurredAt});batch.delete(ref);appendActivity(batch,event);
  plants=plants.filter(p=>p.id!==id);saveCache();render();
  return track([id],'eliminar la planta y guardar su actividad',()=>batch.commit());
}
function putPlantsBatch(list){
  if(!requireSession())return Promise.resolve(false);
  const batch=writeBatch(fs),event=makeActivity('restored',{id:'',name:'Tu jardín'},whoAmI(),localDeviceId);
  for(const p of list){batch.set(doc(fs,'users',user.uid,'plants',p.id),clone(p));optimistic(p);}
  appendActivity(batch,event);
  return track(list.map(p=>p.id),'restaurar la copia',()=>batch.commit());
}
async function updatePlantTransaction(id,transform,activity={}){
  if(!requireSession())return false;
  const session=epoch,uid=user.uid,p=plants.find(p=>p.id===id),activityRef=journalRef();
  const event=makeActivity('corrected',p,whoAmI(),localDeviceId,undefined,activity);
  const operation=Symbol();transactions.add(operation);
  try{
    await runTransaction(fs,async tx=>{
      const ref=doc(fs,'users',uid,'plants',id),snap=await tx.get(ref);
      if(!snap.exists())throw {code:'not-found'};
      const changed=transform(snap.data());if(!changed)throw {code:'already-corrected'};
      tx.set(ref,{...changed,lastActivity:event});appendActivity(tx,event,activityRef);
    });
    if(session!==epoch)return false;
    toast('Riego corregido. Los demás registros se conservan.');return true;
  }catch(err){if(session===epoch){if(err.code==='already-corrected')toast('Este riego ya estaba corregido. No se ha creado otro cambio.');else reportWriteError(err,'corregir ese riego (requiere conexión)');}return false;}
  finally{transactions.delete(operation);notifySyncIdle();}
}
const alive=()=>plants;
const sessionToken=()=>user?user.uid+':'+epoch:null;
const isPlantPending=id=>operations.has(id);
const confirmedPlant=id=>confirmed.get(id);
export {plants,auth,showGate,startFirebase,doSignIn,doSignOut,putPlant,patchPlant,removePlant,putPlantsBatch,updatePlantTransaction,alive,sessionToken,hasPendingWrites,isPlantPending,confirmedPlant,arrayUnion,arrayRemove};
