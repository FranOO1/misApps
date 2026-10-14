const WEATHER_FRESH_MS=45*60*1000;
const SNOW=new Set([71,73,75,77,85,86]),RAIN=new Set([51,53,55,56,57,61,63,65,66,67,80,81,82]);
const STORM=new Set([95,96,99]),HAIL=new Set([96,99]);
const coordinates=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
const bounded=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
function locationKey(city,lat,lon){return String(city)+'|'+Number(lat).toFixed(4)+'|'+Number(lon).toFixed(4);}
function normalizeWeather(data,location,now=Date.now()){
  if(!coordinates(location.lat,location.lon))throw Error('weather-location-invalid');
  if(data.latitude!=null||data.longitude!=null){
    if(!coordinates(data.latitude,data.longitude))throw Error('weather-location-invalid');
    const dy=(data.latitude-location.lat)*111,dx=(data.longitude-location.lon)*111*Math.cos(location.lat*Math.PI/180);
    if(Math.hypot(dx,dy)>35)throw Error('weather-location-mismatch');
  }
  const c=data.current;if(!c||bounded(c.temperature_2m,-90,65)==null||bounded(c.relative_humidity_2m,0,100)==null||!Number.isInteger(c.weather_code)||c.weather_code<0||c.weather_code>99)throw Error('weather-incomplete');
  const offset=bounded(data.utc_offset_seconds,-50400,50400)??0;
  const observedAt=typeof c.time==='string'?Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(c.time)?c.time:c.time+'Z')-(/(?:Z|[+-]\d{2}:\d{2})$/.test(c.time)?0:offset*1000):NaN;
  if(!Number.isFinite(observedAt)||now-observedAt>3*60*60*1000||observedAt-now>45*60*1000)throw Error('weather-observation-old');
  const today=new Date(now+offset*1000).toISOString().slice(0,10),d=data.daily||{},index=Array.isArray(d.time)?d.time.indexOf(today):-1;
  const field=(name,min=0,max=1000)=>index<0?null:bounded(d[name]?.[index],min,max);
  return {v:1,key:locationKey(location.city,location.lat,location.lon),city:location.city,lat:location.lat,lon:location.lon,fetchedAt:now,observedAt,temp:c.temperature_2m,humidity:c.relative_humidity_2m,code:c.weather_code,
    wind:bounded(c.wind_speed_10m,0,300),gust:bounded(c.wind_gusts_10m,0,350),
    probToday:field('precipitation_probability_max',0,100),sumToday:field('precipitation_sum'),probTom:index<0?null:bounded(d.precipitation_probability_max?.[index+1],0,100),
    forecastDay:index<0?null:d.time[index],forecastCode:field('weather_code',0,99),snow:field('snowfall_sum'),windMax:field('wind_speed_10m_max',0,300),gustMax:field('wind_gusts_10m_max',0,350)};
}
function weatherPhenomenon(f){
  if(!f)return null;
  const wet=f.probToday!=null&&f.probToday>=60&&f.sumToday!=null&&f.sumToday>=1;
  if(HAIL.has(f.forecastCode)&&wet)return {kind:'storm',variant:'hail',text:'Tormenta con granizo prevista hoy · protege las plantas de exterior'};
  if(STORM.has(f.forecastCode)&&wet)return {kind:'storm',text:'Tormenta prevista hoy · comprueba las plantas de exterior'};
  if(SNOW.has(f.forecastCode)&&f.probToday>=60&&f.snow>=0.5)return {kind:'snow',text:'Nieve prevista hoy · protege las plantas de exterior'};
  if(f.gustMax>=60||f.windMax>=40)return {kind:'wind',text:'Rachas fuertes previstas hoy · revisa las macetas de exterior'};
  if(wet&&RAIN.has(f.forecastCode))return {kind:'rain',text:'Lluvia prevista hoy · comprueba las plantas de exterior'};
  return null;
}
function weatherSymbol(code){
  if(STORM.has(code))return {symbol:'⛈',label:'tormenta'};
  if(SNOW.has(code))return {symbol:'❄',label:'nieve'};
  if(RAIN.has(code))return {symbol:'☂',label:'lluvia'};
  if([45,48].includes(code))return {symbol:'≋',label:'niebla'};
  if(code===0)return {symbol:'☀',label:'despejado'};
  if(code===1||code===2)return {symbol:'⛅',label:'parcialmente nublado'};
  return {symbol:'☁',label:'nublado'};
}
export {WEATHER_FRESH_MS,coordinates,locationKey,normalizeWeather,weatherPhenomenon,weatherSymbol};
