/* Existing users/{uid} document, atomic mergeFields; no security-rule changes. */
(function(root){
  'use strict';
  const C=root.HorasCore;
  function create({defaults,getState,apply,onStatus,onRemote=()=>{},storage=root.localStorage,db,FieldPath}) {
    let account='guest',epoch=0,user=null,unsub=null,sending=false,online=true,baseline=null,pending=[],lastRemote=null,blocked=false,listenerFailed=false,migrationTried=new Set();
    const key=()=>`horas-app-v3:${account}`;
    const status=(kind,message)=>onStatus(kind,message);
    const blank=()=>({schemaVersion:3,config:C.copy(defaults),data:{}});
    function recover(reason,p=getState()) {
      if(blocked)throw Error('La copia local está protegida. Exporta su original antes de sustituirla.');
      const k=`horas-recovery:${account}`,list=JSON.parse(storage.getItem(k)||'[]');
      list.push({at:new Date().toISOString(),reason,payload:C.copy(p)});
      storage.setItem(k,JSON.stringify(list.slice(-10)));return list.at(-1);
    }
    function persist() {storage.setItem(key(),JSON.stringify({payload:getState(),pending}));baseline=C.copy(getState());}
    function read() {
      const raw=storage.getItem(key());
      if(raw){
        const saved=JSON.parse(raw);pending=saved.pending||[];
        if(!Array.isArray(pending)||pending.length>100000)throw Error('Diario local no válido.');
        for(const op of pending){
          if(typeof op.id!=='string'||!op.id||!Array.isArray(op.path)||!(['config','data'].includes(op.path[0]))||op.path.some(k=>typeof k!=='string'))throw Error('Diario local no válido.');
          if(op.path[0]==='config'&&(op.path.length!==2||!Object.hasOwn(defaults,op.path[1])||op.path[1]==='hideMoney'))throw Error('Ajuste pendiente no válido.');
          if(op.path[0]==='data'&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(op.path[1])||!['days','rateConfig','historicalStatus','closed'].includes(op.path[2])||(op.path[2]==='days'?op.path.length!==4:op.path.length!==3)))throw Error('Jornada pendiente no válida.');
        }
        const valid=C.validateBackup(saved.payload,defaults);C.validateBackup(C.applyOps(valid,pending),defaults);
        if(JSON.stringify(valid)!==JSON.stringify(saved.payload))storage.setItem(`horas-before-migration:${account}`,raw);
        return valid;
      }
      if(account==='guest') {
        const old=storage.getItem('horas-app-v2');
        if(old) {if(!storage.getItem('horas-original-v2'))storage.setItem('horas-original-v2',old);return C.validateBackup(JSON.parse(old),defaults);}
      }
      pending=[];return blank();
    }
    function load() {
      blocked=false;
      try {const p=read();apply(p);persist();}
      catch(e){blocked=true;pending=[];apply(blank());baseline=blank();status('error','La copia local no se pudo abrir. Está protegida contra sobrescrituras; exporta la recuperación.');throw e;}
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
      try {
        if(blocked)throw Error('Copia local protegida. Exporta la recuperación antes de continuar.');
        const p=C.validateBackup(getState(),defaults),nextPending=[...pending,...diff(baseline||blank(),p)];
        // A failed device write must not enter the journal, reach Firestore later,
        // or leave the visible state pretending the change has been saved.
        storage.setItem(key(),JSON.stringify({payload:p,pending:nextPending}));
        pending=nextPending;baseline=C.copy(p);apply(p);
      }catch(e){if(baseline)apply(C.copy(baseline));status('error',blocked?'Copia local protegida; no se guardaron cambios.':'No se pudo guardar en este dispositivo. El cambio no se ha aplicado.');throw e;}
      status(user?'pending':'local',user?'Cambios guardados aquí, pendientes de nube':'Guardado en este dispositivo');void flush();
    }
    async function flush() {
      if(blocked||listenerFailed||sending||!user||!online||!pending.length||!lastRemote)return;
      const batch=pending.slice(0,300),uid=user.uid,session=epoch;let committed=false; sending=true;status('syncing','Sincronizando…');
      try{
        const compact=new Map(batch.map(op=>[JSON.stringify(op.path),op]));
        const operations=[...compact.values()],patch=C.applyOps({},operations);
        await db.collection('users').doc(uid).set(patch,{mergeFields:operations.map(op=>new FieldPath(...op.path))});
        if(session!==epoch)return;committed=true;
        const sent=new Set(batch.map(op=>op.id));pending=pending.filter(op=>!sent.has(op.id));
        // Keep the locally acknowledged fields until the next authoritative snapshot.
        lastRemote=C.applyOps(lastRemote,operations);persist();
        let readConfirmed=false,readError=null;
        try{const snap=await db.collection('users').doc(uid).get({source:'server'});if(session!==epoch)return;if(snap.exists){receive(snap.data(),snap.metadata);readConfirmed=true;}}catch(e){readError=e;}
        if(session===epoch) {
          if(listenerFailed||readError)status('error',readError?.code==='permission-denied'?'Guardado en nube, pero Firestore rechazó la lectura de confirmación. Puedes reintentar.':'Guardado en nube; falló la confirmación de lectura. Se conserva la copia local. Puedes reintentar.');
          else status(pending.length||!readConfirmed?'pending':'ok',pending.length?'Hay más cambios pendientes':readConfirmed?'Sincronizado':'Guardado en nube; esperando confirmación de lectura.');
        }
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
      }catch{if(session===epoch){candidates.forEach(mk=>migrationTried.delete(mk));status('error','Tarifas históricas conservadas aquí; no se pudo guardar su migración en nube. Puedes reintentar.');}}
    }
    function receive(raw,metadata={}) {
      if(blocked)return;
      if(metadata.fromCache&&!Object.keys(raw||{}).length){status('offline','Sin conexión; se conserva la copia local de esta cuenta');return;}
      try {
        const remote=C.validateBackup({config:raw?.config||defaults,data:raw?.data||{},schemaVersion:3},defaults,{remote:true});
        if(Object.keys(raw?.data||{}).some(mk=>!raw.data[mk].rateConfig)&&!storage.getItem(`horas-before-cloud-migration:${account}`))storage.setItem(`horas-before-cloud-migration:${account}`,JSON.stringify({config:raw.config||defaults,data:raw.data}));
        for(const [mk,r] of Object.entries(remote.data))if(!raw?.data?.[mk]?.rateConfig&&getState().data[mk]?.rateConfig){r.rateConfig=C.copy(getState().data[mk].rateConfig);r.historicalStatus=getState().data[mk].historicalStatus||'unknown';}
        if(!lastRemote && Object.keys(getState().data).length)recover('Antes de recibir la nube');
        const next=C.validateBackup(C.applyOps(remote,pending),defaults);
        // Persist the replacement before changing the visible state.
        storage.setItem(key(),JSON.stringify({payload:next,pending}));
        lastRemote=remote;apply(next);baseline=C.copy(next);onRemote();
        if(metadata.fromCache)status('offline','Copia de nube en caché; esperando conexión');
        else if(!pending.length)status('ok','Sincronizado');
        if(!metadata.fromCache)void migrateRates(raw,remote);void flush();
      }catch(e){status('error','Datos remotos no válidos. Se conserva la copia local.');}
    }
    function detach() {epoch++;if(unsub)unsub();unsub=null;sending=false;lastRemote=null;listenerFailed=false;migrationTried.clear();user=null;}
    function listen() {
      if(unsub)unsub();listenerFailed=false;
      const session=epoch,uid=user.uid;
      unsub=db.collection('users').doc(uid).onSnapshot({includeMetadataChanges:true},snap=>{
        if(epoch!==session || snap.metadata.hasPendingWrites)return;
        receive(snap.exists?snap.data():{},snap.metadata);
      },e=>{if(epoch===session){listenerFailed=true;status('error',e.code==='permission-denied'?'No hay permiso para leer Firestore. Puedes reintentar.':'No se pudo conectar a la nube. Puedes reintentar.');}});
    }
    function switchAccount(next) {
      if(next?.uid===user?.uid && (next||account==='guest'))return;
      // Persist the current account's journal before switching; failure stops the switch.
      try{if(baseline&&!blocked)persist();}catch(e){detach();pending=[];apply(blank());baseline=blank();blocked=true;status('error','No se pudo proteger la copia de la cuenta anterior. No se mezclaron datos.');throw e;}
      detach();user=next||null;account=next?.uid||'guest';load();
      if(!next){status('local','Guardado en este dispositivo');return;}
      status('syncing','Conectando a la nube…');listen();
    }
    async function retry() {
      if(blocked){status('error','Copia local protegida; exporta su original antes de continuar.');return;}
      if(!user){status('local','Guardado en este dispositivo');return;}
      if(!online){status('offline','Sin conexión; cambios guardados en este dispositivo');return;}
      const session=epoch,uid=user.uid;status('syncing','Comprobando la conexión a la nube…');
      try {
        const snap=await db.collection('users').doc(uid).get({source:'server'});if(session!==epoch)return;
        if(listenerFailed)listen();receive(snap.exists?snap.data():{},snap.metadata);await flush();
      }catch(e){if(session===epoch)status('error',e.code==='permission-denied'?'Firestore rechazó el permiso. Cambios conservados aquí.':'No se pudo conectar a la nube. Cambios conservados aquí.');}
    }
    async function pull() {
      if(!user)throw Error('Inicia sesión primero.');if(pending.length)throw Error('Espera a sincronizar los cambios pendientes antes de sustituirlos.');
      const session=epoch,snap=await db.collection('users').doc(user.uid).get({source:'server'});
      if(session!==epoch) return;if(!snap.exists)throw Error('No hay datos en la nube.');
      C.validateBackup({config:snap.data().config||defaults,data:snap.data().data||{}},defaults);
      recover('Antes de sustituir con la nube');receive(snap.data(),snap.metadata);
    }
    function setOnline(value){online=value;if(!value)status('offline','Sin conexión; cambios guardados en este dispositivo');else {status(!user?'local':pending.length?'pending':'syncing',!user?'Guardado en este dispositivo':'Conectando…');void flush();}}
    return {load,save,recover,switchAccount,pull,setOnline,flush,retry,receive,session:()=>epoch,account:()=>account,pending:()=>C.copy(pending),recovery:()=>storage.getItem(`horas-recovery:${account}`),isBlocked:()=>blocked,original:()=>storage.getItem(key())||(account==='guest'?storage.getItem('horas-original-v2'):null)};
  }
  root.HorasSync={create};
  if(typeof module!=='undefined')module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);

