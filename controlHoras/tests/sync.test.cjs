const test=require('node:test'),assert=require('node:assert/strict');global.HorasCore=require('../core.js');const C=HorasCore,{create}=require('../sync.js');
const defaults={userName:'',hideMoney:false,rateNormal:10,plusFestivo:5,rateExtra:20,profile:'ett',sintaxUnlocked:false,deductions:[]},blank=()=>({schemaVersion:3,config:C.copy(defaults),data:{}}),tick=()=>new Promise(r=>setImmediate(r));
function server(){const docs=new Map(),listeners=[],writes=[];let deny=false,hold=null,denyRead=false;
 const emit=uid=>listeners.filter(x=>x.uid===uid).forEach(x=>x.cb({exists:docs.has(uid),data:()=>C.copy(docs.get(uid)),metadata:{hasPendingWrites:false,fromCache:false}}));
 const db={collection:()=>({doc:uid=>({onSnapshot(opts,cb,error){const l={uid,cb,error};listeners.push(l);queueMicrotask(()=>emit(uid));return()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);};},async set(p,{mergeFields}){if(deny)throw {code:'permission-denied'};if(hold)await hold;const ops=mergeFields.map(f=>{let v=p;for(const k of f.parts)v=v[k];return {path:f.parts,value:v};});docs.set(uid,C.applyOps(docs.get(uid)||blank(),ops));writes.push({uid,ops});emit(uid);},async get(){if(denyRead)throw {code:'permission-denied'};return {exists:docs.has(uid),data:()=>C.copy(docs.get(uid)),metadata:{fromCache:false}};}})})};
 return {db,docs,writes,emit,deny:v=>deny=v,hold:v=>hold=v,denyRead:v=>denyRead=v,failListen:uid=>{for(const l of [...listeners].filter(l=>l.uid===uid)){listeners.splice(listeners.indexOf(l),1);l.error({code:'permission-denied'});}}};}
