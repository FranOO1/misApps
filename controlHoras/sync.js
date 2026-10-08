/* Existing users/{uid} document, atomic mergeFields; no security-rule changes. */
(function(root){
  'use strict';
  const C=root.HorasCore;
  function create({defaults,getState,apply,onStatus,storage=root.localStorage,db,FieldPath}) {
    let account='guest',epoch=0,user=null,unsub=null,sending=false,online=true,baseline=null,pending=[],lastRemote=null,migrationTried=new Set();
    const key=()=>`horas-app-v3:${account}`;
    const status=(kind,message)=>onStatus(kind,message);
    const blank=()=>({schemaVersion:3,config:C.copy(defaults),data:{}});
    function recover(reason,p=getState()) {
      const k=`horas-recovery:${account}`,list=JSON.parse(storage.getItem(k)||'[]');
      list.push({at:new Date().toISOString(),reason,payload:C.copy(p)});
      storage.setItem(k,JSON.stringify(list.slice(-10)));return list.at(-1);
    }
    function persist() {storage.setItem(key(),JSON.stringify({payload:getState(),pending}));baseline=C.copy(getState());}
    function read() {
      const raw=storage.getItem(key());
      if(raw){const saved=JSON.parse(raw);pending=saved.pending||[];C.applyOps(blank(),pending);return C.validateBackup(saved.payload,defaults);}
      if(account==='guest') {
        const old=storage.getItem('horas-app-v2');
        if(old) {storage.setItem('horas-original-v2',old);return C.validateBackup(JSON.parse(old),defaults);}
      }
      pending=[];return blank();
    }
    function load() {
      try {const p=read();apply(p);persist();}
      catch(e){pending=[];apply(blank());baseline=blank();status('error','No se ha sobrescrito la copia local inválida. Exporta la recuperación antes de continuar.');throw e;}
    }
    function diff(before,after) {
      const ops=[],add=(path,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))ops.push({id:crypto.randomUUID(),path,value:b??null});};
      for(const k of Object.keys(after.config))if(k!=='hideMoney')add(['config',k],before.config[k],after.config[k]);
      for(const mk of new Set([...Object.keys(before.data),...Object.keys(after.data)])) {
        const a=before.data[mk]||{days:{}},b=after.data[mk]||{days:{}};
        for(const d of new Set([...Object.keys(a.days),...Object.keys(b.days)]))add(['data',mk,'days',d],a.days[d],b.days[d]);
        for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(k!=='days')add(['data',mk,k],a[k],b[k]);
      }return ops;
    }
    function save() {
      const p=C.validateBackup(getState(),defaults);pending.push(...diff(baseline||blank(),p));
      try{persist();}catch(e){status('error','No se pudo guardar en este dispositivo. Exporta una copia ahora.');throw e;}
      status(user?'pending':'local',user?'Cambios guardados aquí, pendientes de nube':'Guardado en este dispositivo');void flush();
    }
    async function flush() {
      if(sending||!user||!online||!pending.length||!lastRemote)return;
      const batch=pending.slice(0,300),uid=user.uid,session=epoch;let committed=false; sending=true;status('syncing','Sincronizando…');
      try{
        const compact=new Map(batch.map(op=>[JSON.stringify(op.path),op]));
        const operations=[...compact.values()],patch=C.applyOps({},operations);
        await db.collection('users').doc(uid).set(patch,{mergeFields:operations.map(op=>new FieldPath(...op.path))});
        if(session!==epoch)return;committed=true;
        const sent=new Set(batch.map(op=>op.id));pending=pending.filter(op=>!sent.has(op.id));
        // Keep the locally acknowledged fields until the next authoritative snapshot.
        lastRemote=C.applyOps(lastRemote,operations);persist();
        try{const snap=await db.collection('users').doc(uid).get({source:'server'});if(session!==epoch)return;if(snap.exists)receive(snap.data(),snap.metadata);}catch{status('pending','Guardado en nube; esperando confirmación de lectura.');}
        status(pending.length?'pending':'ok',pending.length?'Hay más cambios pendientes':'Sincronizado');
      }catch(e){if(session===epoch)status('error',e.code==='permission-denied'?'Firestore rechazó el permiso. Cambios conservados aquí.':'No se pudo sincronizar. Cambios conservados aquí.');}
      finally{if(session===epoch){sending=false; if(committed && pending.length && online)void flush();}}
    }
    async function migrateRates(raw,remote) {
      if(!user||!online||!db.runTransaction)return;
      const uid=user.uid,session=epoch;
      const candidates=Object.keys(remote.data).filter(mk=>!raw?.data?.[mk]?.rateConfig&&!migrationTried.has(mk));
      if(!candidates.length)return;candidates.forEach(mk=>migrationTried.add(mk));
      try{
        await db.runTransaction(async tx=>{
          const ref=db.collection('users').doc(uid),snap=await tx.get(ref);if(session!==epoch)return;
          const current=snap.exists?snap.data():{},ops=[];
          for(const mk of candidates)if(current.data?.[mk]&&!current.data[mk].rateConfig){ops.push({path:['data',mk,'rateConfig'],value:remote.data[mk].rateConfig},{path:['data',mk,'historicalStatus'],value:'unknown'});}
          if(ops.length)tx.set(ref,C.applyOps({},ops),{mergeFields:ops.map(op=>new FieldPath(...op.path))});
        });
      }catch{if(session===epoch)status('error','Tarifas históricas conservadas aquí; no se pudo guardar su migración en nube.');}
    }
    function receive(raw,metadata={}) {
      try {
        const remote=C.validateBackup({config:raw?.config||defaults,data:raw?.data||{},schemaVersion:3},defaults,{remote:true});
        for(const [mk,r] of Object.entries(remote.data))if(!raw?.data?.[mk]?.rateConfig&&getState().data[mk]?.rateConfig){r.rateConfig=C.copy(getState().data[mk].rateConfig);r.historicalStatus=getState().data[mk].historicalStatus||'unknown';}
        if(!lastRemote && Object.keys(getState().data).length)recover('Antes de recibir la nube');
        lastRemote=remote;apply(C.applyOps(remote,pending));persist();
        if(metadata.fromCache)status('offline','Copia de nube en caché; esperando conexión');
        else if(!pending.length)status('ok','Sincronizado');
        if(!metadata.fromCache)void migrateRates(raw,remote);void flush();
      }catch(e){status('error','Datos remotos no válidos. Se conserva la copia local.');}
    }
    function detach() {epoch++;if(unsub)unsub();unsub=null;sending=false;lastRemote=null;migrationTried.clear();user=null;}
    function switchAccount(next) {
      if(next?.uid===user?.uid && (next||account==='guest'))return;
      detach();user=next||null;account=next?.uid||'guest';load();
      if(!next){status('local','Guardado en este dispositivo');return;}
      const session=epoch;status('syncing','Conectando a la nube…');
      unsub=db.collection('users').doc(next.uid).onSnapshot({includeMetadataChanges:true},snap=>{
        if(epoch!==session || snap.metadata.hasPendingWrites)return;
        receive(snap.exists?snap.data():{},snap.metadata);
      },e=>{if(epoch===session)status('error',e.code==='permission-denied'?'No hay permiso para leer Firestore.':'No se pudo conectar a la nube.');});
    }
    async function pull() {
      if(!user)throw Error('Inicia sesión primero.');if(pending.length)throw Error('Espera a sincronizar los cambios pendientes antes de sustituirlos.');
      const session=epoch,snap=await db.collection('users').doc(user.uid).get({source:'server'});
      if(session!==epoch) return;if(!snap.exists)throw Error('No hay datos en la nube.');
      C.validateBackup({config:snap.data().config||defaults,data:snap.data().data||{}},defaults);
      recover('Antes de sustituir con la nube');receive(snap.data(),snap.metadata);
    }
    function setOnline(value){online=value;if(!value)status('offline','Sin conexión; cambios guardados en este dispositivo');else {status(pending.length?'pending':'syncing','Conectando…');void flush();}}
    return {load,save,recover,switchAccount,pull,setOnline,flush,session:()=>epoch,account:()=>account,pending:()=>C.copy(pending),recovery:()=>storage.getItem(`horas-recovery:${account}`)};
  }
  root.HorasSync={create};
  if(typeof module!=='undefined')module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
