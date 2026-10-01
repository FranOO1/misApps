import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $ } from "./utils.js";
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
try { const b = localStorage.getItem("pg3_cache"); if(b) plants = JSON.parse(b); } catch(e){}

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
    user = u;
    if (u) {
      showGate(null);
      $("acc-name").textContent = u.displayName || "";
      $("acc-email").textContent = u.email || "";
      $("acc-photo").src = u.photoURL || "";
      if (u.photoURL) $("acc-btn").innerHTML = '<img src="'+u.photoURL+'" alt="Cuenta" style="width:100%;height:100%;object-fit:cover" referrerpolicy="no-referrer">';
      listenPlants();
    } else {
      if (unsub) { unsub(); unsub = null; }
      showGate("login");
    }
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
function doSignOut(){ closeModal("account-modal"); signOut(auth); }

function listenPlants(){
  if (unsub) unsub();
  unsub = onSnapshot(collection(fs, "users", user.uid, "plants"),
    snap => {
      plants = snap.docs.map(d => d.data());
      try{ localStorage.setItem("pg3_cache", JSON.stringify(plants)); }catch(e){}
      render();
    },
    err => {
      if ((err.code||"").includes("permission-denied"))
        toast("Sin permiso: añade tu email a las reglas de Firestore (ver LEEME) 🔒");
      else toast("Error de conexión con la nube");
    }
  );
}
function putPlant(p){
  // pintado optimista local + escritura en la nube (Firestore reintenta offline)
  const i = plants.findIndex(x=>x.id===p.id);
  if(i>=0) plants[i]=p; else plants.push(p);
  render();
  setDoc(doc(fs, "users", auth.currentUser.uid, "plants", p.id), p).catch(()=>toast("Se guardará al recuperar conexión 📶"));
}
function removePlant(id){
  plants = plants.filter(x=>x.id!==id);
  render();
  deleteDoc(doc(fs, "users", auth.currentUser.uid, "plants", id)).catch(()=>{});
}
const alive = () => plants;

export { plants, auth, showGate, startFirebase, doSignIn, doSignOut, putPlant, removePlant, alive };
