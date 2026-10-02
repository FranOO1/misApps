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
// Preview adapters only: all garden, login, climate and Gemini data are simulated.
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:ok=>ok({coords:{latitude:37.17,longitude:-3.59}})},configurable:true});
const Notification={permission:'denied',requestPermission:async()=> 'denied'};
const demoDate=(days)=>{const d=new Date();d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
let demoPlants=[{id:'bob-demo',name:'Bob',species:'Ficus elastica (ejemplo)',photo:DEMO_FICUS,loc:'Salón',light:'media',waterFreq:7,lastWater:demoDate(-84),history:[],gallery:[],createdAt:new Date().toISOString()}, {id:'aloe-demo',name:'La de la ventana',species:'Haworthia (ejemplo)',photo:DEMO_PLANT,loc:'Terraza',light:'sol',waterFreq:14,lastWater:demoDate(-14),history:[],gallery:[],createdAt:new Date().toISOString()}];
const demoAuth={currentUser:{uid:'preview-only',displayName:'Vista previa',email:'sin-cuenta-real'}};
let demoAuthChanged, demoSnapshot;
const emitDemo=()=>demoSnapshot?.({docs:demoPlants.map(p=>({data:()=>JSON.parse(JSON.stringify(p))})),metadata:{hasPendingWrites:false}});
const initializeApp=()=>({});const getAuth=()=>demoAuth;
class GoogleAuthProvider{};
const getRedirectResult=async()=>null;
const onAuthStateChanged=(a,cb)=>{demoAuthChanged=cb;queueMicrotask(()=>cb(a.currentUser));};
const signInWithPopup=async()=>{demoAuth.currentUser={uid:'preview-only',displayName:'Vista previa'};demoAuthChanged(demoAuth.currentUser);};
const signInWithRedirect=signInWithPopup;
const signOut=async()=>{demoAuth.currentUser=null;demoAuthChanged(null);};
const initializeFirestore=()=>({});const persistentLocalCache=()=>({});const persistentMultipleTabManager=()=>({});
const collection=(...args)=>args;const doc=(...args)=>args;
const onSnapshot=(ref,cb)=>{demoSnapshot=cb;queueMicrotask(emitDemo);return ()=>{demoSnapshot=null;};};
const setDoc=async(ref,p)=>{demoPlants=demoPlants.filter(x=>x.id!==p.id).concat(JSON.parse(JSON.stringify(p)));emitDemo();};
const deleteDoc=async ref=>{demoPlants=demoPlants.filter(x=>x.id!==ref.at(-1));emitDemo();};
const writeBatch=()=>{const changes=[];return {set:(r,p)=>changes.push([r,p]),commit:async()=>{for(const [r,p] of changes)await setDoc(r,p);}};};
const runTransaction=async(db,callback)=>{const pending=[];await callback({get:async ref=>{const p=demoPlants.find(p=>p.id===ref.at(-1));return {exists:()=>!!p,data:()=>JSON.parse(JSON.stringify(p))};},set:(r,p)=>pending.push(setDoc(r,p))});await Promise.all(pending);};
const fetch=async url=>{
 if(String(url).includes('geocoding-api'))return {json:async()=>({results:[{name:'Granada (ejemplo)',latitude:37.17,longitude:-3.59,country:'España'}]})};
 if(String(url).includes('bigdatacloud'))return {json:async()=>({city:'Ubicación de ejemplo'})};
 if(String(url).includes('open-meteo'))return {json:async()=>({current:{temperature_2m:24,relative_humidity_2m:55,weather_code:2},daily:{precipitation_probability_max:[30,70],precipitation_sum:[0,2]}})};
 const text=JSON.stringify({nombreComun:'Monstera (ejemplo)',especie:'Monstera deliciosa',revisarCadaDias:7,luz:'media',confianza:'baja',motivo:'Respuesta simulada; no se ha identificado tu foto.',consejo:'Comprueba la humedad antes de regar.'});
 return {ok:true,json:async()=>({candidates:[{content:{parts:[{text}]}}]})};
};
'''
# Embedded sample photos keep the preview self-contained, including in a downloaded HTML.
photos='\n'.join('const '+constant+'='+repr('data:image/jpeg;base64,'+base64.b64encode((root/'preview-assets'/name).read_bytes()).decode())+';' for constant,name in [('DEMO_FICUS','ficus.jpg'),('DEMO_PLANT','plant.jpg')])
mock=photos+'\n'+mock
codes=[]
for name in ['utils','backup','settings','sync','weather','plants','photos','gemini','ui','app']:
    text=(root/'js'/f'{name}.js').read_text()
    text=re.sub(r'^import .*?;\s*','',text,flags=re.M)
    text=re.sub(r'^export \{[^}]*\};?\s*','',text,flags=re.M)
    if name=='sync':text=re.sub(r'const fbConfig = \{[\s\S]*?\};','const fbConfig = {};',text,count=1)
    if name=='settings':text=text.replace('geminiKey:""','geminiKey:"preview-only"').replace('pg3b_settings','pg3b_preview_settings')
    if name=='app':text=re.sub(r'if\("serviceWorker" in navigator\).*?;\n','',text)
    codes.append(text)
html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
html=re.sub(r'<link rel="manifest"[^>]+>','',html)
html=re.sub(r'<link[^>]+(?:fonts.googleapis|fonts.gstatic)[^>]+>','',html)
html=html.replace('<script type="module" src="./js/app.js"></script>','<script type="module">'+mock+'\n'+ '\n'.join(codes)+'</script>')
html=re.sub(r'<label for="s-gkey">[\s\S]*?<p class="note">[\s\S]*?</p>', '<input id="s-gkey" type="hidden" value="preview-only"><p class="note">Gemini simulado: no introduzcas una clave en esta demostración.</p>', html)
html=html.replace('<body>','<body><aside class="preview-notice">Vista previa · jardín de ejemplo<details><summary>Sobre esta prueba</summary><p>Datos, login, clima y Gemini simulados. No usa vuestro jardín ni claves reales. Bob es un ejemplo de 77 días pendientes, visible en su ficha. Esta demostración no prueba servicios ni instalación PWA reales.</p></details></aside>')
html=html.replace('</style>','\n.preview-notice{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 18px;padding:6px 18px;background:var(--surface2);color:var(--ink2);font:12px system-ui;line-height:1.5}.preview-notice summary{min-height:32px;padding:4px 0;font:inherit;text-decoration:underline;text-underline-offset:3px}.preview-notice summary::after{display:none}.preview-notice details[open]{width:min(100%,700px)}.preview-notice p{padding-bottom:10px}</style>',1)
(root/'preview.html').write_text(html)
print('Generated Plantometro/preview.html (simulated, self-contained)')
