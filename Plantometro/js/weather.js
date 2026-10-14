import {$,esc} from './utils.js';
import {settings,persistSettings} from './settings.js';
import {plants} from './sync.js';
import {toast} from './ui.js';
import {WEATHER_FRESH_MS,coordinates,locationKey,normalizeWeather,weatherPhenomenon,weatherSymbol} from './weather-model.js';
import {showWeatherSignal,clearWeatherSignal} from './weather-effects.js';
let forecast=null,failed=false,inflight=null,controller=null,lastAttempt=0,lastKey='',started=false,searchRevision=0,locationRevision=0;
const CACHE_KEY='pg3_weather_v1';
const location=()=>({city:settings.city,lat:Number(settings.lat),lon:Number(settings.lon)});
function readCached(key){
  try{const records=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]'),f=records.find(f=>f.key===key);
    if(f?.v===1&&Number.isFinite(f.fetchedAt)&&f.fetchedAt<=Date.now()+60000&&Number.isFinite(f.temp)&&Number.isFinite(f.humidity)&&coordinates(f.lat,f.lon))return f;
  }catch{}return null;
}
function cacheWeather(f){try{let records=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]');if(!Array.isArray(records))records=[];localStorage.setItem(CACHE_KEY,JSON.stringify([f,...records.filter(x=>x.key!==f.key)].slice(0,3)));}catch{}}
const stale=()=>!forecast||failed||navigator.onLine===false||Date.now()-forecast.fetchedAt>=WEATHER_FRESH_MS||Date.now()-forecast.observedAt>3*60*60*1000;
function renderWeather(){
  const city=settings.city||'Tu localidad',old=stale(),symbol=forecast?weatherSymbol(forecast.code):{symbol:'—',label:'no disponible'};
  $('weather-peek-city').textContent=city;$('weather-peek-temp').textContent=forecast?Math.round(forecast.temp)+'°':'Clima no disponible';$('weather-peek-icon').textContent=symbol.symbol;
  $('weather-peek-age').hidden=!forecast||!old;$('weather-peek').classList.toggle('stale',!!forecast&&old);
  $('weather-peek').setAttribute('aria-label',`${city}: ${forecast?Math.round(forecast.temp)+' grados, '+symbol.label+(old?', lectura antigua':''):'clima no disponible'}. Ver detalles del clima`);
  $('w-city').textContent=city;$('w-icon').textContent=symbol.symbol;$('w-temp').textContent=forecast?Math.round(forecast.temp)+'°C':'--°';$('w-hum').textContent=forecast?Math.round(forecast.humidity)+'%':'No disponible';$('w-rain').textContent=forecast?.probToday!=null?forecast.probToday+'%':'No disponible';$('w-wind').textContent=forecast?.wind!=null?Math.round(forecast.wind)+' km/h'+(forecast.gust!=null?' · rachas '+Math.round(forecast.gust)+' km/h':''):'No disponible';
  $('w-summary').textContent=forecast?`${city} · ${Math.round(forecast.temp)}°C${old?' · lectura antigua':''}`:city+' · Clima no disponible';
  $('w-updated').textContent=forecast?`${old?'Lectura antigua · ':''}Última actualización: ${new Date(forecast.fetchedAt).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Sin lecturas guardadas';
  $('w-refresh').disabled=!!inflight;
  const phenomenon=!old&&forecast?weatherPhenomenon(forecast):null;
  $('w-tip').textContent=old?'No hay una lectura actual. Puedes actualizar con conexión. Tus fechas y frecuencias no cambian.':(phenomenon?phenomenon.text+'. ':'')+seasonContext()+'. La previsión aporta contexto; decide según la tierra.';
  if(old)clearWeatherSignal();else showWeatherSignal(forecast,phenomenon);
  if($('detail-modal').classList.contains('open')){const p=plants.find(p=>p.id===$('d-water').dataset.plantId);if(p)$('d-rain').textContent=weatherContext(p);}
}
async function loadWeather(options={}){
  const target=location(),key=locationKey(target.city,target.lat,target.lon),now=Date.now();
  if(key!==lastKey){controller?.abort();inflight=null;forecast=readCached(key);failed=!!forecast?.failedAt&&forecast.failedAt>=forecast.fetchedAt;lastAttempt=0;lastKey=key;clearWeatherSignal();}
  if(inflight)return inflight;
  if(!options.force&&forecast&&!stale()){renderWeather();return forecast;}
  if(lastAttempt&&now-lastAttempt<(options.force?10000:5*60*1000)){renderWeather();return forecast;}
  lastAttempt=now;
  if(!coordinates(target.lat,target.lon)){failed=true;renderWeather();return null;}
  if(navigator.onLine===false){failed=true;renderWeather();return forecast;}
  const requestController=new AbortController();controller=requestController;const signal=requestController.signal;const timeout=setTimeout(()=>requestController.abort(),12000);
  inflight=(async()=>{
    try{
      const params=new URLSearchParams({latitude:target.lat,longitude:target.lon,current:'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m',daily:'weather_code,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max',forecast_days:2,timezone:'auto',wind_speed_unit:'kmh',precipitation_unit:'mm',temperature_unit:'celsius'});
      const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal});if(response.ok===false)throw Error('weather-unavailable');
      const next=normalizeWeather(await response.json(),target);
      if(key!==lastKey)return null;
      forecast=next;failed=false;cacheWeather(next);return next;
    }catch{if(key===lastKey){failed=true;if(forecast)cacheWeather({...forecast,failedAt:Date.now()});}return forecast;}
    finally{clearTimeout(timeout);if(key===lastKey){inflight=null;renderWeather();}}
  })();renderWeather();return inflight;
}
function refreshWeather(){return loadWeather({force:true});}
function setupWeather(){
  if(started)return;started=true;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadWeather();});
  window.addEventListener('online',()=>{lastAttempt=0;loadWeather();});
  window.addEventListener('offline',()=>{failed=true;renderWeather();});
  setInterval(()=>{if(!document.hidden){renderWeather();if(stale())loadWeather();}},60000);
}
async function searchCity(){
  const q=$('s-city').value.trim(),revision=++searchRevision;if(!q)return;
  const box=$('georesults');box.innerHTML='<p class="note">Buscando…</p>';
  try{
    const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=es&format=json`,{signal:AbortSignal.timeout(10000)});
    if(response.ok===false)throw Error('geo-unavailable');const data=await response.json();
    if(revision!==searchRevision||q!==$('s-city').value.trim())return;
    const list=(Array.isArray(data.results)?data.results:[]).filter(c=>typeof c.name==='string'&&coordinates(c.latitude,c.longitude));box._results=list;
    box.innerHTML=list.length?list.map((c,i)=>`<button type="button" data-city="${i}">${esc(c.name)}<span>${esc(c.admin1||'')}${c.admin1?' · ':''}${esc(c.country||'')}</span></button>`).join(''):'<p class="note">Sin resultados. Prueba con otro nombre.</p>';
    box.querySelectorAll('[data-city]').forEach(button=>button.onclick=()=>pickCity(+button.dataset.city));
  }catch{if(revision===searchRevision)box.innerHTML='<p class="note">La búsqueda no está disponible ahora. Prueba de nuevo.</p>';}
}
function pickCity(index){
  const c=$('georesults')._results?.[index];if(!c||!coordinates(c.latitude,c.longitude))return;
  locationRevision++;settings.city=c.name;settings.lat=c.latitude;settings.lon=c.longitude;persistSettings();$('georesults').innerHTML='';$('s-city').value=c.name;
  loadWeather();toast('Clima fijado en '+c.name+'.');
}
function useGPS(){
  if(!navigator.geolocation)return toast('GPS no disponible. Puedes buscar la localidad por su nombre.');
  const revision=++locationRevision;toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(async position=>{
    const {latitude:lat,longitude:lon}=position.coords;if(!coordinates(lat,lon)||revision!==locationRevision)return;
    let city='Mi ubicación';try{const r=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`,{signal:AbortSignal.timeout(10000)});if(r.ok===false)throw Error();const d=await r.json();city=d.city||d.locality||city;}catch{}
    if(revision!==locationRevision)return;settings.city=city;settings.lat=lat;settings.lon=lon;persistSettings();$('s-city').value=city;loadWeather();toast('Clima fijado en '+city+'.');
  },()=>toast('No se pudo obtener la ubicación. Puedes buscar la localidad sin GPS.'),{timeout:10000,maximumAge:300000});
}
const isOutdoor=p=>!/interior|sal[oó]n|habitaci[oó]n|ba[nñ]o|cocina|dormitorio|despacho|oficina/i.test(p.loc||'')&&/terraz|balc|exterior|patio|jard|fuera|azotea|calle|porche/i.test(p.loc||'');
const rainyToday=()=>!stale()&&forecast?.probToday>=60&&forecast?.sumToday>=1;
function seasonContext(){const north=['invierno','primavera','verano','otoño'][Math.floor(((new Date().getMonth()+1)%12)/3)];return (settings.lat<0?{invierno:'verano',primavera:'otoño',verano:'invierno',otoño:'primavera'}[north]:north)+' en '+settings.city;}
function weatherContext(p){
  if(!isOutdoor(p))return '';
  const notes=['Exterior · '+seasonContext()+'.'];
  if(stale())notes.push('Sin previsión reciente.');
  else{if(rainyToday())notes.push(`Lluvia prevista hoy: ${forecast.probToday}% (${forecast.sumToday} mm). Puede no llegar a una maceta cubierta.`);if(forecast.temp>=30||settings.summerMode)notes.push('Con calor la tierra puede secarse antes.');if(forecast.temp<=8)notes.push('Con frío puede secarse más despacio.');}
  notes.push('Comprueba la tierra. El clima no cambia tus frecuencias ni registra riegos.');return notes.join(' ');
}
export {forecast,isOutdoor,rainyToday,seasonContext,weatherContext,searchCity,pickCity,useGPS,loadWeather,refreshWeather,setupWeather,renderWeather};
