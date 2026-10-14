import {doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {$,esc} from './utils.js';
import {openModal,closeModal,openDetail,render,toast} from './ui.js';
import {ACTIVITY_LIMIT,ACTIONS,deviceId,recentActivities,shortActivityDate,updateReadState} from './activity-model.js';
const localDeviceId=deviceId();
let activities=[],uid=null,unsubscribe=null,session=0,readState={initialized:false,known:[],unread:[]},status='loading',pruning=false;
const readKey=id=>'pg3_activity_read_'+id;
function loadReadState(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.known)||!Array.isArray(value.unread))return {initialized:false,known:[],unread:[]};
  const ids=x=>x.filter(id=>typeof id==='string'&&id.length<=100).slice(0,240);return {initialized:value.initialized===true,known:ids(value.known),unread:ids(value.unread).slice(0,80)};
}
function saveReadState(){if(uid)try{localStorage.setItem(readKey(uid),JSON.stringify(readState));}catch{}}
function stopActivity(){session++;unsubscribe?.();unsubscribe=null;uid=null;activities=[];readState={initialized:false,known:[],unread:[]};status='loading';renderActivity();}
function startActivity(fs,account){
  stopActivity();uid=account;const token=session;
  try{readState=loadReadState(JSON.parse(localStorage.getItem(readKey(uid))||'null'));}catch{}
  const ref=doc(fs,'users',uid,'plantometroActivity','recent');
  unsubscribe=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
    if(token!==session)return;
    // A local pending batch is not a confirmed announcement to the other person.
    if(snap.metadata.hasPendingWrites)return;
    const raw=snap.data()?.events||[];activities=recentActivities(raw);
    status=snap.metadata.fromCache?'cached':'ready';
    if(!snap.metadata.fromCache){readState=updateReadState(readState,activities,localDeviceId);saveReadState();}
    renderActivity();render();
    if(!snap.metadata.fromCache&&raw.length>ACTIVITY_LIMIT&&!pruning){
      pruning=true;
      runTransaction(fs,async tx=>{
        const current=await tx.get(ref),events=current.data()?.events;
        if(Array.isArray(events)&&events.length>ACTIVITY_LIMIT)tx.update(ref,{events:events.slice(-ACTIVITY_LIMIT),updatedAt:serverTimestamp()});
      }).catch(()=>{/* Hard limit in the scoped rule prevents unlimited growth. */}).finally(()=>{pruning=false;});
    }
  },error=>{
    if(token!==session)return;
    status=error.code==='permission-denied'?'denied':'unavailable';renderActivity();
  });
}
function markActivityRead(id){
  readState.unread=readState.unread.filter(x=>id&&x!==id);saveReadState();renderActivity();
}
function openActivity(){renderActivity();openModal('activity-modal');}
function renderActivity(){
  const unread=new Set(readState.unread),count=activities.filter(e=>unread.has(e.id)).length;
  $('activity-badge').hidden=count===0;$('activity-badge').textContent=String(count);
  $('activity-btn').setAttribute('aria-label',count?`Actividad: ${count} ${count===1?'novedad sin leer':'novedades sin leer'}`:'Actividad, sin novedades');
  const messages={loading:'Cargando la actividad…',ready:'Cambios recientes del jardín. Los apodos los elige cada persona.',cached:'Sin conexión · última actividad guardada en este dispositivo.',denied:'La actividad no tiene permiso para sincronizarse. Las plantas se conservan; hay que revisar el acceso.',unavailable:'La actividad no está disponible ahora. Los cambios no se anuncian hasta confirmarse.'};
  $('activity-status').textContent=messages[status];$('activity-read-all').hidden=count===0;
  $('activity-list').innerHTML=activities.length?activities.map(e=>`<li class="activity-item ${unread.has(e.id)?'unread':''}"><button type="button" data-activity="${esc(e.id)}"><span class="activity-name">${esc(e.plantName)}</span><span>${esc(e.author)} ${esc(ACTIONS[e.type])}</span><span class="activity-time">${esc(shortActivityDate(e.occurredAt))} · ${esc(new Date(e.occurredAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}))} · ${unread.has(e.id)?'Nueva':'Leída'}</span></button></li>`).join(''):'<li class="activity-empty">Aún no hay cambios recientes. Aquí verás lo que cuidáis juntos.</li>';
  $('activity-list').querySelectorAll('[data-activity]').forEach(button=>button.onclick=()=>{
    const event=activities.find(e=>e.id===button.dataset.activity);if(!event)return;markActivityRead(event.id);
    if(event.type==='deleted'){toast('Esta planta se eliminó. El cambio queda en la actividad reciente.');return;}
    if(event.plantId){closeModal('activity-modal');openDetail(event.plantId);} // A deleted/missing plant is never recreated.
  });
}
function renderPlantActivity(id){
  const list=activities.filter(e=>e.plantId===id).slice(0,12);
  $('d-activity').innerHTML=list.length?'<h3 class="history-label">Últimos cambios</h3>'+list.map(e=>`<p class="plant-change">${esc(e.author)} ${esc(ACTIONS[e.type])}<span>${esc(new Date(e.occurredAt).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'}))}</span></p>`).join(''):'';
}
window.addEventListener?.('storage',event=>{
  if(uid&&event.key===readKey(uid))try{readState=loadReadState(JSON.parse(event.newValue));renderActivity();}catch{}
});
window.addEventListener?.('offline',()=>{if(uid){status='cached';renderActivity();}});
export {activities,localDeviceId,startActivity,stopActivity,openActivity,markActivityRead,renderActivity,renderPlantActivity};
