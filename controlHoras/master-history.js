/* Reconstructable, account-isolated derived cache. Originals remain the only editable/synced source. */
(function(root){
 'use strict';
 const C=root.HorasCore||(typeof require==='function'?require('./core.js'):null),R=root.HorasReports||(typeof require==='function'?require('./reports.js'):null),H=root.HorasAIHistory||(typeof require==='function'?require('./ai-history.js'):null);
 const VERSION=1,DB='mis-horas-historial-maestro',STORE='cuentas';
 const source=p=>({schemaVersion:3,config:{...C.copy(p.config),hideMoney:false},data:C.copy(p.data)});
 const same=(a,b)=>JSON.stringify(source(a))===JSON.stringify(source(b));
 function build(p,account,availability,revision=1,now=new Date().toISOString()){
  const originals=source(p),periods=R.available(originals.data,originals.config).sort(),models=periods.map(period=>R.month(originals.data,originals.config,period,{generatedAt:now})),years=[...new Set(periods.map(k=>+k.slice(0,4)))];
  const first=periods[0]||null,last=periods.at(-1)||null;
  const index={...H.catalog(originals.data,originals.config),knownMonths:periods,sourceVersion:revision};
  let total=null;if(first){const [y,m]=last.split('-').map(Number);total=H.query(originals.data,originals.config,{clarification:null,groups:[{label:'Historial completo',from:first+'-01',to:last+'-'+C.dim(y,m-1)}],metrics:['hours','normalHours','holidayHours','restDays','workDays','extraHours','nightHours','realPayroll','estimates','rates'],operation:'sum',detail:false},{...availability,complete:true});}
  if(total)total.availability.complete=availability.complete===true;
  return {kind:'mis-horas-master',schemaVersion:VERSION,account,sourceVersion:revision,updatedAt:now,coverage:{from:first,to:last,months:periods.length,complete:availability.complete===true,source:availability.source,sourceUpdatedAt:availability.updatedAt||null,pendingChanges:!!availability.pendingChanges},provenance:{originals:'Registros originales de la cuenta; sincronizados en users/{uid}',calculations:'HorasCore y HorasReports, los mismos cálculos de pantallas/PDF',payroll:'Nóminas introducidas; diferentes de estimaciones',missing:'No se reconstruyen jornadas inexistentes ni tarifas históricas desconocidas',paymentPeriod:'Se conserva la imputación común de Sintax y del periodo de cobro; no confirma el abono real'},originals,index,months:models,years:years.map(y=>R.year(originals.data,originals.config,y,{generatedAt:now})),total,missing:models.filter(m=>!m.historicalConfirmed).map(m=>({period:m.period,reason:m.hasHistoricalRates?'Parámetros históricos sin confirmar':'Tarifas históricas no registradas; referencia actual disponible'}))};
 }
 function disk(){
  let db;
  async function database(){if(!db)db=new Promise((resolve,reject)=>{const req=root.indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('No se pudo abrir el archivo maestro en este dispositivo.'));req.onblocked=()=>reject(Error('El archivo maestro está ocupado. Cierra otra ventana de Mis Horas y vuelve a abrir.'));});return db;}
  async function operation(mode,key,value){if(!root.indexedDB){const name='horas-master-v1:'+encodeURIComponent(key);if(mode==='readonly'){const raw=root.localStorage.getItem(name);return raw?JSON.parse(raw):null;}root.localStorage.setItem(name,JSON.stringify(value));return;}
   const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode),req=mode==='readonly'?tx.objectStore(STORE).get(key):tx.objectStore(STORE).put(value,key);let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('No se pudo guardar el archivo maestro. Los registros originales se conservan.'));});}
  return {read:account=>operation('readonly',account),write:(account,value)=>operation('readwrite',account,value)};
 }
 function create({current,storage=disk()}){
  const memory=new Map(),queues=new Map(),sequence=new Map();
  function update(){const input=current();if(input.blocked)return Promise.reject(Error('La copia original está protegida; no se reemplaza el archivo maestro.'));const account=input.account,p=source(input.payload),availability=C.copy(input.availability),seq=(sequence.get(account)||0)+1;sequence.set(account,seq);
   const pending=(queues.get(account)||Promise.resolve()).catch(()=>{}).then(async()=>{if(sequence.get(account)!==seq)return memory.get(account);let prev=memory.get(account);if(!prev){try{prev=await storage.read(account);}catch{}if(prev?.schemaVersion!==VERSION||prev?.account!==account)prev=null;}
    if(!availability.complete){if(prev)memory.set(account,prev);throw Error('El historial de esta cuenta está incompleto; se conserva el archivo maestro completo hasta recuperar los registros.');}
    const equal=prev&&same(prev.originals,p),version=equal?prev.sourceVersion:(prev?.sourceVersion||0)+1;
    const master=equal&&prev.coverage.complete===availability.complete?{...prev,index:{...prev.index,today:H.catalog(p.data,p.config).today},coverage:{...prev.coverage,source:availability.source,sourceUpdatedAt:availability.updatedAt||null,pendingChanges:!!availability.pendingChanges}}:build(p,account,availability,version);
    if(sequence.get(account)!==seq)return memory.get(account);await storage.write(account,master);memory.set(account,master);return C.copy(master);
   });queues.set(account,pending);return pending;
  }
  async function ensure(){for(let attempt=0;attempt<3;attempt++){const account=current().account;await update();await queues.get(account);const m=memory.get(account),input=current();if(input.account!==account)throw Error('La cuenta cambió durante la consulta.');if(m&&same(m.originals,input.payload))return C.copy(m);}throw Error('Los registros están cambiando. Espera a que terminen de guardarse y vuelve a consultar.');}
  async function execute(name,args,{redact=x=>String(x)}={}){const m=await ensure();if(!m.coverage.complete)throw Error('No se ha recuperado el historial completo de esta cuenta.');if(!['consultar_periodo','totales','comparar_periodos','detalle'].includes(name))throw Error('Consulta del archivo maestro no admitida.');const plan=H.normalizePlan(args.plan);if(name==='detalle')plan.detail=true;if(name==='comparar_periodos')plan.operation='compare';const result=H.query(m.originals.data,m.originals.config,plan,{complete:true,source:m.coverage.source,updatedAt:m.coverage.sourceUpdatedAt,pendingChanges:m.coverage.pendingChanges},{redact});
   if(args.includeNotes&&plan.detail)result.limits=result.limits.replace('Los resúmenes no incluyen notas libres ni identificadores.','Solo se incluyen las notas del detalle expresamente solicitado, con redacción de identificadores conocidos.');
   if(args.includeNotes&&plan.detail)for(const group of result.groups)for(const day of group.dailyDetail.entries){const [y,mo,d]=day.date.split('-');day.notes=redact(m.originals.data[y+'-'+mo]?.days[+d]?.notes||'');}
   return {name,masterSchemaVersion:VERSION,sourceVersion:m.sourceVersion,updatedAt:m.updatedAt,result};}
  return {update,ensure,execute,index:async()=>{const m=await ensure();return C.copy(m.index);},exportJSON:async()=>JSON.stringify(await ensure(),null,2),unchanged:m=>m.account===current().account&&same(m.originals,current().payload)};
 }
 const api={VERSION,DB,STORE,source,same,build,create};root.HorasMaster=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
