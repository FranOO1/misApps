import { $, esc } from "./utils.js";
import { settings, persistSettings } from "./settings.js";
import { plants } from "./sync.js";
import { water } from "./plants.js";
import { toast, render } from "./ui.js";

/* ============ Localización y clima ============ */
async function searchCity(){
  const q = $("s-city").value.trim(); if(!q) return;
  const box = $("georesults"); box.innerHTML = "<p class='note'>Buscando…</p>";
  try{
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=es&format=json`);
    if(r.ok===false)throw Error('weather-search-unavailable');
    const d = await r.json();
    if(!d.results?.length){ box.innerHTML = "<p class='note'>Sin resultados. Prueba con otro nombre.</p>"; return; }
    box.innerHTML = d.results.map((c,i)=>`<button data-city="${i}">📍 ${esc(c.name)}${c.admin1?", "+esc(c.admin1):""} <span style="color:var(--ink2)">(${esc(c.country||"")})</span></button>`).join("");
    box._results = d.results;
    box.querySelectorAll("[data-city]").forEach(b=>b.onclick=()=>pickCity(+b.dataset.city));
  }catch(e){ box.innerHTML = "<p class='note'>La búsqueda no está disponible ahora. Prueba de nuevo.</p>"; }
}
function pickCity(i){
  const c = $("georesults")._results[i];
  settings.city = c.name; settings.lat = c.latitude; settings.lon = c.longitude;
  persistSettings(); $("georesults").innerHTML=""; $("s-city").value=c.name;
  loadWeather(); toast(`Clima fijado en ${c.name} ✅`);
}
function useGPS(){
  if(!navigator.geolocation) return toast("Este navegador no da la ubicación");
  toast("Localizando…");
  navigator.geolocation.getCurrentPosition(async pos=>{
    settings.lat = pos.coords.latitude; settings.lon = pos.coords.longitude;
    try{
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${settings.lat}&longitude=${settings.lon}&localityLanguage=es`);
      const d = await r.json();
      settings.city = d.city || d.locality || "Mi ubicación";
    }catch(e){ settings.city = "Mi ubicación"; }
    persistSettings(); $("s-city").value = settings.city; loadWeather(); toast(`Ubicación: ${settings.city} 📍`);
  }, ()=>toast("No se pudo obtener la ubicación"));
}
const WCODE = {0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",80:"🌦️",95:"⛈️"};
let forecast = null; // {probToday, sumToday, probTom}
const isOutdoor = p => !/interior|sal[oó]n|habitaci[oó]n|ba[nñ]o|cocina|dormitorio|despacho|oficina/i.test(p.loc || "")
  && /terraz|balc|exterior|patio|jard|fuera|azotea|calle|porche/i.test(p.loc || "");
const rainyToday = () => !!forecast && Date.now() - forecast.fetchedAt < 3*60*60*1000
  && (forecast.probToday >= 60 || forecast.sumToday >= 2);

function seasonContext(){
  const m = new Date().getMonth();
  const north = ["invierno","primavera","verano","otoño"][Math.floor(((m+1)%12)/3)];
  const south = {invierno:"verano",primavera:"otoño",verano:"invierno",otoño:"primavera"};
  return (settings.lat < 0 ? south[north] : north) + " en " + settings.city;
}
function weatherContext(p){
  if(!isOutdoor(p)) return "";
  const notes = ["Exterior · " + seasonContext() + "."];
  if(!forecast || Date.now() - forecast.fetchedAt > 3*60*60*1000){
    notes.push("Sin previsión reciente. Actualiza el clima y comprueba la tierra.");
  }else{
    if(rainyToday()) notes.push(`Lluvia prevista hoy: ${forecast.probToday}% (${forecast.sumToday} mm). Puede no llegar a una maceta cubierta; comprueba la humedad.`);
    else if(forecast.probTom >= 60) notes.push(`Lluvia prevista mañana: ${forecast.probTom}%. No garantiza que la maceta reciba agua.`);
    if(forecast.temp >= 30 || settings.summerMode) notes.push("Con calor la tierra puede secarse antes. Revisa la humedad y ajusta los días manualmente si hace falta.");
    if(forecast.temp <= 8) notes.push("Con frío puede secarse más despacio; evita regar si sigue húmeda.");
  }
  notes.push("La previsión no cambia tu frecuencia ni registra riegos.");
  return notes.join(" ");
}

async function loadWeather(){
  $("w-city").textContent = settings.city;
  try{
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${settings.lat}&longitude=${settings.lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=precipitation_probability_max,precipitation_sum&forecast_days=2&timezone=auto`);
    if(r.ok===false)throw Error('weather-unavailable');
    const d = await r.json(); const c = d.current;
    if(!c||!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.relative_humidity_2m)||c.relative_humidity_2m<0||c.relative_humidity_2m>100||!Number.isInteger(c.weather_code))throw Error('weather-invalid');
    forecast = {
      temp: c.temperature_2m,
      fetchedAt: Date.now(),
      probToday: d.daily?.precipitation_probability_max?.[0] ?? 0,
      sumToday: d.daily?.precipitation_sum?.[0] ?? 0,
      probTom: d.daily?.precipitation_probability_max?.[1] ?? 0
    };
    $("w-temp").textContent = Math.round(c.temperature_2m)+"°C";
    $("w-hum").textContent = Math.round(c.relative_humidity_2m)+"%";
    $("w-rain").textContent = forecast.probToday+"%";
    $("w-icon").textContent = WCODE[c.weather_code] || "🌤️";
    $("w-summary").textContent = `${settings.city} · ${Math.round(c.temperature_2m)}°C`;
    let tip = "";
    if (rainyToday()) tip = "🌧️ Lluvia prevista: solo aporta contexto para plantas de exterior expuestas. Comprueba la tierra; no garantiza un riego.";
    else if (c.temperature_2m >= 32) tip = "Calor: la tierra puede secarse antes. Comprueba su humedad antes de decidir si regar.";
    else if (forecast.probTom >= 60) tip = "🌦️ Lluvia prevista mañana; no garantizada. Para exterior, decide según la humedad real de la maceta.";
    else if (c.temperature_2m >= 26 && c.relative_humidity_2m < 35) tip = "Ambiente seco y cálido: pulveriza las de interior tropical.";
    else if (c.temperature_2m <= 8) tip = "🥶 Frío: espacia los riegos y protege las sensibles de la ventana.";
    else if (c.relative_humidity_2m > 80) tip = "Humedad alta: cuidado con encharcar, comprueba la tierra antes de regar.";
    $("w-tip").textContent = seasonContext() + ". " + tip;
    $("w-tip").style.display = "block";
    render();
    if($("detail-modal").classList.contains("open")){
      const p = plants.find(p=>p.id === $("d-water").dataset.plantId);
      if(p){ $("d-rain").textContent = weatherContext(p); }
    }
  }catch(e){
    forecast = null;
    $("w-summary").textContent = `${settings.city} · clima no disponible`;
    $("w-temp").textContent = "--°"; $("w-hum").textContent = "--%"; $("w-rain").textContent = "--%";
    $("w-tip").textContent = "No se pudo consultar el clima. Puedes volver a intentarlo; tus fechas siguen igual.";
    $("w-tip").style.display = "block";
    render();
  }
}

export { forecast, isOutdoor, rainyToday, seasonContext, weatherContext, searchCity, pickCity, useGPS, loadWeather };
