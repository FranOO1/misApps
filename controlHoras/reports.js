/* Local reports only. No network, persistence, Auth session or Gemini access. */
(function(root){
 'use strict';
 const C=root.HorasCore||(typeof require==='function'?require('./core.js'):null);
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const nr='No registrado',sum=values=>values.length?values.reduce((a,b)=>a+b,0):null;
 const num=x=>typeof x==='number'&&Number.isFinite(x),hours=x=>num(x)?String(Math.round(x*100)/100).replace('.',',')+' h':nr;
 const money=x=>num(x)?new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(x)+' EUR':nr;
 const scalar=x=>x===null||x===undefined||x===''?nr:String(x);
 const active=map=>Object.values(map||{}).filter(Boolean);
 function hasPayroll(p){return !!p&&(['gross','deductionsTotal','net','received'].some(k=>num(p[k]))||active(p.incomes).length>0||active(p.deductions).length>0||!!p.note||p.incomesComplete===true||p.deductionsComplete===true);}
 function payroll(p){
  p=C.realPayroll(p||C.emptyPayroll());const incomes=active(p.incomes),deductions=active(p.deductions);
  const subtotalIncome=sum(incomes.filter(l=>num(l.amount)).map(l=>l.amount)),subtotalDeductions=sum(deductions.filter(l=>num(l.amount)).map(l=>l.amount));
  const incomeReady=p.incomesComplete&&incomes.every(l=>num(l.amount)),deductionReady=p.deductionsComplete&&deductions.every(l=>num(l.amount));
  const gross=num(p.gross)?p.gross:incomeReady?(subtotalIncome??0):null,totalDed=num(p.deductionsTotal)?p.deductionsTotal:deductionReady?(subtotalDeductions??0):null;
  const conflicts=[];
  if(num(p.gross)&&incomeReady&&Math.abs(p.gross-(subtotalIncome??0))>.011)conflicts.push('El bruto registrado difiere del desglose de ingresos en '+money(p.gross-(subtotalIncome??0))+'.');
  if(num(p.deductionsTotal)&&deductionReady&&Math.abs(p.deductionsTotal-(subtotalDeductions??0))>.011)conflicts.push('Las deducciones registradas difieren del desglose en '+money(p.deductionsTotal-(subtotalDeductions??0))+'.');
  if(num(gross)&&num(totalDed)&&num(p.net)&&Math.abs(gross-totalDed-p.net)>.011)conflicts.push('Bruto menos deducciones difiere del neto registrado en '+money(gross-totalDed-p.net)+'.');
  return {...p,incomes,deductions,subtotalIncome,subtotalDeductions,gross,totalDed,grossSource:num(p.gross)?'Total transcrito de nómina':incomeReady?'Suma de conceptos declarados completos':nr,deductionsSource:num(p.deductionsTotal)?'Total transcrito de nómina':deductionReady?'Suma de conceptos declarados completos':nr,exists:hasPayroll(p),conflicts};
 }
 function month(data,config,period,{generatedAt=new Date().toISOString()}={}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||+period.slice(0,4)<1900||+period.slice(0,4)>2200)throw Error('Periodo de informe no válido.');
  const [year,mm]=period.split('-').map(Number),m=mm-1,r=data[period]||{days:{}},c=C.calculate(data,config,year,m),cfg=C.cfgFor(data,config,year,m);
  const entries=Object.entries(r.days||{}).filter(([,e])=>e),hasHours=entries.length>0,hasEstimate=hasHours||c.hExtra>0;
  const shifts={},types={normal:0,festivo:0,descanso:0};for(const [,e] of entries){types[e.type]++;const shift=e.shift?.trim()||nr;shifts[shift] ||= {days:0,hours:0};shifts[shift].days++;shifts[shift].hours+=e.hours;}
  const knownExtra=entries.filter(([,e])=>num(e.extraHours)),knownNight=entries.filter(([,e])=>num(e.nightHours));
  const p=payroll(r.payroll),daily=Array.from({length:C.dim(year,m)},(_,i)=>{const d=i+1,e=r.days?.[d];if(!e)return {date:`${String(d).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${year}`,recorded:false};const info=C.daily(data,config,year,m,d,e);return {...C.copy(e),date:`${String(d).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${year}`,recorded:true,estimatedGross:info.bruto,estimatedExtra:info.extra,rate:info.rate};});
  const estimate={gross:hasEstimate?c.bruto:null,deductions:hasEstimate?c.totalDed:null,net:hasEstimate?c.neto:null};
  const comparison=[['Bruto',p.gross,estimate.gross],['Deducciones',p.totalDed,estimate.deductions],['Neto de nómina',p.net,estimate.net]].map(([label,actual,estimated])=>({label,actual,estimated,difference:num(actual)&&num(estimated)?actual-estimated:null}));
  return {period,year,month:m,title:months[m]+' '+year,generatedAt,currency:'EUR',hasHours,hasEstimate,closed:r.closed===true,historicalConfirmed:r.historicalStatus==='confirmed',config:cfg,calc:c,payroll:p,daily,types,shifts,normalHours:hasHours?c.hNormal:null,holidayHours:hasHours?c.hFestivo:null,totalHours:hasHours?c.hNormal+c.hFestivo:null,extraIdentified:sum(knownExtra.map(([,e])=>e.extraHours)),nightIdentified:sum(knownNight.map(([,e])=>e.nightHours)),extraCoverage:knownExtra.length,nightCoverage:knownNight.length,recordedDays:entries.length,comparison};
 }
 function available(data,config){
  const set=new Set(Object.keys(data));for(const period of [...set]){const [y,m]=period.split('-').map(Number),next=new Date(y,m,1),key=C.monthKey(next.getFullYear(),next.getMonth());if(next.getFullYear()<=2200&&C.calculate(data,config,next.getFullYear(),next.getMonth()).hExtra>0)set.add(key);}
  return [...set].sort().reverse();
 }
 function year(data,config,y,options={}){
  if(!Number.isInteger(y)||y<1900||y>2200)throw Error('Año de informe no válido.');
  const list=Array.from({length:12},(_,m)=>month(data,config,C.monthKey(y,m),options));
  const coverage=key=>list.filter(x=>num(key(x))).map(x=>x.period),realKeys={gross:m=>m.payroll.gross,deductions:m=>m.payroll.totalDed,net:m=>m.payroll.net,received:m=>m.payroll.received};
  const real={},realCoverage={};for(const [key,fn] of Object.entries(realKeys)){real[key]=sum(list.map(fn).filter(num));realCoverage[key]=coverage(fn);}
  const estimated={},estimateCoverage=list.filter(m=>m.hasEstimate).map(m=>m.period);for(const key of ['gross','deductions','net'])estimated[key]=sum(list.map(m=>m.hasEstimate?m.calc[{gross:'bruto',deductions:'totalDed',net:'neto'}[key]]:null).filter(num));
  const concepts={};for(const m of list)for(const line of m.payroll.deductions){const key=line.kind+'|'+line.name.trim().toLocaleLowerCase('es');const group=concepts[key] ||= {name:line.name||'Concepto sin nombre',kind:line.kind,amounts:[],periods:new Set(),missing:new Set()};if(num(line.amount)){group.amounts.push(line.amount);group.periods.add(m.period);}else group.missing.add(m.period);}
  return {year:y,months:list,totalHours:sum(list.map(m=>m.totalHours).filter(num)),hoursCoverage:coverage(m=>m.totalHours),real,realCoverage,estimated,estimateCoverage,concepts:Object.values(concepts).map(g=>({...g,amount:sum(g.amounts),periods:[...g.periods],missing:[...g.missing]})),missingData:list.filter(m=>!m.hasHours).map(m=>m.period),missingPayroll:list.filter(m=>!m.payroll.exists).map(m=>m.period)};
 }
 const legends=[
  'Procedencia: jornadas y detalles introducidos en Mis Horas; nóminas transcritas manualmente; cálculos de la app claramente separados. No se ha consultado una nómina oficial ni datos externos.',
  'Bruto: ingresos antes de deducciones. Neto de nómina: importe que figura tras descontarlas. Importe recibido: pago efectivamente recibido, solo si se registra; no se presupone igual al neto.',
  'IRPF: retención como pago a cuenta del impuesto. No determina el resultado final de la declaración. Las cotizaciones a la Seguridad Social y otras deducciones son conceptos separados.',
  'Horas realizadas: normales más festivas según el tipo principal de jornada. Descanso no aporta horas trabajadas. Las horas extraordinarias y nocturnas identificadas son subconjuntos que pueden coincidir con normales o festivas; no se vuelven a sumar al total.',
  'La clasificación manual de horas extra y nocturnas no modifica por sí sola el cálculo económico aprobado. No hay tarifa de nocturnidad configurada; los complementos reales se registran como conceptos de nómina.',
  'Tramos, pausas, turno y notas se muestran solo cuando están registrados. El total de horas introducido es el dato utilizado en el cálculo; no se reconstruyen horas ni nocturnidad a partir de horarios incompletos.',
  'Estimación: normales pagadas por tarifa normal, festivas por tarifa normal más plus y extras estimadas por tarifa extra. Deducción estimada = bruto estimado por porcentaje dividido entre 100. Neto estimado = bruto estimado menos deducciones estimadas.',
  'Sintax, cuando está activado: semana lunes-domingo y umbral de 40 horas normales más festivas. Se atribuye exceso desde el último día normal; festivos conservan tarifa. Las extras generadas se excluyen de normales pagadas y se estiman en el mes siguiente, sin afirmar que se han cobrado.',
  'Redondeo: los cálculos usan los valores numéricos sin redondear cada operación; los importes se presentan con dos decimales y las horas con hasta dos. Por ello sumar cifras ya redondeadas puede diferir unos céntimos.',
  'No registrado indica un dato ausente, distinto de un cero introducido. Un subtotal de conceptos incompletos no sustituye al total de nómina. Las tarifas históricas sin confirmar son las conservadas al migrar, no tarifas históricas verificadas.',
  'Sin registros o nómina suficientes no se puede concluir cuánto se trabajó en los días ausentes, cuánto se cobró realmente, si la nómina cumple el convenio ni el resultado fiscal definitivo. No se extrapolan meses ausentes. Comparar importes no demuestra por sí solo que la nómina sea correcta.'
 ];
 function paragraph(doc,text,{size=10,bold=false}={}){
  const lines=wrap(text,515,size);for(const line of lines){doc.need(size+6);doc.txt(40,line,{size,bold});doc.down(size+4);}doc.down(5);
 }
 function width(s,size){return [...String(s)].reduce((n,ch)=>n+(/[il.,:;' ]/.test(ch)?.28:/[MW@]/.test(ch)?.95:.61)*size,0);}
 function wrap(text,max,size){
  const lines=[];for(const source of String(text).split('\n')){let line='';for(const word of source.split(/\s+/)){if(!word)continue;let remainder=word;if(line&&width(line+' '+word,size)>max){lines.push(line);line='';}while(width(remainder,size)>max){let take=1;while(take<remainder.length&&width(remainder.slice(0,take+1),size)<=max)take++;if(line){lines.push(line);line='';}lines.push(remainder.slice(0,take));remainder=remainder.slice(take);}line+=line?' '+remainder:remainder;}lines.push(line||'');}return lines;
 }
 function table(doc,headers,rows,widths){
  const size=8.5,lineHeight=12;let heading;
  heading=()=>{const cols=headers.map((h,i)=>wrap(h,widths[i]-8,size));const count=Math.max(...cols.map(x=>x.length));doc.need(count*lineHeight+10);for(let j=0;j<count;j++){let x=40;for(let i=0;i<cols.length;i++){doc.txt(x,cols[i][j]||'',{size,bold:true});x+=widths[i];}doc.down(lineHeight);}doc.hr();doc.down(8);};
  doc.need(70);heading();
  for(const row of rows){const cols=row.map((x,i)=>wrap(x,widths[i]-8,size));let offset=0,total=Math.max(...cols.map(x=>x.length));if(total*lineHeight+12<=640&&doc.need(total*lineHeight+12))heading();while(offset<total){if(doc.need(lineHeight+7)){heading();if(offset>0)paragraph(doc,'Continuación: '+row[0],{size:8.5});}let x=40;for(let i=0;i<cols.length;i++){doc.txt(x,cols[i][offset]||'',{size});x+=widths[i];}doc.down(lineHeight);offset++;}doc.down(6);}doc.down(8);
 }
 function section(doc,title){doc.need(65);paragraph(doc,title,{size:12,bold:true});}
 function tramos(e){if(!e.segments?.length)return nr;return e.segments.map((s,i)=>`${i+1}: ${scalar(s.start)} - ${scalar(s.end)}; pausa ${num(s.breakMinutes)?s.breakMinutes+' min':nr}`).join('\n');}
 function pauses(e){if(num(e.breakMinutes))return e.breakMinutes+' min';if(e.segments?.length&&e.segments.every(s=>num(s.breakMinutes)))return e.segments.reduce((n,s)=>n+s.breakMinutes,0)+' min (suma tramos)';return nr;}
 function monthly(doc,m,{includeEconomic=true,identity='',includeLegend=true}={}){
  section(doc,'Informe mensual - '+m.title);if(identity)paragraph(doc,'Trabajador: '+identity);
  paragraph(doc,'Generado: '+new Date(m.generatedAt).toLocaleString('es-ES')+' · Moneda: EUR');
  paragraph(doc,'Procedencia: registros de Mis Horas y nómina introducida manualmente. '+(m.closed?'Registros del mes confirmados como completos.':'Integridad del mes sin confirmar; los días ausentes no se consideran cero.'));
  section(doc,'Horas y jornadas');
  paragraph(doc,'Total de horas realizadas registradas: '+hours(m.totalHours)+'. Normales: '+hours(m.normalHours)+'. Festivas: '+hours(m.holidayHours)+'.');
  paragraph(doc,'Extraordinarias identificadas: '+hours(m.extraIdentified)+` (${m.extraCoverage} jornadas con dato). Nocturnas identificadas: `+hours(m.nightIdentified)+` (${m.nightCoverage} jornadas con dato). Son subconjuntos; no se añaden al total.`);
  paragraph(doc,m.hasHours?`Días trabajados: ${m.calc.diasTrab}; descansos: ${m.calc.diasDesc}; días de tipo festivo: ${m.types.festivo}; jornadas registradas: ${m.recordedDays} de ${m.daily.length}.`:'Días trabajados, descansos y festivos: '+nr+'. No hay jornadas registradas.');
  if(m.hasHours){table(doc,['Tipo principal','Días'],[['Normal',m.types.normal],['Festivo',m.types.festivo],['Descanso',m.types.descanso]],[385,130]);table(doc,['Turno registrado','Días','Horas'],Object.entries(m.shifts).map(([label,v])=>[label,v.days,hours(v.hours)]),[275,90,150]);}
  section(doc,'Tabla diaria');
  if(!m.hasHours)paragraph(doc,'No hay registros diarios. '+nr+' no significa cero horas trabajadas.');
  else {const headers=['Fecha','Entrada / salida de tramos','Pausas','Horas','Tipo / condición','Turno'];const widths=[62,112,68,68,95,110];
   const rows=m.daily.map(e=>[e.date,e.recorded?tramos(e):nr,e.recorded?pauses(e):nr,e.recorded?hours(e.hours):nr,e.recorded?({normal:'Normal',festivo:'Festivo',descanso:'Descanso'}[e.type]+(num(e.extraHours)?'\nExtra: '+hours(e.extraHours):'')+(num(e.nightHours)?'\nNoche: '+hours(e.nightHours):'')):nr,e.recorded?scalar(e.shift):nr]);table(doc,headers,rows,widths);
   if(includeEconomic){section(doc,'Tabla diaria - notas');table(doc,['Fecha','Notas registradas'],m.daily.map(e=>[e.date,e.recorded?scalar(e.notes):nr]),[75,440]);}
  }
  if(includeEconomic){
   section(doc,'Datos reales de nómina');paragraph(doc,m.payroll.exists?'Fuente: datos transcritos por el usuario'+(m.payroll.recordedAt?' · Guardados: '+new Date(m.payroll.recordedAt).toLocaleString('es-ES'):'')+'.':'Nómina: '+nr+'.');
   table(doc,['Ingreso / concepto','Categoría','Importe'],m.payroll.incomes.length?m.payroll.incomes.map(l=>[l.name||nr,{base:'Salario base',complement:'Complemento',extra:'Horas extra',holiday:'Festivos',extraPay:'Paga extraordinaria',arrears:'Atrasos',other:'Otro'}[l.kind],money(l.amount)]):[[nr,nr,nr]],[250,145,120]);
   paragraph(doc,'Subtotal de ingresos con importe registrado: '+money(m.payroll.subtotalIncome)+'. Desglose '+(m.payroll.incomesComplete?'declarado completo.':'parcial o sin confirmar; no sustituye al bruto.'));
   table(doc,['Deducción / concepto','Tipo','Base','Porcentaje','Importe'],m.payroll.deductions.length?m.payroll.deductions.map(l=>[l.name||nr,{irpf:'IRPF',socialSecurity:'Seguridad Social',other:'Otra'}[l.kind],money(l.base),num(l.pct)?scalar(l.pct)+' %':nr,money(l.amount)]):[[nr,nr,nr,nr,nr]],[160,105,85,70,95]);
   paragraph(doc,'Subtotal de deducciones con importe registrado: '+money(m.payroll.subtotalDeductions)+'. Desglose '+(m.payroll.deductionsComplete?'declarado completo.':'parcial o sin confirmar; no sustituye al total.'));
   table(doc,['Total de nómina','Valor','Procedencia'],[['Bruto',money(m.payroll.gross),m.payroll.grossSource],['Deducciones',money(m.payroll.totalDed),m.payroll.deductionsSource],['Neto de nómina',money(m.payroll.net),num(m.payroll.net)?'Transcrito de nómina':nr],['Importe efectivamente recibido',money(m.payroll.received),num(m.payroll.received)?'Registrado por separado':nr]],[165,115,235]);
   paragraph(doc,'IRPF con importe registrado: '+money(sum(m.payroll.deductions.filter(l=>l.kind==='irpf'&&num(l.amount)).map(l=>l.amount)))+'. No se infiere de otras deducciones.');
   for(const conflict of m.payroll.conflicts)paragraph(doc,'Advertencia de coherencia: '+conflict);if(m.payroll.note)paragraph(doc,'Notas de nómina: '+m.payroll.note);
   section(doc,'Estimación de la app');paragraph(doc,m.historicalConfirmed?'Tarifas del periodo confirmadas por el usuario.':'Tarifas históricas sin confirmar; se conservan los parámetros disponibles al migrar o registrar el periodo.');
   table(doc,['Parámetro del periodo','Valor'],[['Tarifa normal',money(m.config.rateNormal)+'/h'],['Tarifa festiva total',money(m.config.rateNormal+m.config.plusFestivo)+'/h'],['Plus festivo',money(m.config.plusFestivo)+'/h'],['Tarifa extra',money(m.config.rateExtra)+'/h'],['Perfil',C.extraActive(m.config)?'Sintax activado':'Sin extras Sintax activadas']],[335,180]);
   paragraph(doc,'Bruto = '+hours(m.hasEstimate?m.calc.hNormalPaid:null)+' normales pagadas × tarifa normal + '+hours(m.hasEstimate?m.calc.hFestivo:null)+' festivas × (normal + plus) + '+hours(m.hasEstimate?m.calc.hExtra:null)+' extra del mes anterior × tarifa extra.');
   paragraph(doc,'Extras calculadas Sintax generadas para el mes siguiente: '+hours(m.hasHours?m.calc.hExtraGen:null)+'. Son una estimación, distinta de las extras identificadas manualmente y del pago real.');
   if(m.hasEstimate&&m.hasHours)table(doc,['Fecha','Horas normales excluidas por Sintax','Tarifa aplicable','Importe diario estimado'],m.daily.filter(e=>e.recorded).map(e=>[e.date,hours(e.estimatedExtra),money(e.rate)+'/h',money(e.estimatedGross)]),[75,180,130,130]);
   table(doc,['Deducción estimada','Base estimada','Porcentaje','Importe estimado'],m.calc.dets.map(d=>[d.name,money(m.hasEstimate?m.calc.bruto:null),scalar(d.pct)+' %',money(m.hasEstimate?d.amount:null)]),[200,110,80,125]);
   table(doc,['Total estimado','Valor'],[['Bruto estimado',money(m.hasEstimate?m.calc.bruto:null)],['Retenciones y deducciones estimadas',money(m.hasEstimate?m.calc.totalDed:null)],['Neto estimado (no dinero cobrado)',money(m.hasEstimate?m.calc.neto:null)]],[335,180]);
   section(doc,'Comparación: nómina real menos estimación');table(doc,['Concepto','Nómina real','Estimación','Diferencia'],m.comparison.map(x=>[x.label,money(x.actual),money(x.estimated),money(x.difference)]),[170,115,115,115]);paragraph(doc,'Solo se cuantifican diferencias cuando ambos importes están disponibles. La comparación no certifica la nómina ni el convenio.');
  }else paragraph(doc,'Informe sin información económica: se omiten nómina, importes, tarifas, porcentajes y notas libres.');
  if(includeLegend){section(doc,'Leyendas, fórmulas y límites');for(const text of legends)paragraph(doc,text,{size:9});}
 }
 function annual(doc,a,{includeEconomic=true,identity=''}={}){
  section(doc,'Informe anual - '+a.year);if(identity)paragraph(doc,'Trabajador: '+identity);
  paragraph(doc,'Generado: '+new Date(a.months[0].generatedAt).toLocaleString('es-ES')+' · Moneda: EUR. Un único PDF con resumen y detalle de enero a diciembre.');
  paragraph(doc,'Horas realizadas registradas: '+hours(a.totalHours)+' · Meses incluidos: '+(a.hoursCoverage.join(', ')||nr)+'. No se extrapolan los meses sin registros.');
  if(includeEconomic){section(doc,'Totales reales registrados');for(const [k,label] of [['gross','Bruto real registrado'],['deductions','Deducciones reales registradas'],['net','Neto real registrado'],['received','Importe recibido registrado']])paragraph(doc,label+': '+money(a.real[k])+'. Meses incluidos: '+(a.realCoverage[k].join(', ')||nr)+'.');
   table(doc,['Deducción anual por concepto','Tipo','Importe disponible','Meses con importe / faltantes'],a.concepts.length?a.concepts.map(x=>[x.name,{irpf:'IRPF',socialSecurity:'Seguridad Social',other:'Otra'}[x.kind],money(x.amount),(x.periods.join(', ')||nr)+(x.missing.length?' · Falta importe: '+x.missing.join(', '):'')]):[[nr,nr,nr,nr]],[165,90,110,150]);
   section(doc,'Totales estimados de la app');paragraph(doc,'Bruto estimado: '+money(a.estimated.gross)+'. Deducciones estimadas: '+money(a.estimated.deductions)+'. Neto estimado: '+money(a.estimated.net)+'. Meses incluidos: '+(a.estimateCoverage.join(', ')||nr)+'. No son importes realmente cobrados.');
   section(doc,'Tabla comparativa mensual');table(doc,['Mes','Horas','Bruto real','Deducciones reales','Neto real','Bruto estimado','Neto estimado'],a.months.map(m=>[m.title,hours(m.totalHours),money(m.payroll.gross),money(m.payroll.totalDed),money(m.payroll.net),money(m.hasEstimate?m.calc.bruto:null),money(m.hasEstimate?m.calc.neto:null)]),[86,49,76,76,76,76,76]);
  }else table(doc,['Mes','Horas registradas','Cobertura de jornadas'],a.months.map(m=>[m.title,hours(m.totalHours),m.hasHours?m.recordedDays+' días registrados':'Sin datos'] ),[200,140,175]);
  paragraph(doc,'Meses sin jornadas: '+(a.missingData.join(', ')||'Ninguno')+'. Meses sin nómina introducida: '+(a.missingPayroll.join(', ')||'Ninguno')+'. Un año con meses ausentes o desgloses incompletos no se presenta como completo.');
  section(doc,'Leyendas, fórmulas y límites');for(const text of legends)paragraph(doc,text,{size:9});
  for(const m of a.months){doc.addPage();monthly(doc,m,{includeEconomic,identity,includeLegend:false});}
 }
 function context(model,{annualReport=false,includeEconomic=false,question=''}={}){
  const list=annualReport?model.months:[model],out=['Contexto de un informe de Mis Horas. No interpretes estimaciones como dinero cobrado. Los datos son parciales salvo confirmación explícita. No inventes datos ausentes ni sumes categorías de horas que se solapan.'];
  for(const text of legends)out.push(text);
  for(const m of list){const p={period:m.period,recordedHours:m.totalHours,normalHours:m.normalHours,holidayHours:m.holidayHours,identifiedExtraHours:m.extraIdentified,identifiedNightHours:m.nightIdentified,recordedDays:m.recordedDays,totalDays:m.daily.length,recordsConfirmedComplete:m.closed,types:m.types,shifts:m.shifts,daily:m.daily.map(e=>e.recorded?{date:e.date,hours:e.hours,type:e.type,segments:e.segments||null,breakMinutes:e.breakMinutes??null,shift:e.shift||null,extraHours:e.extraHours??null,nightHours:e.nightHours??null,...(includeEconomic?{notes:e.notes||null}:{})}:{date:e.date,recorded:false})};
   if(includeEconomic){p.realPayroll=m.payroll.exists?{incomes:m.payroll.incomes,deductions:m.payroll.deductions,gross:m.payroll.gross,deductionsTotal:m.payroll.totalDed,net:m.payroll.net,received:m.payroll.received,incomesComplete:m.payroll.incomesComplete,deductionsComplete:m.payroll.deductionsComplete,note:m.payroll.note,conflicts:m.payroll.conflicts}:null;p.estimate=m.hasEstimate?{...m.calc,parameters:C.financial(m.config),historicalRatesConfirmed:m.historicalConfirmed}:null;p.comparison=m.comparison;}out.push(JSON.stringify(p,null,2));}
  if(annualReport){const summary={year:model.year,recordedHours:model.totalHours,hoursCoverage:model.hoursCoverage,...(includeEconomic?{realTotals:model.real,realCoverage:model.realCoverage,estimatedTotals:model.estimated,estimateCoverage:model.estimateCoverage,deductionsByConcept:model.concepts.map(c=>({name:c.name,kind:c.kind,amount:c.amount,monthsWithAmount:c.periods,monthsWithoutAmount:c.missing}))}:{})};out.push('Resumen anual calculado localmente:\n'+JSON.stringify(summary,null,2));}
  if(annualReport)out.push('Meses sin jornadas: '+model.missingData.join(', ')+'. Sin nómina: '+model.missingPayroll.join(', ')+'.');
  out.push(includeEconomic?'Incluye información económica registrada y estimada.':'Sin importes, tarifas, porcentajes ni notas libres.','Mi pregunta:\n'+(question||'[Escribe aquí tu pregunta]'));return out.join('\n\n');
 }
 const api={months,nr,num,hours,money,hasPayroll,payroll,month,year,available,legends,wrap,monthly,annual,context};if(typeof module!=='undefined')module.exports=api;else root.HorasReports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
