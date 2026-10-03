// Public deployment switches only. App Check's site key is public, never a Gemini key.
const aiConfig=Object.freeze({enabled:false,provider:'firebase-ai',model:'gemini-3.1-flash-lite',region:'europe-west1',functionName:'plantometroAI',appCheckSiteKey:''});
export {aiConfig};
