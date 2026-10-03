import {$} from './utils.js';
let timer=null,shown=new Set();
try{shown=new Set(JSON.parse(sessionStorage.getItem("pg3_weather_seen_v1")||"[]").slice(-24));}catch{}
function clearWeatherSignal(){clearTimeout(timer);$('weather-scene').replaceChildren();$('weather-scene').className='weather-scene';$('weather-notice').hidden=true;}
function dismissWeatherSignal(){clearWeatherSignal();}
function showWeatherSignal(weather,phenomenon){
  if(!phenomenon){clearWeatherSignal();return;}
  const key=weather.key+'|'+phenomenon.kind+'|'+(phenomenon.variant||'')+'|'+weather.forecastDay;
  if(shown.has(key))return;shown.add(key);
  try{sessionStorage.setItem("pg3_weather_seen_v1",JSON.stringify([...shown].slice(-24)));}catch{}
  clearWeatherSignal();$('weather-notice-text').textContent=phenomenon.text;$('weather-notice').hidden=false;
  const scene=$('weather-scene');scene.dataset.kind=phenomenon.kind;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){scene.className='weather-scene still';return;}
  const n=phenomenon.kind==='storm'?0:phenomenon.kind==='wind'?8:22;
  for(let i=0;i<n;i++){const particle=document.createElement('i');particle.style.setProperty('--x',((i*47)%100)+'%');particle.style.setProperty('--delay',((i*13)%20)/10+'s');particle.style.setProperty('--size',(i%3+2)+'px');scene.append(particle);}
  scene.className='weather-scene playing';timer=setTimeout(()=>{scene.replaceChildren();scene.className='weather-scene';},4500);
}
export {showWeatherSignal,clearWeatherSignal,dismissWeatherSignal};
