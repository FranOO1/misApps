// Shared actions are descriptions by a local nickname, not verified identities.
const ACTIVITY_LIMIT=80;
const ACTIVITY_HARD_LIMIT=120;
const ACTIONS={created:'añadió la planta',edited:'actualizó la ficha',watered:'la regó',corrected:'corrigió un riego',fertilized:'añadió abono',deleted:'eliminó la planta',photoAdded:'añadió una foto',photoRemoved:'quitó una foto',restored:'restauró una copia'};
function deviceId(){
  try{let id=localStorage.getItem('pg3_device_id');if(id)return id;id=crypto.randomUUID();localStorage.setItem('pg3_device_id',id);return id;}catch{return crypto.randomUUID();}
}
function makeActivity(type,plant,author,device,id=crypto.randomUUID(),extra={}){
  if(!ACTIONS[type])throw Error('unknown-activity');
  const name=String(plant?.name||'Tu jardín').slice(0,160);
  return {id,type,occurredAt:new Date().toISOString(),author:String(author||'Alguien').trim().slice(0,20)||'Alguien',deviceId:device,plantId:String(plant?.id||''),plantName:name,summary:ACTIONS[type],...extra};
}
function validActivity(e){
  return !!e&&typeof e==='object'&&typeof e.id==='string'&&e.id.length<=100&&e.id.length>0&&!!ACTIONS[e.type]&&typeof e.author==='string'&&e.author.length<=20&&typeof e.deviceId==='string'&&typeof e.plantId==='string'&&typeof e.plantName==='string'&&e.plantName.length<=160&&typeof e.occurredAt==='string'&&Number.isFinite(Date.parse(e.occurredAt));
}
function recentActivities(events){
  const seen=new Set();return (Array.isArray(events)?events:[]).slice().reverse().filter(e=>validActivity(e)&&!seen.has(e.id)&&seen.add(e.id)).slice(0,ACTIVITY_LIMIT);
}
function shortActivityDate(value,now=new Date()){
  const date=new Date(value);if(!Number.isFinite(+date))return 'fecha no registrada';
  const day=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const delta=Math.round((day(now)-day(date))/86400000);
  if(delta===0)return 'hoy';if(delta===1)return 'ayer';
  return date.toLocaleDateString('es-ES',{day:'numeric',month:'short',...(date.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})});
}
function activityLine(plant){
  const e=plant?.lastActivity;
  if(validActivity(e))return `${e.author} ${ACTIONS[e.type]} · ${shortActivityDate(e.occurredAt)}`;
  // Older history is retained and shown honestly, without inferring an author.
  const h=sortHistory(plant?.history).find(h=>h.t==='agua'||h.t==='abono');
  if(!h)return plant?.updatedAt?`Ficha actualizada${plant.updatedBy?' por '+plant.updatedBy:' sin apodo'} · ${shortActivityDate(plant.updatedAt)}`:'Aún sin actividad registrada';
  const action=h.t==='agua'?'la regó':'añadió abono';
  return h.by?`${h.by} ${action} · ${shortActivityDate(h.at||h.date+'T12:00:00')}`:`${h.t==='agua'?'Riego':'Abono'} sin apodo · ${shortActivityDate(h.at||h.date+'T12:00:00')}`;
}
function sortHistory(history){
  return (Array.isArray(history)?history:[]).map((h,i)=>({h,i,at:Date.parse(h.at||h.date+'T12:00:00')||0})).sort((a,b)=>b.at-a.at||a.i-b.i).map(x=>x.h);
}
function updateReadState(state,events,device){
  const ids=events.map(e=>e.id),known=new Set(state?.known||[]),unread=new Set(state?.unread||[]);
  if(!state?.initialized)return {initialized:true,known:ids,unread:[]};
  for(const e of events)if(!known.has(e.id)&&e.deviceId!==device)unread.add(e.id);
  return {initialized:true,known:[...new Set([...ids,...known])].slice(0,240),unread:ids.filter(id=>unread.has(id))};
}
export {ACTIVITY_LIMIT,ACTIVITY_HARD_LIMIT,ACTIONS,deviceId,makeActivity,validActivity,recentActivities,shortActivityDate,activityLine,sortHistory,updateReadState};