function device(s,store=new Map()){let p=blank(),statuses=[];const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};const engine=create({defaults,getState:()=>p,apply:x=>p=x,onStatus:(...x)=>statuses.push(x),storage,db:s.db,FieldPath:class{constructor(...parts){this.parts=parts;}}});engine.load();return {engine,store,statuses,get p(){return p;},edit(day,h){p.data['2026-10']||={days:{},rateConfig:C.financial(defaults),historicalStatus:'confirmed'};p.data['2026-10'].days[day]=h===null?null:{type:'normal',hours:h};engine.save();}};}
async function login(d,uid='one'){d.engine.switchAccount({uid});await tick();}
test('failed local write rolls back state and journal; reconnection sends only previously saved work',async()=>{
 const s=server(),a=device(s);await login(a);a.engine.setOnline(false);a.edit(1,8);
 const raw=a.store.get('horas-app-v3:one'),pending=a.engine.pending();
 a.store.set=(k,v)=>{if(k==='horas-app-v3:one')throw Error('Storage full');return Map.prototype.set.call(a.store,k,v);};
 assert.throws(()=>a.edit(2,9),/Storage full/);assert.equal(a.p.data['2026-10'].days[2],undefined);
 assert.deepEqual(a.engine.pending(),pending);assert.equal(a.store.get('horas-app-v3:one'),raw);assert.equal(a.statuses.at(-1)[0],'error');
 delete a.store.set;a.engine.setOnline(true);await tick();await tick();assert.equal(s.docs.get('one').data['2026-10'].days[1].hours,8);assert.equal(s.docs.get('one').data['2026-10'].days[2],undefined);
});
test('invalid local edit cannot survive validation failure or enter the synchronization journal',async()=>{
 const s=server(),a=device(s);await login(a);assert.throws(()=>a.edit(1,25),/Jornada no válida/);assert.deepEqual(a.p.data,{});assert.equal(a.engine.pending().length,0);await tick();assert.equal(s.writes.length,0);
});
test('empty cached document cannot replace saved account settings even without recorded days',async()=>{
 const s=server(),a=device(s);await login(a);a.p.config.rateNormal=25;a.engine.save();await tick();await tick();
 const raw=a.store.get('horas-app-v3:one');a.engine.receive({}, {fromCache:true});assert.equal(a.p.config.rateNormal,25);assert.equal(a.store.get('horas-app-v3:one'),raw);assert.equal(a.statuses.at(-1)[0],'offline');
});
test('two simulated devices preserve independent simultaneous days',async()=>{const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.edit(1,8);b.edit(2,9);await tick();await tick();assert.equal(s.docs.get('one').data['2026-10'].days[1].hours,8);assert.equal(s.docs.get('one').data['2026-10'].days[2].hours,9);assert.deepEqual(a.p.data,b.p.data);assert.equal(a.engine.pending().length,0);});
test('offline edits survive restart; remote updates cannot overwrite pending work',async()=>{const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.engine.setOnline(false);a.edit(1,7);b.edit(2,10);await tick();assert.equal(a.p.data['2026-10'].days[1].hours,7);const restarted=device(s,a.store);restarted.engine.setOnline(false);await login(restarted);assert.equal(restarted.p.data['2026-10'].days[1].hours,7);assert.equal(restarted.p.data['2026-10'].days[2].hours,10);restarted.engine.setOnline(true);await tick();await tick();assert.equal(s.docs.get('one').data['2026-10'].days[1].hours,7);});
test('edit vs deletion uses last server commit; tombstone does not resurrect on reconnect',async()=>{const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.edit(1,8);await tick();b.engine.setOnline(false);b.edit(2,6);a.edit(1,null);await tick();b.engine.setOnline(true);await tick();assert.equal(s.docs.get('one').data['2026-10'].days[1],null);b.edit(1,9);await tick();assert.equal(s.docs.get('one').data['2026-10'].days[1].hours,9);a.edit(1,null);await tick();assert.equal(b.p.data['2026-10'].days[1],null);});
test('denied writes stay journaled without automatic unlimited retries',async()=>{const s=server(),a=device(s);await login(a);s.deny(true);a.edit(1,8);await tick();assert.equal(a.engine.pending().length,3);assert.equal(a.statuses.at(-1)[0],'error');s.deny(false);await a.engine.flush();await tick();assert.equal(a.engine.pending().length,0);assert.equal(s.docs.get('one').data['2026-10'].days[1].hours,8);});
test('switching accounts and stale acknowledgement cannot mix journals or data',async()=>{const s=server(),a=device(s);await login(a);let release;s.hold(new Promise(r=>release=r));a.edit(1,8);await login(a,'two');assert.deepEqual(a.p.data,{});release();await tick();await tick();assert.deepEqual(a.p.data,{});assert.equal(s.docs.has('two'),false);await login(a,'one');assert.equal(a.p.data['2026-10'].days[1].hours,8);a.engine.switchAccount(null);assert.deepEqual(a.p.data,{});});
test('cloud pull protects old local data and rejects pending local changes',async()=>{const s=server(),a=device(s);await login(a);a.engine.setOnline(false);a.edit(1,8);await assert.rejects(a.engine.pull(),/pendientes/);a.engine.setOnline(true);await tick();await tick();await a.engine.pull();assert(a.engine.recovery());});
test('legacy local copy is preserved and never implicitly uploaded to another account',async()=>{const s=server(),raw=JSON.stringify({...blank(),data:{'2026-10':{days:{1:{type:'normal',hours:8}}}}}),store=new Map([['horas-app-v2',raw]]),a=device(s,store);assert.equal(a.p.data['2026-10'].days[1].hours,8);assert.equal(store.get('horas-original-v2'),raw);await login(a);assert.deepEqual(a.p.data,{});assert.equal(s.writes.length,0);a.engine.switchAccount(null);assert.equal(a.p.data['2026-10'].days[1].hours,8);});

test('bad legacy migration is preserved exactly and locked against accidental replacement',()=>{const s=server(),raw=JSON.stringify({config:defaults,data:{'2026-02':{days:{30:{type:'normal',hours:8}}}}}),store=new Map([['horas-app-v2',raw]]);let p=blank();const e=create({defaults,getState:()=>p,apply:x=>p=x,onStatus(){},storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},db:s.db,FieldPath:class{}});assert.throws(()=>e.load());assert.equal(store.get('horas-original-v2'),raw);assert.throws(()=>e.save(),/protegida/);assert(!store.has('horas-app-v3:guest'));});
test('remote invalid dates do not replace valid local state',async()=>{const s=server(),a=device(s);await login(a);a.edit(1,8);await tick();const before=C.copy(a.p);a.engine.receive({config:defaults,data:{'2026-02':{days:{30:{type:'normal',hours:8}}}}});assert.deepEqual(a.p,before);assert.equal(a.statuses.at(-1)[0],'error');});
test('missing cached snapshot cannot erase saved account records while offline',async()=>{const s=server(),a=device(s);await login(a);a.edit(1,8);await tick();const store=new Map(a.store),restored=device(s,store);restored.engine.setOnline(false);await login(restored);restored.engine.receive({}, {fromCache:true});assert.equal(restored.p.data['2026-10'].days[1].hours,8);});
test('record and separate config fields survive simultaneous changes',async()=>{const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.p.config.userName='fictional';a.engine.save();b.p.config.rateExtra=19;b.engine.save();a.edit(2,7);await tick();await tick();assert.equal(s.docs.get('one').config.userName,'fictional');assert.equal(s.docs.get('one').config.rateExtra,19);assert.equal(b.p.data['2026-10'].days[2].hours,7);});

