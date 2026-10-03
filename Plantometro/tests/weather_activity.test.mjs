import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWeather,weatherPhenomenon,locationKey} from '../js/weather-model.js';
import {makeActivity,recentActivities,updateReadState,activityLine,sortHistory} from '../js/activity-model.js';
import {validateBackup} from '../js/backup.js';
const now=Date.parse('2026-10-03T12:00:00Z'),location={city:'Armilla',lat:37.14386,lon:-3.62534};
const data=()=>({latitude:37.14,longitude:-3.62,utc_offset_seconds:0,current:{time:'2026-10-03T12:00',temperature_2m:24,relative_humidity_2m:60,weather_code:2,wind_speed_10m:12},daily:{time:['2026-10-03','2026-10-04'],weather_code:[2,2],precipitation_probability_max:[10,20],precipitation_sum:[0,0],snowfall_sum:[0,0],wind_speed_10m_max:[15,15],wind_gusts_10m_max:[25,25]}});
function weather(change={}){return {...normalizeWeather(data(),location,now),...change};}
test('climate uses requested coordinates; optional wind/forecast stay unknown',()=>{
 const d=data();delete d.current.wind_speed_10m;delete d.daily;const f=normalizeWeather(d,location,now);assert.equal(f.key,locationKey('Armilla',location.lat,location.lon));assert.equal(f.wind,null);assert.equal(f.probToday,null);assert.equal(weatherPhenomenon(f),null);
});
test('wrong location, old observation and malformed response are rejected',()=>{
 const d=data();d.latitude=40.4;assert.throws(()=>normalizeWeather(d,location,now));
 d.latitude=37.14;d.current.time='2026-10-01T12:00';assert.throws(()=>normalizeWeather(d,location,now));
 d.current.time='2026-10-03T12:00';d.current.temperature_2m=NaN;assert.throws(()=>normalizeWeather(d,location,now));
 assert.throws(()=>normalizeWeather({},location,now));assert.throws(()=>normalizeWeather(data(),{...location,lat:200},now));
});
test('daily forecast must refer to today; timezone offsets are respected',()=>{
 const d=data();d.daily.time=['2026-10-02'];assert.equal(normalizeWeather(d,location,now).probToday,null);
 d.utc_offset_seconds=7200;d.current.time='2026-10-03T14:00';assert.equal(normalizeWeather(d,location,now).observedAt,now);
});
test('conservative rain, hail, snow, storm and wind thresholds',()=>{
 assert.equal(weatherPhenomenon(weather()),null);
 assert.equal(weatherPhenomenon(weather({forecastCode:63,probToday:30,sumToday:4})),null);
 assert.equal(weatherPhenomenon(weather({forecastCode:63,probToday:80,sumToday:0.1})),null);
 assert.equal(weatherPhenomenon(weather({forecastCode:63,probToday:80,sumToday:5})).kind,'rain');
 assert.equal(weatherPhenomenon(weather({forecastCode:95,probToday:80,sumToday:5})).kind,'storm');
 assert(!weatherPhenomenon(weather({forecastCode:95,probToday:80,sumToday:5})).text.includes('granizo'));
 assert(weatherPhenomenon(weather({forecastCode:96,probToday:80,sumToday:5})).text.includes('granizo'));
 assert.equal(weatherPhenomenon(weather({forecastCode:71,probToday:80,sumToday:1,snow:0.1})),null);
 assert.equal(weatherPhenomenon(weather({forecastCode:71,probToday:80,sumToday:1,snow:2})).kind,'snow');
 assert.equal(weatherPhenomenon(weather({gustMax:59})),null);assert.equal(weatherPhenomenon(weather({gustMax:60})).kind,'wind');
});
test('activity ids deduplicate, retain only 80 and never invent a historical author',()=>{
 const p={id:'bob',name:'Bob'},e=makeActivity('watered',p,'Rosita','rosita-device');assert.equal(e.author,'Rosita');assert.equal(recentActivities([e,e]).length,1);
 const list=Array.from({length:130},(_,i)=>({...e,id:String(i)}));assert.equal(recentActivities(list).length,80);
 assert.equal(makeActivity('watered',p,'','x').author,'Alguien');assert.match(activityLine({history:[{t:'agua',date:'2026-01-01'}]}),/sin apodo/);
});
test('first start is a baseline; unread belongs to one device, not nickname or UID',()=>{
 const e=makeActivity('watered',{id:'bob',name:'Bob'},'Rosita','phone-b');const initial=updateReadState(null,[e],'phone-a');assert.deepEqual(initial.unread,[]);
 const next={...e,id:'next'};const a=updateReadState(initial,[next,e],'phone-a'),b=updateReadState(initial,[next,e],'phone-b');assert.deepEqual(a.unread,['next']);assert.deepEqual(b.unread,[]);
 const again=updateReadState(a,[next,e],'phone-a');assert.deepEqual(again.unread,['next']);assert.equal(again.known.length,2);
});
test('history sorts new precise events and preserves legacy rows and backup extras',()=>{
 const history=[{t:'agua',date:'2026-01-01',by:'Frank'},{t:'abono',date:'2026-01-01'},{t:'agua',date:'2026-10-03',at:'2026-10-03T12:00:00Z',by:'Rosita',eventId:'new'}];
 assert.equal(sortHistory(history)[0].eventId,'new');assert.equal(history.length,3);
 const plant={id:'bob',name:'Bob',waterFreq:7,lastWater:'2026-10-03',fertFreq:0,history,gallery:[],unknownPreference:'retain',lastActivity:makeActivity('watered',{id:'bob',name:'Bob'},'Rosita','b')};
 assert.deepEqual(validateBackup([plant]),[plant]);
});
