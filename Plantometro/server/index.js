import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createAIHandler,AIError} from './core.js';
import {createStore} from './store.js';
import {createVertex} from './vertex.js';

initializeApp();
const db=getFirestore(),quotaDb=getFirestore('plantometro-ai');
let handler;
export const plantometroAI=onCall({region:'europe-west1',serviceAccount:'plantometro-ai@mishoras-bb0cc.iam.gserviceaccount.com',enforceAppCheck:true,consumeAppCheckToken:true,
  cors:['https://franoo1.github.io'],maxInstances:2,concurrency:8,timeoutSeconds:60,memory:'256MiB'},async request=>{
  try{
    handler ||= createAIHandler({store:createStore(db,{quotaDb}),generate:createVertex({project:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT}),
      authorize:async uid=>{const user=await getAuth().getUser(uid);return !user.disabled&&user.customClaims?.plantometroAI===true;}});
    return await handler(request);
  }catch(error){
    const code=error instanceof AIError?error.code:'unavailable';
    const allowed=['unauthenticated','permission-denied','failed-precondition','invalid-argument','not-found','resource-exhausted','deadline-exceeded','data-loss','unavailable'];
    throw new HttpsError(allowed.includes(code)?code:'unavailable','La consulta no se pudo completar.');
  }
});