test('manual retry restores a failed snapshot listener and preserves pending work without automatic retry loops',async()=>{
 const s=server(),a=device(s),b=device(s);await login(a);await login(b);s.failListen('one');s.denyRead(true);a.engine.setOnline(false);a.edit(1,8);a.engine.setOnline(true);await a.engine.retry();assert.equal(a.statuses.at(-1)[0],'error');
 s.denyRead(false);await a.engine.retry();await tick();await tick();await b.engine.retry();await tick();b.edit(2,9);await tick();await tick();assert.equal(a.p.data['2026-10'].days[1].hours,8);assert.equal(a.p.data['2026-10'].days[2].hours,9);assert.equal(a.engine.pending().length,0);
});
test('a failed rate migration can be retried explicitly without overwriting existing period rates',async()=>{
 const s=server();s.docs.set('one',{config:C.copy(defaults),data:{'2026-09':{days:{1:{type:'normal',hours:8}}}}});let calls=0;
 s.db.runTransaction=async fn=>{if(++calls===1)throw Error('Temporary failure');await fn({get:async()=>({exists:true,data:()=>C.copy(s.docs.get('one'))}),set:(ref,patch,{mergeFields})=>{const ops=mergeFields.map(f=>{let value=patch;for(const k of f.parts)value=value[k];return {path:f.parts,value};});s.docs.set('one',C.applyOps(s.docs.get('one'),ops));s.emit('one');}});};
 const a=device(s);await login(a);await tick();assert.equal(a.statuses.at(-1)[0],'error');assert.equal(calls,1);assert(!s.docs.get('one').data['2026-09'].rateConfig);await a.engine.retry();await tick();await tick();assert.equal(calls,2);assert.equal(s.docs.get('one').data['2026-09'].rateConfig.rateNormal,10);assert.equal(a.p.data['2026-09'].historicalStatus,'unknown');assert(a.store.has('horas-before-cloud-migration:one'));
});

test('different payroll concepts, scalar totals and days commute across devices without replacing the month',async()=>{
 const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.edit(1,8);await tick();await tick();
 a.engine.setOnline(false);b.engine.setOnline(false);
 a.p.data['2026-10'].payroll={...C.emptyPayroll(),gross:125,incomes:{base:{name:'Base',kind:'base',amount:125}}};a.engine.save();
 b.p.data['2026-10'].payroll={...C.emptyPayroll(),net:110,deductions:{irpf:{name:'IRPF',kind:'irpf',base:125,pct:12,amount:15}}};b.engine.save();
 a.engine.setOnline(true);b.engine.setOnline(true);await tick();await tick();await tick();
 const p=s.docs.get('one').data['2026-10'].payroll;assert.equal(p.gross,125);assert.equal(p.net,110);assert.equal(p.incomes.base.amount,125);assert.equal(p.deductions.irpf.amount,15);assert.equal(b.p.data['2026-10'].days[1].hours,8);
 assert(s.writes.flatMap(w=>w.ops).filter(o=>o.path[2]==='payroll').every(o=>o.path.length>=4));
});
test('payroll tombstones and partial null fields survive offline restart and cannot be resurrected by other edits',async()=>{
 const s=server(),a=device(s),b=device(s);await login(a);await login(b);a.edit(1,8);await tick();a.p.data['2026-10'].payroll={...C.emptyPayroll(),gross:0,incomes:{deleted:{name:'Otro',kind:'other',amount:2}}};a.engine.save();await tick();await tick();
 b.engine.setOnline(false);b.p.data['2026-10'].payroll.net=0;b.engine.save();const restored=device(s,b.store);restored.engine.setOnline(false);await login(restored);
 a.p.data['2026-10'].payroll.incomes.deleted=null;a.engine.save();await tick();restored.engine.setOnline(true);await tick();await tick();
 assert.equal(s.docs.get('one').data['2026-10'].payroll.incomes.deleted,null);assert.equal(restored.p.data['2026-10'].payroll.net,0);assert.equal(restored.p.data['2026-10'].payroll.received,null);
});
test('storage failure rolls back real payroll and does not enqueue financial writes',async()=>{
 const s=server(),a=device(s);await login(a);a.edit(1,8);await tick();await tick();const before=C.copy(a.p),count=s.writes.length;
 a.store.set=(k,v)=>{if(k==='horas-app-v3:one')throw Error('Full');return Map.prototype.set.call(a.store,k,v);};a.p.data['2026-10'].payroll={...C.emptyPayroll(),gross:123};assert.throws(()=>a.engine.save(),/Full/);assert.deepEqual(a.p,before);await tick();assert.equal(s.writes.length,count);
});
