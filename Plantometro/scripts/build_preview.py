"""Build an explicitly simulated, self-contained preview from the real UI modules.
No SDK, OAuth, production data or Gemini credential is included in this preview.
Run: python Plantometro/scripts/build_preview.py
"""
from pathlib import Path
import re
import base64
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
mock=r'''
// Preview adapters only: login, climate, activity and all garden writes are simulated.
if(!localStorage.getItem('pg3b_preview_settings'))localStorage.setItem('pg3b_preview_settings',JSON.stringify({name:'Frank',city:'Armilla',lat:37.14386,lon:-3.62534,theme:'light'}));
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:ok=>ok({coords:{latitude:37.14386,longitude:-3.62534}})},configurable:true});
const demoDate=days=>{const d=new Date();d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const demoAt=days=>new Date(Date.now()+days*86400000).toISOString();
let demoPlants=[{id:'bob-demo',name:'Bob',species:'Ficus elastica (ejemplo)',photo:DEMO_FICUS,loc:'Salón',light:'media',waterFreq:7,lastWater:demoDate(-84),history:[],gallery:[],createdAt:demoAt(-100)}, {id:'aloe-demo',name:'La de la ventana',species:'Haworthia (ejemplo)',photo:DEMO_PLANT,loc:'Terraza',light:'sol',waterFreq:14,lastWater:demoDate(-14),history:[],gallery:[],createdAt:demoAt(-80)}];
for(let i=0;i<8;i++)demoPlants.push({id:'ficus-demo-'+i,name:['El del balcón','La planta de Rosita','Ficus junto a la puerta','Un rincón verde','El pequeño del salón','La de las hojas grandes','Ficus de la terraza','El de la entrada'][i],species:'Ficus elastica (ejemplo)',photo:i%3===0?null:DEMO_FICUS,loc:i%2?'Salón':'Terraza',waterFreq:7,lastWater:demoDate(-i-1),history:[],gallery:[],createdAt:demoAt(-30)});
// Existing example records form a baseline, never a first-start novelty flood.
for(let i=2;i<demoPlants.length;i++){
 const p=demoPlants[i],author=i%2?'Frank':'Rosita',at=new Date(p.lastWater+'T12:00:00').toISOString();
 const event={id:'demo-existing-'+i,type:'watered',occurredAt:at,author,deviceId:'historical-preview',plantId:p.id,plantName:p.name,summary:'la regó'};
 p.lastActivity=event;p.history=[{t:'agua',date:p.lastWater,at,by:author,eventId:event.id}];
}
let demoJournal={events:demoPlants.map(p=>p.lastActivity).filter(Boolean)};
const demoAuth={currentUser:{uid:'preview-only',displayName:'Vista previa',email:'sin-cuenta-real'}};
let demoAuthChanged,demoSnapshot,demoActivitySnapshot;
const emitDemo=()=>{demoSnapshot?.({docs:demoPlants.map(p=>({data:()=>structuredClone(p)})),metadata:{hasPendingWrites:false,fromCache:false}});demoActivitySnapshot?.({data:()=>structuredClone(demoJournal),exists:()=>true,metadata:{hasPendingWrites:false,fromCache:false}});};
const initializeApp=()=>({});const getAuth=()=>demoAuth;
class GoogleAuthProvider{};
const getRedirectResult=async()=>null;
const onAuthStateChanged=(a,cb)=>{demoAuthChanged=cb;queueMicrotask(()=>cb(a.currentUser));};
const signInWithPopup=async()=>{demoAuth.currentUser={uid:'preview-only',displayName:'Vista previa'};demoAuthChanged(demoAuth.currentUser);};
const signInWithRedirect=signInWithPopup;
const signOut=async()=>{demoAuth.currentUser=null;demoAuthChanged(null);};
const initializeFirestore=()=>({});const persistentLocalCache=()=>({});const persistentMultipleTabManager=()=>({});
const collection=(...args)=>args;const doc=(...args)=>args;
const onSnapshot=(ref,options,cb,error)=>{if(typeof options==='function')cb=options;const activity=ref.at(-2)==='plantometroActivity';if(activity)demoActivitySnapshot=cb;else demoSnapshot=cb;queueMicrotask(emitDemo);return ()=>{if(activity)demoActivitySnapshot=null;else demoSnapshot=null;};};
const arrayUnion=(...values)=>({demoOp:'union',values});const arrayRemove=(...values)=>({demoOp:'remove',values});const serverTimestamp=()=>new Date().toISOString();
const demoFields=(original,fields)=>{const copy={...original};for(const [key,value] of Object.entries(fields)){if(value?.demoOp==='union'){const list=copy[key]||[];copy[key]=[...list,...value.values.filter(v=>!list.some(x=>JSON.stringify(x)===JSON.stringify(v)))];}else if(value?.demoOp==='remove')copy[key]=(copy[key]||[]).filter(x=>!value.values.some(v=>JSON.stringify(x)===JSON.stringify(v)));else copy[key]=structuredClone(value);}return copy;};
const demoApply=(kind,ref,fields,options)=>{if(ref.at(-2)==='plantometroActivity'){demoJournal=demoFields(demoJournal,fields);return;}const id=ref.at(-1),old=demoPlants.find(p=>p.id===id);if(kind==='delete'){demoPlants=demoPlants.filter(p=>p.id!==id);return;}if(kind==='update'&&!old)throw {code:'not-found'};demoPlants=demoPlants.filter(p=>p.id!==id).concat(demoFields(kind==='update'||options?.merge?old||{}:{},fields));};
const writeBatch=()=>{const pending=[];return {set:(r,p,o)=>pending.push(['set',r,p,o]),update:(r,p)=>pending.push(['update',r,p]),delete:r=>pending.push(['delete',r]),commit:async()=>{for(const entry of pending)demoApply(...entry);emitDemo();}};};
const runTransaction=async(db,callback)=>{const pending=[];await callback({get:async ref=>{const p=ref.at(-2)==='plantometroActivity'?demoJournal:demoPlants.find(p=>p.id===ref.at(-1));return {exists:()=>!!p,data:()=>structuredClone(p)};},set:(r,p,o)=>pending.push(['set',r,p,o]),update:(r,p)=>pending.push(['update',r,p])});for(const entry of pending)demoApply(...entry);emitDemo();};
let demoWeatherMode=window.previewInitialWeatherMode||'normal';
const fetch=async url=>{
 if(String(url).includes('geocoding-api'))return {ok:true,json:async()=>({results:[{name:'Armilla',latitude:37.14386,longitude:-3.62534,admin1:'Andalucía',country:'España'},{name:'Granada',latitude:37.1773,longitude:-3.5986,admin1:'Andalucía',country:'España'}]})};
 if(String(url).includes('bigdatacloud'))return {ok:true,json:async()=>({city:'Armilla (ubicación de ejemplo)'})};
 if(String(url).includes('open-meteo')){
  window.previewWeatherCalls=(window.previewWeatherCalls||0)+1;
  if(demoWeatherMode==='offline')throw Error('Servicio simulado sin conexión');
  const code={rain:63,snow:73,storm:95,hail:96}[demoWeatherMode]||2,wet=code!==2;
  const data={utc_offset_seconds:0,current:{time:new Date().toISOString(),temperature_2m:demoWeatherMode==='incomplete'?null:24,relative_humidity_2m:55,weather_code:2,wind_speed_10m:12,wind_gusts_10m:18},daily:{time:[new Date().toISOString().slice(0,10),demoDate(1)],weather_code:[code,2],precipitation_probability_max:[wet?80:10,20],precipitation_sum:[wet?5:0,0],snowfall_sum:[code===73?2:0,0],wind_speed_10m_max:[18,15],wind_gusts_10m_max:[demoWeatherMode==='wind'?70:27,22]}};
  if(demoWeatherMode==='wrong-location'){data.latitude=0;data.longitude=0;}
  if(demoWeatherMode==='old-observation')data.current.time='2020-01-01T00:00:00Z';
  return {ok:true,json:async()=>data};
 }
 throw Error('Servicio no simulado');
};
window.previewTest={state:()=>({plants:structuredClone(demoPlants),weather:structuredClone(forecast),events:structuredClone(demoJournal.events)}),checkWeather:()=>loadWeather(),setPlants:plants=>{demoPlants=structuredClone(plants);emitDemo();},setWeather:mode=>{demoWeatherMode=mode;lastAttempt=0;return refreshWeather();},otherAction:()=>{
 const p=demoPlants.find(p=>p.id==='bob-demo')||demoPlants[0];if(!p)return;
 const id=crypto.randomUUID(),at=new Date().toISOString(),event={id,type:'watered',occurredAt:at,author:'Rosita',deviceId:'other-simulated-device',plantId:p.id,plantName:p.name,summary:'la regó'};
 p.lastWater=demoDate(0);p.lastActivity=event;p.history=[{t:'agua',date:p.lastWater,at,by:'Rosita',eventId:id},...(p.history||[])];demoJournal.events.push(event);emitDemo();
}};
setTimeout(()=>{document.getElementById('preview-other')?.addEventListener('click',()=>window.previewTest.otherAction());document.getElementById('preview-rain')?.addEventListener('click',()=>window.previewTest.setWeather('rain'));document.getElementById('preview-normal')?.addEventListener('click',()=>window.previewTest.setWeather('normal'));},0);
'''
# Embedded sample photos keep the preview self-contained, including in a downloaded HTML.
photos='\n'.join('const '+constant+'='+repr('data:image/jpeg;base64,'+base64.b64encode((root/'preview-assets'/name).read_bytes()).decode())+';' for constant,name in [('DEMO_FICUS','ficus.jpg'),('DEMO_PLANT','plant.jpg')])
mock=photos+'\n'+mock
codes=[]
for name in ['utils','activity-model','weather-model','weather-effects','ai-input','ai-response','ai-config','ai-service','backup','settings','activity','sync','weather','plants','photos','camera','gemini','ui','app']:
    text=(root/('shared' if name in ['ai-response','ai-input'] else 'js')/f'{name}.js').read_text()
    text=re.sub(r'^import .*?;\s*','',text,flags=re.M)
    text=re.sub(r'^export \{[^}]*\};?\s*','',text,flags=re.M)
    if name=='sync':text=re.sub(r'const fbConfig = \{[\s\S]*?\};','const fbConfig = {};',text,count=1)
    if name=='activity-model':text=text.replace('pg3_device_id','pg3_preview_device_id')
    if name=='activity':text=text.replace('pg3_activity_read_','pg3_preview_activity_read_')
    if name=='weather':text=text.replace('pg3_weather_v1','pg3_preview_weather_v1')
    if name=='weather-effects':text=text.replace('pg3_weather_seen_v1','pg3_preview_weather_seen_v1')
    if name=='settings':text=text.replace('pg3b_settings','pg3b_preview_settings').replace('pg3_nickname_', 'pg3_preview_nickname_')
    if name=='ai-config':text=text.replace('enabled:false','enabled:true').replace("appCheckSiteKey:''","appCheckSiteKey:'public-demo'")
    if name=='ai-service':
        text=text[:text.index('let modelClient=')]+'''\nasync function callPlantAI(data){
          return normalizeAIResponse({resumen:'Consejos de ejemplo para esta planta.',consejo:'Observa la tierra y ajusta la frecuencia si lo necesitas.',confianza:'baja',motivo:'IA simulada: no se ha identificado tu foto ni consultado Gemini real.',sugerencias:{nombreComun:'Monstera (ejemplo)',especie:'Monstera deliciosa',ubicacion:'Interior luminoso (ejemplo)',revisarCadaDias:7,abonoCadaDias:null,luz:'media'},...(data.mode==='photo'?{analisis:{observado:'Ejemplo simulado: no se ha examinado esta foto.',causas:['Este ejemplo no identifica ninguna causa real.'],comprobar:['Comprueba cómo está la tierra antes de decidir.'],recomendacion:'Consulta real pendiente de activar; no cambies los cuidados por esta simulación.'}}:{})});
        }\n'''
        text=text.replace("'Ayuda opcional: revisa las sugerencias antes de guardar.'","'Ayuda con IA simulada en esta prueba.'")
    if name=='app':text=text.replace('startPWA(hasPendingWrites);','')
    codes.append(text)
