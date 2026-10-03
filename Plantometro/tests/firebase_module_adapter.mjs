// Minimal SDK adapter for the existing module test. Never contacts Firebase.
const listeners=[];
const store=new Map([['users/test/plants/old',JSON.parse(JSON.stringify(testExisting))]]);
const key=r=>r.slice(1).join('/');
const copy=v=>JSON.parse(JSON.stringify(v));
const isPlant=k=>k.includes('/plants/');
function snapshot(ref){const k=key(ref);return ref.at(-1)==='plants'?{metadata:{hasPendingWrites:false,fromCache:false},docs:[...store].filter(([p])=>p.startsWith(k+'/')).map(([,v])=>({data:()=>copy(v)}))}:{metadata:{hasPendingWrites:false,fromCache:false},exists:()=>store.has(k),data:()=>copy(store.get(k)||{})};}
function apply(ref,fields,merge){const k=key(ref),p=merge?copy(store.get(k)||{}):{};for(const [name,v] of Object.entries(fields)){if(v?.adapter==='union'){p[name]=p[name]||[];for(const entry of v.values)if(!p[name].some(x=>JSON.stringify(x)===JSON.stringify(entry)))p[name].push(copy(entry));}else if(v?.adapter==='remove')p[name]=(p[name]||[]).filter(x=>!v.values.some(entry=>JSON.stringify(x)===JSON.stringify(entry)));else p[name]=v;}store.set(k,copy(p));if(isPlant(k)){const result=copy(p);result.history?.sort((a,b)=>(b.at||b.date||'').localeCompare(a.at||a.date||''));testWrites.push({ref:ref.slice(1),plant:result});}}
function notify(){for(const {ref,cb} of listeners)cb(snapshot(ref));}
export const initializeFirestore=()=>({});
export const persistentLocalCache=()=>({});
export const persistentMultipleTabManager=()=>({});
export const collection=(...a)=>a;
export const doc=(...a)=>a;
export const arrayUnion=(...values)=>({adapter:'union',values});
export const arrayRemove=(...values)=>({adapter:'remove',values});
export const serverTimestamp=()=>new Date().toISOString();
export const onSnapshot=(ref,options,cb)=>{if(typeof options==='function')cb=options;const item={ref,cb};listeners.push(item);cb(snapshot(ref));return ()=>listeners.splice(listeners.indexOf(item),1);};
export const writeBatch=()=>{const pending=[];return {set:(r,p,o)=>pending.push(()=>apply(r,p,o?.merge)),update:(r,p)=>pending.push(()=>apply(r,p,true)),delete:r=>pending.push(()=>store.delete(key(r))),commit:async()=>{pending.forEach(fn=>fn());notify();}};};
export const runTransaction=async(db,cb)=>{const pending=[];const result=await cb({get:async ref=>snapshot(ref),set:(ref,p,options)=>pending.push(()=>apply(ref,p,options?.merge)),update:(ref,p)=>pending.push(()=>apply(ref,p,true))});pending.forEach(fn=>fn());notify();return result;};
