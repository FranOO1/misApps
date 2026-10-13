/* Read-only historical queries. Gemini selects a bounded plan; all figures use local core/report calculations. */
(function(root){
 'use strict';
 const C=root.HorasCore||(typeof require==='function'?require('./core.js'):null);
 const R=root.HorasReports||(typeof require==='function'?require('./reports.js'):null);
 const metrics=['hours','normalHours','holidayHours','restDays','workDays','extraHours','nightHours','realPayroll','estimates','rates'];
 const num=x=>typeof x==='number'&&Number.isFinite(x);
 const sum=xs=>xs.length?xs.reduce((a,b)=>a+b,0):null;
 const round=x=>num(x)?Math.round(x*10000)/10000:null;
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);return y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1&&d<=C.dim(y,m-1);}
 function normalizePlan(p){
  if(!plain(p)||Object.keys(p).some(k=>!['clarification','groups','metrics','operation','detail'].includes(k)))throw Error('El plan del historial no es válido.');
  if(p.clarification!==null&&(typeof p.clarification!=='string'||!p.clarification.trim()||p.clarification.length>300))throw Error('La aclaración del historial no es válida.');
  if(!Array.isArray(p.groups)||p.groups.length>4||(!p.clarification&&!p.groups.length))throw Error('Falta el periodo de la consulta.');
  const groups=p.groups.map(g=>{if(!plain(g)||Object.keys(g).some(k=>!['label','from','to'].includes(k))||typeof g.label!=='string'||g.label.length>80||!validDate(g.from)||!validDate(g.to)||g.from>g.to)throw Error('El intervalo del historial no es válido.');return {label:g.label,from:g.from,to:g.to};});
  if(!Array.isArray(p.metrics)||!p.metrics.length||p.metrics.length>metrics.length||p.metrics.some(m=>!metrics.includes(m))||new Set(p.metrics).size!==p.metrics.length||!['sum','compare','rank','detail'].includes(p.operation)||typeof p.detail!=='boolean')throw Error('La consulta del historial no es válida.');
  return {clarification:p.clarification,groups,metrics:[...p.metrics],operation:p.operation,detail:p.detail};
 }
 function catalog(data,config,now=new Date()){
  const periods=R.available(data,config),chronological=[...periods].sort();
  return {today:iso(now),earliest:chronological[0]||null,latest:chronological.at(-1)||null,years:[...new Set(chronological.map(p=>+p.slice(0,4)))],availableMonths:chronological.length,knownMonths:chronological.length<=120?chronological:null};
 }
 function monthKeys(from,to){const out=[];let [y,m]=from.slice(0,7).split('-').map(Number),last=to.slice(0,7);while(`${y}-${String(m).padStart(2,'0')}`<=last){out.push(`${y}-${String(m).padStart(2,'0')}`);if(++m>12){m=1;y++;}}return out;}
 function preparePlan(raw,question,cat){
  const plan=normalizePlan(raw),q=String(question).toLocaleLowerCase('es');
  const financial=/neto|bruto|cobr|salario|sueldo|gan[eé]|reten|retenci|irpf|cotiz|n[oó]mina|deducc|estimaci[oó]n|importe|econ[oó]mic/.test(q)||plan.metrics.some(m=>['realPayroll','estimates'].includes(m));
  if(financial)plan.metrics=[...new Set([...plan.metrics,'realPayroll','estimates','rates'])];
  const all=/todos? (?:los )?meses|todo (?:mi |el )?historial|todos? (?:mis |los )?registros/.test(q);
  const monthly=/mes a mes|cada mes|por meses/.test(q);
  const explicit=/\b(?:19|20|21)\d{2}\b|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|este a[nñ]o|a[nñ]o (?:actual|anterior|pasado)|este mes|mes (?:actual|anterior|pasado)|verano|invierno|entre |desde |hasta |[uú]ltimos/.test(q);
  if((all||monthly)&&!explicit&&cat.earliest&&cat.latest){
   const [y,m]=cat.latest.split('-').map(Number);
   plan.groups=[{label:'Todo el historial disponible',from:cat.earliest+'-01',to:cat.latest+'-'+String(C.dim(y,m-1)).padStart(2,'0')}];
   plan.clarification=null;
  }
  return plan;
 }
 function query(data,config,rawPlan,availability,{redact=x=>String(x)}={}){
  if(!availability?.complete)throw Error('El historial completo de esta cuenta todavía no está cargado.');
  const plan=normalizePlan(rawPlan);if(plan.clarification)return {clarification:redact(plan.clarification)};
  const wanted=new Set(plan.metrics),hasFinancial=['realPayroll','estimates','rates'].some(k=>wanted.has(k));
  const groups=plan.groups.map(g=>{
   const keys=monthKeys(g.from,g.to),rows=[],detail=[],knownHours=[],normal=[],holiday=[],rests=[],worked=[],extra=[],night=[],extraKnown=[],nightKnown=[],generatedExtra=[],payrollExtra=[],recordedMonths=[],closedMonths=[],missingMonths=[];
   const actual={gross:[],deductions:[],net:[],received:[],irpf:[]},actualCoverage=Object.fromEntries(Object.keys(actual).map(k=>[k,[]])),estimated={gross:[],deductions:[],net:[]},estimateCoverage=[],concepts=new Map();let dailyCount=0,partialFinancial=false;
   for(const period of keys){
    const [y,m]=period.split('-').map(Number),rec=data[period],cfg=C.cfgFor(data,config,y,m-1),whole=g.from<=period+'-01'&&g.to>=period+'-'+String(C.dim(y,m-1)).padStart(2,'0');
    const days=Object.fromEntries(Object.entries(rec?.days||{}).filter(([d,e])=>e&&period+'-'+String(d).padStart(2,'0')>=g.from&&period+'-'+String(d).padStart(2,'0')<=g.to));
    const entries=Object.entries(days),c=C.calcMonth(days,cfg,C.dim(y,m-1)),row={period,hasRecordedDays:entries.length>0,recordsComplete:rec?.closed===true&&whole};
    if(entries.length){recordedMonths.push(period);knownHours.push(c.hNormal+c.hFestivo);normal.push(c.hNormal);holiday.push(c.hFestivo);rests.push(c.diasDesc);worked.push(c.diasTrab);if(row.recordsComplete)closedMonths.push(period);}
    else missingMonths.push(period);
    if(wanted.has('hours'))row.recordedHours=entries.length?c.hNormal+c.hFestivo:null;
    if(wanted.has('normalHours'))row.normalHours=entries.length?c.hNormal:null;
    if(wanted.has('holidayHours'))row.holidayHours=entries.length?c.hFestivo:null;
    if(wanted.has('restDays'))row.restDays=entries.length?c.diasDesc:null;
    if(wanted.has('workDays'))row.workDays=entries.length?c.diasTrab:null;
    const es=entries.filter(([,e])=>num(e.extraHours)),ns=entries.filter(([,e])=>num(e.nightHours));
    if(es.length){extra.push(...es.map(([,e])=>e.extraHours));extraKnown.push(period);}if(ns.length){night.push(...ns.map(([,e])=>e.nightHours));nightKnown.push(period);}
    if(wanted.has('extraHours')){row.extraHoursIdentified=sum(es.map(([,e])=>e.extraHours));row.extraDaysWithClassification=es.length;const active=cfg.profile==='sintax'&&cfg.sintaxUnlocked;if(active&&entries.length){row.extraHoursGeneratedByApp=entries.reduce((n,[d,e])=>n+C.daily(data,config,y,m-1,+d,e).extra,0);generatedExtra.push(row.extraHoursGeneratedByApp);}else row.extraHoursGeneratedByApp=null;if(active&&whole){row.extraHoursEstimatedForPayroll=C.calculate(data,config,y,m-1).hExtra;payrollExtra.push(row.extraHoursEstimatedForPayroll);}else row.extraHoursEstimatedForPayroll=null;row.extraCalculationLimit='Extras identificadas por el usuario y calculadas por Sintax son categorías separadas; no se añaden al total ni prueban abono real.';}
    if(wanted.has('nightHours')){row.nightHoursIdentified=sum(ns.map(([,e])=>e.nightHours));row.nightDaysWithClassification=ns.length;}
    let model;
    if(hasFinancial)model=R.month(data,config,period);
    if(wanted.has('rates'))row.historicalRates=rec?.rateConfig?{normal:cfg.rateNormal,holiday:cfg.rateNormal+cfg.plusFestivo,extra:cfg.rateExtra,extraCalculationActive:cfg.profile==='sintax'&&cfg.sintaxUnlocked,deductions:cfg.deductions.map(l=>({name:redact(l.name),pct:l.pct})),confirmed:rec.historicalStatus==='confirmed'}:null;
    if(wanted.has('realPayroll')){
     if(!whole){partialFinancial=true;row.realPayroll={unavailable:'La nómina es mensual; no se prorratea a días.'};}
     else {const p=model.payroll,irpf=p.deductions.filter(l=>l.kind==='irpf'&&num(l.amount));row.realPayroll={exists:p.exists,gross:p.gross,deductions:p.totalDed,net:p.net,received:p.received,irpf:irpf.length?sum(irpf.map(l=>l.amount)):p.exists&&p.deductionsComplete&&!p.deductions.some(l=>l.kind==='irpf')?0:null,incomesComplete:p.incomesComplete,deductionsComplete:p.deductionsComplete,grossSource:p.grossSource,deductionsSource:p.deductionsSource};
      if(plan.detail)row.payrollDetail={incomes:p.incomes.slice(0,20).map(l=>({name:redact(l.name),kind:l.kind,amount:l.amount})),deductions:p.deductions.slice(0,20).map(l=>({name:redact(l.name),kind:l.kind,base:l.base,pct:l.pct,amount:l.amount})),truncated:p.incomes.length>20||p.deductions.length>20};
      for(const k of Object.keys(actual))if(num(row.realPayroll[k])){actual[k].push(row.realPayroll[k]);actualCoverage[k].push(period);}
      for(const line of p.deductions){const key=line.kind+'|'+redact(line.name).trim().toLowerCase();let concept=concepts.get(key);if(!concept){concept={name:redact(line.name),kind:line.kind,amounts:[],periods:[],missing:[]};concepts.set(key,concept);}if(num(line.amount)){concept.amounts.push(line.amount);if(!concept.periods.includes(period))concept.periods.push(period);}else if(!concept.missing.includes(period))concept.missing.push(period);}
     }
    }
    if(wanted.has('estimates')){
     if(!whole){partialFinancial=true;row.estimate={unavailable:'La estimación mensual no se prorratea a días.'};}
     else {row.estimate={gross:model.hasEstimate?model.calc.bruto:null,deductions:model.hasEstimate?model.calc.totalDed:null,net:model.hasEstimate?model.calc.neto:null,historicalRatesAvailable:model.hasHistoricalRates,historicalRatesConfirmed:model.historicalConfirmed,parameters:model.hasEstimate?{normal:model.config.rateNormal,holiday:model.config.rateNormal+model.config.plusFestivo,extra:model.config.rateExtra,profile:model.config.profile,extraCalculationActive:model.config.sintaxUnlocked,deductions:model.config.deductions.map(l=>({name:redact(l.name),pct:l.pct}))}:null,parameterSource:model.hasHistoricalRates?'Tarifas guardadas del periodo':'Parámetros actuales de referencia; tarifas históricas no registradas',unavailableReason:model.hasEstimate?null:'No hay jornadas registradas ni horas extraordinarias aplicables para calcular este mes.'};if(model.hasEstimate){estimateCoverage.push(period);for(const k of Object.keys(estimated))estimated[k].push(row.estimate[k]);}}
    }
    if(wanted.has('realPayroll')&&wanted.has('estimates')&&whole)row.actualVsEstimate=model.comparison.map(c=>({label:c.label,actual:c.actual,estimated:c.estimated,difference:round(c.difference)}));
    if(plan.detail)for(const [d,e] of entries){dailyCount++;if(detail.length<62){const day={date:period+'-'+String(d).padStart(2,'0'),type:e.type,hours:e.hours,extraHours:e.extraHours??null,nightHours:e.nightHours??null,shift:redact(e.shift||''),segments:e.segments?C.copy(e.segments):null,breakMinutes:e.breakMinutes??null};detail.push(day);}}
    rows.push(row);
   }
   const totals={};for(const [metric,values] of [['hours',knownHours],['normalHours',normal],['holidayHours',holiday],['restDays',rests],['workDays',worked],['extraHours',extra],['nightHours',night]])if(wanted.has(metric))totals[metric]=round(sum(values));
   const out={period:{label:redact(g.label),from:g.from,to:g.to},totals,coverage:{expectedMonths:keys.length,monthsWithRecordedDays:recordedMonths.length,recordedMonths:recordedMonths.slice(0,120),closedMonths:closedMonths.length,monthsWithoutRecordedDays:missingMonths.length,missingMonths:missingMonths.slice(0,24),missingListTruncated:missingMonths.length>24,extraClassifiedMonths:extraKnown.length,nightClassifiedMonths:nightKnown.length},months:rows.filter(r=>r.hasRecordedDays||r.realPayroll?.exists||num(r.estimate?.gross)||r.historicalRates),monthRowsTruncated:false};
   if(wanted.has('extraHours'))out.extraCalculation={generatedHours:round(sum(generatedExtra)),estimatedPayrollHours:round(sum(payrollExtra)),generatedMonths:generatedExtra.length,estimatedPayrollMonths:payrollExtra.length,source:'Algoritmo común de Sintax, solo cuando está activo; no es clasificación manual ni confirmación de pago.'};
   if(wanted.has('realPayroll')){out.realPayroll=Object.fromEntries(Object.entries(actual).map(([k,v])=>[k,round(sum(v))]));out.realPayrollCoverage=Object.fromEntries(Object.entries(actualCoverage).map(([k,v])=>[k,{count:v.length,months:v.slice(0,120)}]));out.deductionConcepts=[...concepts.values()].slice(0,120).map(({amounts,...c})=>({...c,periods:c.periods.slice(0,120),missing:c.missing.slice(0,120),amount:round(sum(amounts)),monthsWithAmount:c.periods.length,monthsWithMissingAmount:c.missing.length}));out.conceptsTruncated=concepts.size>120;}
   if(wanted.has('estimates')){out.estimate=Object.fromEntries(Object.entries(estimated).map(([k,v])=>[k,round(sum(v))]));out.estimateCoverage={count:estimateCoverage.length,months:estimateCoverage.slice(0,120)};}
   if(partialFinancial)out.financialLimit='Los datos económicos mensuales se incluyen solo para meses enteros del intervalo; no se extrapolan ni prorratean.';
   if(plan.operation==='rank'){const metric=plan.metrics.find(k=>['hours','normalHours','holidayHours','restDays','workDays'].includes(k))||'hours',value=r=>r[{hours:'recordedHours',normalHours:'normalHours',holidayHours:'holidayHours',restDays:'restDays',workDays:'workDays'}[metric]];const maximum=Math.max(...rows.map(value).filter(num)),tied=rows.filter(r=>value(r)===maximum);out.ranking={metric,maximum:Number.isFinite(maximum)?maximum:null,tiedMonths:tied.length,tiedPeriods:tied.slice(0,24).map(r=>r.period),tiesTruncated:tied.length>24,top:rows.filter(r=>num(value(r))).sort((a,b)=>value(b)-value(a)||a.period.localeCompare(b.period)).slice(0,12).map(r=>({period:r.period,value:value(r)}))};}
   if(plan.detail)out.dailyDetail={entries:detail,totalRecordedDays:dailyCount,returned:detail.length,truncated:dailyCount>detail.length};
   return out;
  });
  const comparisons=[];if(plan.operation==='compare')for(let i=1;i<groups.length;i++){const a=groups[0],b=groups[i],difference={};for(const k of plan.metrics)if(num(a.totals[k])&&num(b.totals[k]))difference[k]=round(b.totals[k]-a.totals[k]);for(const source of ['realPayroll','estimate'])if(a[source]&&b[source])difference[source]=Object.fromEntries(Object.keys(a[source]).map(k=>[k,num(a[source][k])&&num(b[source][k])?round(b[source][k]-a[source][k]):null]));comparisons.push({from:a.period,to:b.period,difference,meaning:'Segundo intervalo menos primero; cada total conserva su propia cobertura. No se comparan estimaciones con dinero cobrado.'});}
  return {source:'Historial de jornadas de la cuenta actual y nóminas introducidas manualmente',currency:'EUR',availability:{complete:true,source:availability.source,updatedAt:availability.updatedAt,pendingChanges:!!availability.pendingChanges},groups,comparisons,limits:'Los totales abarcan solo datos registrados. Un mes o día sin registro no demuestra cero trabajo. Nóminas reales y estimaciones se separan; null significa No registrado, diferente de cero. Extra y nocturnidad son subconjuntos y no se añaden de nuevo a horas. No se inventan deducciones ni tarifas ausentes. Los resúmenes no incluyen notas libres ni identificadores. La copia local sin conexión puede estar desactualizada. El IRPF retenido es un pago a cuenta, no el resultado de la declaración.'};
 }
  function netSummary(context){return context.groups.map(g=>({period:g.period,months:g.months.map(r=>({period:r.period,real:num(r.realPayroll?.net)?r.realPayroll.net:null,estimated:num(r.estimate?.net)?r.estimate.net:null,source:num(r.realPayroll?.net)?'Nómina registrada':num(r.estimate?.net)?'Estimación de la app':'No registrado',available:num(r.realPayroll?.net)?r.realPayroll.net:num(r.estimate?.net)?r.estimate.net:null,parameters:r.estimate?.parameterSource||r.estimate?.unavailableReason||null})),realTotal:g.realPayroll?.net??null,estimatedTotal:g.estimate?.net??null,realMonths:g.realPayrollCoverage?.net.count||0,estimatedMonths:g.estimateCoverage?.count||0}));}
  const api={metrics,normalizePlan,preparePlan,catalog,query,netSummary};root.HorasAIHistory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
