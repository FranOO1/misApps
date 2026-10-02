import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, PLANT_ART } from "./utils.js";
import { toast, render, closeModal } from "./ui.js";

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
let epoch=0, operations=new Map(), confirmed=new Map();
const clone = value => JSON.parse(JSON.stringify(value));
const cacheKey = uid => "pg3_cache_" + uid;
try{localStorage.removeItem("pg3_cache");}catch(e){}
function clearGarden(uid){
  epoch++; if(unsub){unsub();unsub=null;}
  plants=[]; confirmed.clear(); operations.clear();
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
  $("sync-status").textContent=navigator.onLine===false ? "Cambios pendientes en este dispositivo; se enviarán al volver la conexión." : "Guardando cambios…";
  return Promise.resolve().then(write).then(()=>{
    if(epoch!==session || user?.uid!==uid)return false;
    ids.forEach(id=>{if(operations.get(id)===op){const p=plants.find(p=>p.id===id);if(p)confirmed.set(id,clone(p));else confirmed.delete(id);operations.delete(id);}});
    $("sync-status").textContent="Cambios confirmados en la nube.";saveCache();return true;
  }).catch(err=>{
    if(epoch!==session || user?.uid!==uid)return false;
    ids.forEach(id=>{if(operations.get(id)===op){rollback(id);operations.delete(id);}});reportWriteError(err,action);return false;
  });
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
      render();showGate(null);listenPlants();
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
    if((err.code||"").includes("popup")) { try { await signInWithRedirect(auth, prov); } catch(e2){ $("gate-error").textContent = friendlyAuthError(e2); } }
    else $("gate-error").textContent = friendlyAuthError(err);
  }
}
async function doSignOut(){
  const uid=user?.uid;
  try{await signOut(auth);clearGarden(uid);user=null;showGate("login");}
  catch(err){toast("No se pudo cerrar sesión. Vuelve a intentarlo.");}
}
function listenPlants(){
  if(unsub)unsub();const uid=user.uid,session=epoch;
  unsub=onSnapshot(collection(fs,"users",uid,"plants"),snap=>{
    if(session!==epoch || user?.uid!==uid)return;
    const remote=snap.docs.map(d=>d.data());
    if(!snap.metadata?.hasPendingWrites){
      for(const p of remote)if(!operations.has(p.id))confirmed.set(p.id,clone(p));
      for(const id of confirmed.keys())if(!remote.some(p=>p.id===id)&&!operations.has(id))confirmed.delete(id);
    }
    plants=[...remote.filter(p=>!operations.has(p.id)),...plants.filter(p=>operations.has(p.id))];
    saveCache();render();
  },err=>{if(session===epoch){reportWriteError(err,"cargar el jardín");}});
}
function putPlant(p){
  if(!requireSession())return Promise.resolve(false);
  if(new TextEncoder().encode(JSON.stringify(p)).length>850000){rollback(p.id);toast("La ficha es demasiado grande. Exporta una copia antes de reducir fotos; no se eliminó ninguna automáticamente.");return Promise.resolve(false);}
  optimistic(p);const uid=user.uid;
  return track([p.id],"guardar",()=>setDoc(doc(fs,"users",uid,"plants",p.id),clone(p)));
}
function removePlant(id){
  if(!requireSession())return Promise.resolve(false);
  plants=plants.filter(p=>p.id!==id);saveCache();render();const uid=user.uid;
  return track([id],"eliminar",()=>deleteDoc(doc(fs,"users",uid,"plants",id)));
}
function putPlantsBatch(list){
  if(!requireSession())return Promise.resolve(false);
  const uid=user.uid,batch=writeBatch(fs);
  for(const p of list){batch.set(doc(fs,"users",uid,"plants",p.id),clone(p));optimistic(p);}
  return track(list.map(p=>p.id),"restaurar la copia",()=>batch.commit());
}
async function updatePlantTransaction(id,transform){
  if(!requireSession())return false;
  const session=epoch,uid=user.uid;
  try{
    await runTransaction(fs,async tx=>{
      const ref=doc(fs,"users",uid,"plants",id),snap=await tx.get(ref);
      if(!snap.exists())throw new Error("missing");
      const changed=transform(snap.data());if(!changed)throw new Error("missing-event");
      tx.set(ref,changed);
    });
    if(session!==epoch)return false;
    // The snapshot listener publishes the transaction's current document.
    const current=plants.find(p=>p.id===id),changed=current && transform(clone(current));
    if(changed){optimistic(changed);confirmed.set(id,clone(changed));}
    toast("Riego corregido. Los demás registros se conservan.");return true;
  }catch(err){if(session===epoch)reportWriteError(err,"corregir ese riego (requiere conexión)");return false;}
}
const alive=()=>plants;
const sessionToken=()=>user?user.uid+":"+epoch:null;
export {plants,auth,showGate,startFirebase,doSignIn,doSignOut,putPlant,removePlant,putPlantsBatch,updatePlantTransaction,alive,sessionToken};
