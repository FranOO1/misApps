// Synthetic transport for browser tests. This is never loaded by the production app.
window.fixtureDoc=window.fixtureDoc||{};window.fixtureListeners=[];
const makeSnap=()=>({exists:!!Object.keys(fixtureDoc).length,data:()=>structuredClone(fixtureDoc),metadata:{fromCache:false,hasPendingWrites:false}});
window.emitFixture=()=>fixtureListeners.forEach(cb=>cb(makeSnap()));
const ref={onSnapshot(opts,cb){fixtureListeners.push(cb);queueMicrotask(()=>cb(makeSnap()));return()=>fixtureListeners.splice(fixtureListeners.indexOf(cb),1);},async get(){return makeSnap();},async set(p,options){const ops=options.mergeFields.map(f=>{let value=p;for(const k of f.parts)value=value[k];return {path:f.parts,value};});fixtureDoc=HorasCore.applyOps(fixtureDoc,ops);emitFixture();}};
const db={enablePersistence:async()=>{},collection:()=>({doc:()=>ref}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,p,o)=>r.set(p,o)})};
let authCallback;const auth={currentUser:null,getRedirectResult:async()=>{},onAuthStateChanged(cb){authCallback=cb;queueMicrotask(()=>cb(auth.currentUser));},async signInWithPopup(){auth.currentUser={uid:'synthetic-owner',email:'fixture@example.invalid'};authCallback(auth.currentUser);},async signOut(){auth.currentUser=null;authCallback(null);}};
const authFn=()=>auth;authFn.GoogleAuthProvider=class {};
const firestoreFn=()=>db;firestoreFn.FieldPath=class {constructor(...parts){this.parts=parts;}};
window.firebase={initializeApp(){},app:()=>({_delegate:{name:'synthetic-app'}}),auth:authFn,firestore:firestoreFn};