html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
html=re.sub(r'<link rel="manifest"[^>]+>','',html)
html=re.sub(r'<link[^>]+(?:fonts.googleapis|fonts.gstatic)[^>]+>','',html)
html=html.replace('<script type="module" src="./js/pwa.js"></script>','')
# Some HTML viewers execute inline modules as classic scripts. Keep their
# lexical names (for example weather's `location`) isolated from window.
html=html.replace('<script type="module" src="./js/app.js"></script>','<script type="module">(()=>{\n'+mock+'\n'+ '\n'.join(codes)+'\n})();</script>')
html=html.replace('<div class="app-shell" id="app-shell">','<div class="app-shell" id="app-shell"><aside class="preview-notice">Vista previa · jardín de ejemplo<details><summary>Sobre esta prueba</summary><p>Datos, login, clima, actividad y Gemini simulados. No usa vuestro jardín ni claves reales. Bob es un ejemplo de un recordatorio de hace 77 días, visible en su ficha. Esta demostración no prueba Firebase de producción, push, avisos oficiales ni instalación PWA reales.</p><div class="preview-actions"><button id="preview-other">Simular un riego de Rosita</button><button id="preview-rain">Simular lluvia</button><button id="preview-normal">Tiempo normal</button></div></details></aside>')
html=html.replace('</style>','\n.app-shell{grid-template-rows:auto minmax(0,1fr) auto}.preview-notice{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 18px;padding:6px 18px;background:var(--surface2);color:var(--ink2);font:12px system-ui;line-height:1.5}.preview-notice summary{min-height:32px;padding:4px 0;font:inherit;text-decoration:underline;text-underline-offset:3px}.preview-notice summary::after{display:none}.preview-notice details[open]{width:min(100%,700px)}.preview-notice p{padding-bottom:10px}.preview-actions{display:flex;flex-wrap:wrap;gap:6px}.preview-actions button{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px}</style>',1)
(root/'preview.html').write_text(html)
print('Generated Plantometro/preview.html (simulated, self-contained)')
