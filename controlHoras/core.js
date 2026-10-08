/* Shared deterministic calculations and import boundary. No network or DOM. */
(function(root) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const monthKey = (y,m) => `${y}-${String(m+1).padStart(2,'0')}`;
  const dim = (y,m) => new Date(y,m+1,0).getDate();
  const own = (x,k) => Object.prototype.hasOwnProperty.call(x,k);
  const plain = x => !!x && typeof x==='object' && !Array.isArray(x);
  const finite = (x,min,max) => typeof x==='number' && Number.isFinite(x) && x>=min && x<=max;
  const fail = m => {throw new Error(m);};
  function safeTree(x,depth=0) {
    if(depth>15) fail('Copia demasiado compleja.');
    if(x && typeof x==='object') for(const k of Object.keys(x)) {
      if(['__proto__','prototype','constructor'].includes(k)) fail('Propiedad peligrosa en la copia.');
      safeTree(x[k],depth+1);
    }
    else if(typeof x==='number' && !Number.isFinite(x)) fail('Número no válido.');
  }
  function config(input,defaults) {
    if(!plain(input)) fail('Configuración no válida.');
    const c={...copy(defaults),...copy(input)};
    for(const k of ['rateNormal','plusFestivo','rateExtra']) if(!finite(c[k],0,10000)) fail('Tarifa no válida: '+k);
    if(!['ett','sintax'].includes(c.profile) || typeof c.sintaxUnlocked!=='boolean') fail('Perfil no válido.');
    if(typeof c.userName!=='string' || c.userName.length>200) fail('Nombre no válido.');
    if(typeof c.hideMoney!=='boolean') fail('Preferencia no válida.');
    if(!Array.isArray(c.deductions) || c.deductions.length>30) fail('Retenciones no válidas.');
    const ids=new Set();
    for(const d of c.deductions) {
      if(!plain(d) || !['string','number'].includes(typeof d.id) || String(d.id).length>100 || ids.has(String(d.id)) || typeof d.name!=='string' || d.name.length>150 || !finite(d.pct,0,100)) fail('Retención no válida.');
      ids.add(String(d.id));
    }
    if(c.deductions.reduce((s,d)=>s+d.pct,0)>100) fail('Las retenciones suman más del 100 %.');
    return c;
  }
  function financial(c) {
    const {rateNormal,plusFestivo,rateExtra,profile,sintaxUnlocked,deductions}=c;
    return copy({rateNormal,plusFestivo,rateExtra,profile,sintaxUnlocked,deductions});
  }
  function validateBackup(p,defaults,{remote=false}={}) {
    safeTree(p);
    if(!plain(p) || !plain(p.data) || !plain(p.config)) fail('Se necesitan configuración y datos.');
    if(p.schemaVersion!==undefined && ![2,3].includes(p.schemaVersion)) fail('Versión de copia no compatible.');
    const c=config(p.config,defaults),data=copy(p.data);
    if(Object.keys(data).length>1200) fail('Demasiados meses en la copia.');
    for(const [mk,r] of Object.entries(data)) {
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mk) || +mk.slice(0,4)<1900 || +mk.slice(0,4)>2200 || !plain(r) || !plain(r.days)) fail('Mes no válido: '+mk);
      const [y,m]=mk.split('-').map(Number);
      for(const [d,e] of Object.entries(r.days)) {
        if(!/^[1-9]\d?$/.test(d) || +d>dim(y,m-1)) fail('Día no válido: '+mk+'-'+d);
        if(e===null) continue; // Durable deletion tombstone, never merged back from old copies.
        if(!plain(e) || !['normal','festivo','descanso'].includes(e.type) || !finite(e.hours,0,24) || (e.type==='descanso' && e.hours!==0)) fail('Jornada no válida: '+mk+'-'+d);
      }
      if(r.closed!==undefined && typeof r.closed!=='boolean') fail('Cierre de mes no válido.');
      if(r.rateConfig) r.rateConfig=financial(config({...c,...r.rateConfig},defaults));
      else {r.rateConfig=financial(c);r.historicalStatus='unknown';}
      if(r.historicalStatus!==undefined && !['unknown','confirmed'].includes(r.historicalStatus)) fail('Estado histórico no válido.');
    }
    return {schemaVersion:3,config:c,data};
  }
  function cfgFor(data,c,y,m) {return {...c,...(data[monthKey(y,m)]?.rateConfig||financial(c))};}
  const extraActive = c => c.profile==='sintax' && c.sintaxUnlocked;
  function entry(data,date) {return data[monthKey(date.getFullYear(),date.getMonth())]?.days?.[date.getDate()]||null;}
  function extraMap(data,y,m) {
    const map={},first=new Date(y,m,1,12);let monday=new Date(y,m,1-((first.getDay()+6)%7),12);
    while(monday<=new Date(y,m,dim(y,m),12)) {
      const week=Array.from({length:7},(_,i)=>{const date=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i,12),e=entry(data,date);return {date,e,h:e&&e.type!=='descanso'?e.hours:0};});
      let extra=Math.max(0,week.reduce((s,d)=>s+d.h,0)-40);
      for(let i=6;i>=0 && extra>0;i--) {
        const d=week[i];if(d.e?.type!=='normal') continue;
        const take=Math.min(d.h,extra);extra-=take;
        if(d.date.getFullYear()===y && d.date.getMonth()===m) map[d.date.getDate()]=take;
      }
      monday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7,12);
    }
    return map;
  }
  function extraInfo(data,c,y,m) {
    const prev=new Date(y,m-1,1),pc=cfgFor(data,c,prev.getFullYear(),prev.getMonth());
    const sum=x=>Object.values(x).reduce((s,h)=>s+h,0);
    return {hGen:sum(extraMap(data,y,m)),hPrev:extraActive(pc)?sum(extraMap(data,prev.getFullYear(),prev.getMonth())):0};
  }
  function calcMonth(days,c,daysInMonth,ei=null) {
    let hNormal=0,hFestivo=0,diasTrab=0,diasDesc=0;
    for(let d=1;d<=daysInMonth;d++) {const e=days?.[d];if(!e) continue;if(e.type==='descanso'){diasDesc++;continue;}if(e.hours>0)diasTrab++;if(e.type==='festivo')hFestivo+=e.hours;else hNormal+=e.hours;}
    const use=ei&&extraActive(c),hExtraGen=use?ei.hGen:0,hExtra=use?ei.hPrev:0,hNormalPaid=Math.max(0,hNormal-hExtraGen);
    const brutoNormal=hNormalPaid*c.rateNormal,brutoFestivo=hFestivo*(c.rateNormal+c.plusFestivo),brutoExtra=hExtra*c.rateExtra,bruto=brutoNormal+brutoFestivo+brutoExtra;
    const dets=c.deductions.map(d=>({...d,amount:bruto*d.pct/100})),totalDed=dets.reduce((s,d)=>s+d.amount,0);
    return {hNormal,hNormalPaid,hFestivo,hExtraGen,hExtra,diasTrab,diasDesc,brutoNormal,brutoFestivo,brutoExtra,bruto,dets,totalDed,neto:bruto-totalDed};
  }
  function calculate(data,c,y,m) {const cfg=cfgFor(data,c,y,m);return calcMonth(data[monthKey(y,m)]?.days||{},cfg,dim(y,m),extraActive(cfg)?extraInfo(data,c,y,m):null);}
  function daily(data,c,y,m,d,e=entry(data,new Date(y,m,d))) {
    const cfg=cfgFor(data,c,y,m),extra=extraActive(cfg)&&e?.type==='normal'?(extraMap(data,y,m)[d]||0):0;
    const rate=cfg.rateNormal+(e?.type==='festivo'?cfg.plusFestivo:0);
    return {hours:e?.hours||0,extra,rate,bruto:e?.type==='descanso'?0:((e?.hours||0)-extra)*rate};
  }
  function hoursColor(h) {
    if(h<9.5) return '#E8EDF7';
    const t=Math.min(1,(h-9.5)/2.5),a=[255,176,79],b=[255,112,112];
    return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')+')';
  }
  function escapeHTML(x) {return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // Atomic field operations: independent fields commute; same field last server commit wins.
  function applyOps(p,ops) {
    const out=copy(p);for(const op of ops) {
      if(!Array.isArray(op.path) || !op.path.length || op.path.some(k=>['__proto__','constructor','prototype'].includes(k))) fail('Operación no válida.');
      let target=out;for(const k of op.path.slice(0,-1)){if(!plain(target[k]))target[k]={};target=target[k];}target[op.path.at(-1)]=copy(op.value);
    }return out;
  }
  function redactPayroll(text) {
    return text.replace(/\b[A-Z]{2}\s?\d{2}(?:[\s-]?[A-Z0-9]){10,30}\b/gi,'[IBAN omitido]')
      .replace(/\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi,'[DNI/NIE omitido]')
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,'[correo omitido]')
      .replace(/\b\d{2}[\s/-]?\d{8}[\s/-]?\d{2}\b/g,'[afiliación omitida]')
      .replace(/^(?:.*(?:trabajador(?:a)?|nombre|domicilio|dirección|n\.?i\.?f|c\.?i\.?f|empresa|cuenta bancaria|teléfono)\s*[:：].*)$/gim,'[identificación omitida]');
  }
  function normalizePayroll(p) {
    safeTree(p);if(!plain(p)) fail('Respuesta no válida.');
    const out={};
    if(p.period!==null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period||'')) fail('Periodo no válido.');out.period=p.period;
    for(const k of ['gross','deductions','net','normalHours','holidayHours','extraHours','normalRate','holidayRate','extraRate']) {
      if(p[k]!==null && !finite(p[k],0,10000000)) fail('Dato de nómina no válido: '+k);out[k]=p[k];
    }
    if(typeof p.complete!=='boolean' || !Array.isArray(p.missing) || p.missing.length>30 || p.missing.some(x=>typeof x!=='string'||x.length>300)) fail('Límites de extracción no válidos.');
    out.complete=p.complete;out.missing=p.missing;return out;
  }
  function comparePayroll(p,data,c) {
    p=normalizePayroll(p);const limits=[...p.missing],differences=[];
    if(!p.period || !data[p.period]) return {status:'unknown',label:'No se puede comprobar con la información disponible',differences,limits:[...limits,'Falta el periodo o sus registros.']};
    const [y,m]=p.period.split('-').map(Number),r=calculate(data,c,y,m-1),cfg=cfgFor(data,c,y,m-1);
    if(data[p.period].historicalStatus!=='confirmed') limits.push('Tarifas históricas sin confirmar.');
    if(!p.complete) limits.push('Faltan conceptos salariales, bases, horas o información aplicable.');
    const pairs=[['gross','Bruto',r.bruto,.02],['deductions','Retenciones',r.totalDed,.02],['net','Neto',r.neto,.02],['normalHours','Horas normales pagadas',r.hNormalPaid,.01],['holidayHours','Horas festivas',r.hFestivo,.01],['extraHours','Extras del mes anterior',r.hExtra,.01],['normalRate','Tarifa normal',cfg.rateNormal,.0001],['holidayRate','Tarifa festiva',cfg.rateNormal+cfg.plusFestivo,.0001],['extraRate','Tarifa extra',cfg.rateExtra,.0001]];
    for(const [k,label,expected,tolerance] of pairs) if(p[k]!==null && Math.abs(p[k]-expected)>tolerance) differences.push({label,actual:p[k],expected,unit:k.includes('Hours')?'h':k.includes('Rate')?'€/h':'€'});
    for(const k of ['gross','deductions','net','normalHours','holidayHours']) if(p[k]===null) limits.push('Falta '+pairs.find(x=>x[0]===k)[1]+'.');
    // Completeness of the app's month must be explicitly recorded, never inferred from gaps.
    if(data[p.period].closed!==true) limits.push('Registros del periodo sin confirmar como completos.');
    const status=differences.length?'different':limits.length?'unknown':'match';
    return {status,label:{match:'Cuadra con los datos disponibles',different:'Hay diferencias',unknown:'No se puede comprobar con la información disponible'}[status],differences,limits,result:r};
  }
  const api={copy,monthKey,dim,config,financial,validateBackup,cfgFor,extraActive,entry,extraMap,extraInfo,calcMonth,calculate,daily,hoursColor,escapeHTML,applyOps,redactPayroll,normalizePayroll,comparePayroll};
  if(typeof module!=='undefined')module.exports=api;else root.HorasCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
