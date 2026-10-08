// AI-only helpers. No storage migration or change to the app's calculations.
(function(root){
  const fields=['gross','deductions','net','normalHours','holidayHours','extraHours','normalRate','holidayRate','extraRate'];
  const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
  function redact(text,identifiers=[]){
    let out=String(text||'');
    for(const value of identifiers)if(typeof value==='string'&&value.trim().length>2)out=out.split(value).join('[identificación omitida]');
    return out.replace(/\b[A-Z]{2}\s?\d{2}(?:[\s-]?[A-Z0-9]){10,30}\b/gi,'[IBAN omitido]')
      .replace(/\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi,'[DNI/NIE omitido]')
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,'[correo omitido]')
      .replace(/\b\d{2}[\s/-]?\d{8}[\s/-]?\d{2}\b/g,'[afiliación omitida]')
      .replace(/^.*(?:trabajador(?:a)?|nombre|domicilio|dirección|n\.?i\.?f|c\.?i\.?f|empresa|cuenta bancaria|teléfono)\s*[:：].*$/gim,'[identificación omitida]');
  }
  function normalizePayroll(p){
    if(!plain(p)||Object.keys(p).some(k=>!['period','complete','missing',...fields].includes(k)))throw {kind:'invalid'};
    if(p.period!==null&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period)||+p.period.slice(0,4)<1900||+p.period.slice(0,4)>2200))throw {kind:'invalid'};
    const out={period:p.period};
    for(const k of fields){const v=p[k],max=k.includes('Hours')?1000:k.includes('Rate')?100000:10000000;if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max))throw {kind:'invalid'};out[k]=v;}
    if(typeof p.complete!=='boolean'||!Array.isArray(p.missing)||p.missing.length>30||p.missing.some(x=>typeof x!=='string'||x.length>300))throw {kind:'invalid'};
    return {...out,complete:p.complete,missing:[...p.missing]};
  }
  function comparePayroll(facts,expected,confirmed=false){
    const p=normalizePayroll(facts),limits=[...p.missing],differences=[],checked=[];
    if(!expected||!p.period||expected.period!==p.period)return {status:'unknown',label:'No se puede comprobar con la información disponible',differences,checked,limits:[...limits,'Falta el periodo o sus registros.']};
    if(!confirmed)limits.push('No se han confirmado registros completos ni que las tarifas actuales correspondan a este periodo. No hay tarifas históricas verificadas.');
    if(!p.complete)limits.push('La extracción indica que faltan conceptos salariales, bases, horas o información aplicable.');
    const labels={gross:'Bruto',deductions:'Retenciones',net:'Neto',normalHours:'Horas normales pagadas',holidayHours:'Horas festivas',extraHours:'Horas extra abonadas',normalRate:'Tarifa normal',holidayRate:'Tarifa festiva total',extraRate:'Tarifa extra'};
    for(const k of fields){if(p[k]===null){if(['gross','deductions','net','normalHours','holidayHours'].includes(k))limits.push('Falta '+labels[k]+'.');continue;}
      const tolerance=k.includes('Hours')?.01:k.includes('Rate')?.0001:.02,unit=k.includes('Hours')?'h':k.includes('Rate')?'€/h':'€';
      if(!Number.isFinite(expected[k])){limits.push('No se pudo calcular '+labels[k]+'.');continue;}
      const pair={label:labels[k],actual:p[k],expected:expected[k],unit};checked.push(pair);if(Math.abs(p[k]-expected[k])>tolerance)differences.push(pair);
    }
    const status=!confirmed?'unknown':differences.length?'different':limits.length?'unknown':'match';
    return {status,label:{match:'Cuadra con los datos disponibles',different:'Hay diferencias',unknown:'No se puede comprobar con la información disponible'}[status],differences,checked,limits};
  }
  async function extractPDF(file,library){
    if(!file||file.size>10*1024*1024)throw Error('PDF demasiado grande: máximo 10 MB. No se ha enviado.');
    const data=new Uint8Array(await file.arrayBuffer());if(String.fromCharCode(...data.slice(0,5))!=='%PDF-')throw Error('El archivo no es un PDF válido. No se ha enviado.');
    let pdf;try{pdf=await library.getDocument({data,isEvalSupported:false}).promise;}catch{throw Error('PDF ilegible, dañado o protegido. No se ha enviado.');}
    try{
      if(!Number.isInteger(pdf.numPages)||pdf.numPages<1||pdf.numPages>40)throw Error('PDF vacío o de más de 40 páginas. No se ha enviado.');
      const pages=[],unread=[];let length=0;
      for(let i=1;i<=pdf.numPages;i++){
        let content;try{content=await (await pdf.getPage(i)).getTextContent();}catch{throw Error('No se pudo leer la página '+i+'. No se ha enviado ni comprobado la nómina.');}
        let text='',lastY=null;
        for(const item of content.items){const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>3)text+='\n';text+=String(item.str||'')+' ';if(item.hasEOL)text+='\n';lastY=y;}
        if(text.trim().length<30||!/[A-Za-zÁÉÍÓÚáéíóúÑñ]{3}/.test(text))unread.push(i);
        length+=text.length;if(length>120000)throw Error('PDF supera 120.000 caracteres. No se ha recortado ni enviado; prepara un PDF del periodo correspondiente.');
        pages.push('Página '+i+':\n'+text);
      }
      if(unread.length)throw Error('Extracción no fiable en páginas '+unread.join(', ')+'. Puede ser un PDF escaneado o incompleto. No se ha enviado ni comprobado. Usa un PDF con texto.');
      return {text:pages.join('\n\n'),pages:pdf.numPages};
    }finally{await pdf.destroy();}
  }
  const api={fields,redact,normalizePayroll,comparePayroll,extractPDF};if(typeof module!=='undefined')module.exports=api;else root.HorasAIData=api;
})(globalThis);
