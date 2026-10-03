import {safeText,careInput,makePrompt} from '../shared/ai-input.js';
import {randomUUID} from 'node:crypto';
import {normalizeAIResponse} from '../shared/ai-response.js';

class AIError extends Error{constructor(code){super(code);this.code=code;}}
function checkRequest(request){
  if(typeof request.auth?.uid!=='string'||!request.auth.uid||request.auth.uid.includes('/'))throw new AIError('unauthenticated');
  if(!request.app?.appId || request.app.alreadyConsumed)throw new AIError('failed-precondition');
  const data=request.data;
  if(!data || !['identify','review','photo'].includes(data.mode) || JSON.stringify(data).length>750000)throw new AIError('invalid-argument');
  if(data.mode!=='identify' && (typeof data.plantId!=='string'||!/^[\w-]{1,128}$/.test(data.plantId)))throw new AIError('invalid-argument');
  if(data.mode==='identify' && (!data.draft || typeof data.draft!=='object'||Array.isArray(data.draft)))throw new AIError('invalid-argument');
  if(data.photo!=null && (typeof data.photo!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.photo)||data.photo.length>650000))throw new AIError('invalid-argument');
  return data;
}
function googleAccountAllowed(user){return !user.disabled&&Array.isArray(user.providerData)&&user.providerData.some(p=>p.providerId==='google.com');}
function createAIHandler({store,generate,authorize=async()=>true,now=()=>Date.now(),dailyUserLimit=10,dailyGlobalLimit=200}){
  return async request=>{
    const data=checkRequest(request),uid=request.auth.uid,instant=now(),day=new Date(instant).toISOString().slice(0,10),lease=randomUUID();
    if(!await authorize(uid))throw new AIError('permission-denied');
    await store.reserve({uid,day,lease,now:instant,dailyUserLimit,dailyGlobalLimit});
    try{
      const plant=data.mode==='identify'?data.draft:await store.readPlant(uid,data.plantId);
      if(!plant)throw new AIError('not-found');
      if(data.mode==='identify' && !safeText(plant.name,160) && !data.photo)throw new AIError('invalid-argument');
      const savedPhoto=typeof plant.photo==='string' && plant.photo.length<=650000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(plant.photo)?plant.photo:null;
      const previousPhotos=data.mode==='photo'?(Array.isArray(plant.gallery)?plant.gallery:[]).slice(0,2).filter(e=>typeof e?.img==='string'&&e.img.length<=220000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(e.img)).map(e=>({img:e.img,date:safeText(e.date,10)})):[];
      const raw=await generate({prompt:makePrompt(data.mode,plant,data.context),photo:data.photo||savedPhoto,previousPhotos});
      try{return normalizeAIResponse(raw);}catch{throw new AIError('data-loss');}
    }catch(error){
      if(error instanceof AIError)throw error;
      throw new AIError('unavailable');
    }finally{
      // Failure to release a lease expires naturally; it never permits an extra call.
      try{await store.release({uid,day,lease});}catch{}
    }
  };
}
export {googleAccountAllowed,AIError,checkRequest,careInput,makePrompt,createAIHandler};
