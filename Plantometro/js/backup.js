import { dateNumber } from './utils.js';
function validDate(value, optional=false){return (optional && (value==null || value==='')) || (typeof value==='string' && Number.isFinite(dateNumber(value)));}
function validImage(value){return value==null || value==='' || (typeof value==='string' && /^(data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+|https?:\/\/[^\s"<>]+)$/.test(value));}
function validTimestamp(value){return value==null || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));}
function validatePlant(p){
  if(!p || typeof p!=='object'||Array.isArray(p))throw Error('Ficha inválida');
  if(typeof p.id!=='string'||!/^[\w-]{1,128}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>500)throw Error('Falta un identificador o nombre válido');
  if(!Number.isInteger(p.waterFreq)||p.waterFreq<1||p.waterFreq>120||!validDate(p.lastWater,true))throw Error('Frecuencia o fecha de riego inválida');
  for(const key of ['species','loc','desc','potSize','updatedBy'])if(p[key]!=null && typeof p[key]!=='string')throw Error('Texto inválido');
  if(p.light!=null && !['','sol','media','sombra'].includes(p.light))throw Error('Luz inválida');
  if(!validImage(p.photo)||!validDate(p.lastFert,true)||!validDate(p.potDate,true)||!validTimestamp(p.createdAt)||!validTimestamp(p.updatedAt))throw Error('Foto o fecha inválida');
  if(p.fertFreq!=null && (!Number.isInteger(p.fertFreq)||p.fertFreq<0||p.fertFreq>365))throw Error('Abono inválido');
  if(p.history!=null && (!Array.isArray(p.history)||p.history.some(h=>!h||!['agua','abono'].includes(h.t)||!validDate(h.date)|| (h.by!=null && typeof h.by!=='string'))))throw Error('Historial inválido');
  if(p.gallery!=null && (!Array.isArray(p.gallery)||p.gallery.some(g=>!g||!validDate(g.date)||!validImage(g.img)||typeof g.img!=='string'||!g.img || (g.note!=null && typeof g.note!=='string'))))throw Error('Diario inválido');
  if(new TextEncoder().encode(JSON.stringify(p)).length>850000)throw Error('Ficha demasiado grande');
}
function validateBackup(value){
  if(!Array.isArray(value) && (value?.app!=='plantometro'||value.v!==3))throw Error('Formato de copia no reconocido');
  const list=Array.isArray(value)?value:value.plants;
  if(!Array.isArray(list)||!list.length||list.length>400)throw Error('La copia debe contener entre 1 y 400 plantas');
  const ids=new Set();
  for(const p of list){validatePlant(p);if(ids.has(p.id))throw Error('Hay identificadores duplicados');ids.add(p.id);}
  return JSON.parse(JSON.stringify(list));
}
export {validateBackup,validatePlant};
