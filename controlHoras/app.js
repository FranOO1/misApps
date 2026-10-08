    // ============================================================
    // MOTOR DE VIBRACIÓN HÁPTICA
    // ============================================================
    const vibrate = (ms) => {
      if (navigator.vibrate) {
        try { navigator.vibrate(ms); } catch (e) {}
      }
    };

    // ============================================================
    // ESTADO GLOBAL Y CONFIGURACIÓN
    // ============================================================
    const DEFAULT_CONFIG = {
      userName: "",
      rateNormal: 9.6696, plusFestivo: 7.25, profile: "ett", sintaxUnlocked: false, rateExtra: 0, hideMoney: false,
      deductions: [
        { id: "d1", name: "Retención IRPF", pct: 2.0 },
        { id: "d2", name: "Contingencias comunes", pct: 4.7 },
        { id: "d3", name: "Desempleo", pct: 1.6 },
        { id: "d4", name: "Formación profesional", pct: 0.1 },
        { id: "d5", name: "MEI", pct: 0.15 },
      ]
    };

    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const DIAS_SEMANA = ["L","M","X","J","V","S","D"];
    const TYPES = {
      normal:   { label: "Normal",   color: "#4FA3FF", bg: "rgba(79,163,255,0.18)" },
      festivo:  { label: "Festivo",  color: "#FFB04F", bg: "rgba(255,176,79,0.20)" },
      descanso: { label: "Descanso", color: "#C1CADB", bg: "rgba(193,202,219,0.12)" },
    };

    const state = {
      year: new Date().getFullYear(), month: new Date().getMonth(),
      config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      allData: {},
      tab: "mes", selectedDay: null, draft: null, dayConfirmed: false,
      chatMsgs: [], chatInput: "", chatLoading: false,
      nomina: { status: "idle", result: null, error: null },
      pdfReady: null
    };

    const eur = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
    const fmt = (n) => state.config.hideMoney ? "•••• €" : eur(n);
    const fmtH = (n) => String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ",");
    const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
    const extraActive = (cfg) => cfg.profile === "sintax" && cfg.sintaxUnlocked;
    const C = HorasCore;
    const esc = C.escapeHTML;
    const periodConfig = (y=state.year,m=state.month) => C.cfgFor(state.allData,state.config,y,m);
    const monthly = (y=state.year,m=state.month) => C.calculate(state.allData,state.config,y,m);
    const payload = () => ({schemaVersion:3,config:{...state.config,hideMoney:false},data:state.allData});
    let privacy = localStorage.getItem('horas-hide-money');
    const legacy = localStorage.getItem('horas-app-v2');
    if(privacy===null && legacy) {try {privacy=JSON.parse(legacy).config?.hideMoney?'1':'0';} catch {}}
    state.config.hideMoney=privacy==='1';
    const saveState = () => {try {sync.save();} catch(e) {alert(e.message);}};
    function ensurePeriod() {
      const mk=monthKey(state.year,state.month);
      if(!state.allData[mk])state.allData[mk]={days:{},rateConfig:C.financial(state.config),historicalStatus:'confirmed'};
      return state.allData[mk];
    }
    window.toggleMoney = () => {
      state.config.hideMoney=!state.config.hideMoney;
      localStorage.setItem('horas-hide-money',state.config.hideMoney?'1':'0');
      if(state.config.hideMoney){state.chatMsgs=[];state.chatLoading=false;state.nomina={status:'idle',result:null,error:null};aiGeneration++;}
      render();
    };

    // ============================================================
    // NUBE: FIREBASE (LOGIN GOOGLE + FIRESTORE)
    // ============================================================
    const firebaseConfig = {
      apiKey: "AIzaSyBkQ4NcoxU0V_R3jXnkH5Eu9WRDpr9eKXo",
      authDomain: "mishoras-bb0cc.firebaseapp.com",
      projectId: "mishoras-bb0cc",
      storageBucket: "mishoras-bb0cc.firebasestorage.app",
      messagingSenderId: "282064047722",
      appId: "1:282064047722:web:24a04aabeecb4a67394413"
    };

    const cloud = {ready:false,user:null,status:'local',errorMsg:''};
    let aiGeneration=0;
    const sync=HorasSync.create({defaults:DEFAULT_CONFIG,getState:payload,
      apply:p=>{const hidden=state.config.hideMoney;state.config={...p.config,hideMoney:hidden};state.allData=p.data;if(state.selectedDay && state.dayConfirmed){const e=state.allData[monthKey(state.year,state.month)]?.days[state.selectedDay];if(e)state.draft={...e};else state.selectedDay=null;}},
      onStatus:(kind,message)=>{cloud.status=kind;cloud.errorMsg=message;const el=document.getElementById('cloud-status');if(el)el.textContent=message;if(['ok','error','offline'].includes(kind))queueMicrotask(()=>{if(!document.activeElement?.matches('input,textarea,select'))render();});},
      db:{collection:(...args)=>cloud.db.collection(...args),runTransaction:(...args)=>cloud.db.runTransaction(...args)},FieldPath:class {constructor(...parts){return new firebase.firestore.FieldPath(...parts);}}
    });
    function loadScript(url) {
      return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(Error('Dependencia no disponible'));document.head.append(script);});
    }
    async function initCloud() {
      try {
        for(const name of ['app','auth','firestore'])await loadScript(`https://www.gstatic.com/firebasejs/12.10.0/firebase-${name}-compat.js`);
        firebase.initializeApp(firebaseConfig);cloud.db=firebase.firestore();
        try {await cloud.db.enablePersistence({synchronizeTabs:true});}catch {} // Local journal is always persisted separately.
        cloud.ready=true;
        firebase.auth().getRedirectResult().catch(()=>{});
        firebase.auth().onAuthStateChanged(user=>{
          if(cloud.user?.uid!==user?.uid){aiGeneration++;state.chatMsgs=[];state.chatInput='';state.chatLoading=false;state.nomina={status:'idle',result:null,error:null};state.selectedDay=null;state.draft=null;}
          cloud.user=user;try{sync.switchAccount(user);}catch{}render();
        });
      }catch {cloud.status='local';cloud.errorMsg='Nube no disponible. Puedes registrar horas aquí.';render();}
    }
    window.loginGoogle=async()=>{
      if(!cloud.ready){alert('Nube no disponible. Revisa la conexión y vuelve a abrir la app.');return;}
      try{await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());}
      catch(e){if(e.code==='auth/popup-blocked')await firebase.auth().signInWithRedirect(new firebase.auth.GoogleAuthProvider());else alert('No se pudo iniciar sesión. Puedes seguir usando la copia local.');}
    };
    window.logoutGoogle=async()=>{
      try{await firebase.auth().signOut();}catch{alert('No se pudo cerrar sesión. Inténtalo de nuevo.');}
    };
    window.forceCloudPull=async()=>{
      if(!confirm('Se sustituirá la copia local de esta cuenta con la nube. Se guardará una recuperación antes. Las ediciones pendientes deben sincronizarse primero.'))return;
      try{await sync.pull();render();alert('Datos descargados. Copia previa disponible en Ajustes.');}catch(e){alert(e.message);}
    };
    window.retrySync=()=>sync.flush();
    window.exportRecovery=()=>{
      const raw=sync.recovery()||localStorage.getItem('horas-original-v2');
      if(!raw){alert('No hay copias de recuperación.');return;}
      processDownload(new Blob([raw],{type:'application/json'}),'Recuperacion_Horas.json');
    };
    window.copyGuest=()=>{
      if(!cloud.user)return;
      const raw=localStorage.getItem('horas-app-v3:guest');if(!raw){alert('No hay datos sin cuenta.');return;}
      const p=C.validateBackup(JSON.parse(raw).payload,DEFAULT_CONFIG);replaceFromBackup(p,'Copiar los datos sin cuenta');
    };
    window.addEventListener('offline',()=>sync.setOnline(false));
    window.addEventListener('online',()=>sync.setOnline(true));

    const hoursColor=C.hoursColor;
    const getEntry=C.entry;
    function calcWeekInfo(date) {
      const monday=new Date(date.getFullYear(),date.getMonth(),date.getDate()-((date.getDay()+6)%7));
      const sunday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6);
      let hNormal=0,hFestivo=0,dias=0;
      for(let i=0;i<7;i++){const e=getEntry(state.allData,new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i));if(!e||e.type==='descanso')continue;if(e.hours>0)dias++;if(e.type==='festivo')hFestivo+=e.hours;else hNormal+=e.hours;}
      const today=new Date();today.setHours(0,0,0,0);
      return {monday,sunday,hNormal,hFestivo,total:hNormal+hFestivo,dias,isCurrent:today>=monday&&today<=sunday,isClosed:sunday<today};
    }
    const fmtDia=d=>`${d.getDate()} ${MESES_CORTO[d.getMonth()].toLowerCase()}`;
    const calcExtraMap=(data,y,m)=>C.extraMap(data,y,m);
    const calcExtraInfo=(data,y,m)=>C.extraInfo(data,state.config,y,m);
    const calcMonth=C.calcMonth;

    function calcProjection(monthData, calcResult, config, year, month, daysInMonth) {
      const today = new Date();
      if (month !== today.getMonth() || year !== today.getFullYear()) return null;
      
      const elapsed = today.getDate();
      const remaining = Array.from({length:daysInMonth-elapsed},(_,i)=>elapsed+i+1).filter(d=>!monthData[d]).length;
      if (remaining <= 0) return null;

      let workedH = 0, workedDays = 0;
      for (let d = 1; d <= elapsed; d++) {
        const e = monthData[d];
        if (!e || e.type === "descanso") continue;
        const h = Number(e.hours) || 0;
        if (h > 0) { workedDays++; workedH += h; }
      }
      
      if (workedDays < 3) return null;
      
      const avgH = workedH / workedDays;
      const projWorkDays = remaining * (workedDays / elapsed); 
      const projExtraH = projWorkDays * avgH;
      const projBruto = calcResult.bruto + projExtraH * config.rateNormal;
      const projDed = config.deductions.reduce((s, d) => s + (projBruto * d.pct) / 100, 0);
      
      return { projBruto, projNeto: projBruto - projDed, avgH, remaining };
    }

    function getAnnualData() {
      const rows = [];
      for (let m = 0; m < 12; m++) {
        const k = monthKey(state.year, m);
        const rec = state.allData[k];
        const dim = new Date(state.year, m + 1, 0).getDate();
        const c = monthly(state.year,m);
        rows.push({ m, name: MESES_CORTO[m], neto: c ? c.neto : 0, bruto: c?.bruto||0, horas: c ? c.hNormal + c.hFestivo : 0, dias: c?.diasTrab||0, diasDesc: c?.diasDesc||0, hasData: !!(rec && Object.values(rec.days||{}).some(Boolean)) });
      }
      return rows;
    }

    // ============================================================
    // GENERADOR PDF NATIVO VANILLA JS + DESCARGA BASE64
    // ============================================================
    const eurPdf = (n) => (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    
    const BS = String.fromCharCode(92);
    
    function pdfEsc(s) {
      let out = "";
      for (const ch of String(s)) {
        const c = ch.codePointAt(0);
        if (c === 0x20AC) out += String.fromCharCode(128); else if (c === 0x2014 || c === 0x2013) out += "-";
        else if (c === 0x00B7) out += String.fromCharCode(183); else if (c > 255) out += "?"; else out += ch;
      }
      return out.split(BS).join(BS+BS).split("(").join(BS+"(").split(")").join(BS+")");
    }

    function createPdfDoc() {
      const pages = [[]]; let y = 786;
      const cur = () => pages[pages.length - 1];
      const addPage = () => { pages.push([]); y = 786; };
      const need = (h) => { if (y - h < 56) addPage(); };
      const txt = (x, s, o = {}) => {
        const size = o.size || 10; const tx = o.right ? x - (String(s).length * size * 0.5) : x;
        const col = o.color || (o.gray ? "0.45 0.48 0.55" : "0.08 0.1 0.14");
        cur().push(`BT /${o.bold ? "F2" : "F1"} ${size} Tf ${col} rg 1 0 0 1 ${tx.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEsc(s)}) Tj ET`);
      };
      const hr = () => { cur().push(`0.8 0.82 0.86 RG 0.6 w 40 ${(y + 3).toFixed(1)} m 555 ${(y + 3).toFixed(1)} l S`); };
      const down = (h) => { y -= h; };
      return { pages, txt, hr, down, need, addPage };
    }

    function assemblePdf(pages) {
      let out = "%PDF-1.4\n"; const offsets = []; const push = (s) => { offsets.push(out.length); out += s; };
      const n = pages.length; const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
      push(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n`);
      push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n`);
      push(`3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n`);
      push(`4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj\n`);
      pages.forEach((opsArr, i) => {
        const content = opsArr.join("\n");
        push(`${5 + i * 2} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >> endobj\n`);
        push(`${6 + i * 2} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`);
      });
      const xrefPos = out.length; const total = 5 + n * 2;
      out += `xref\n0 ${total}\n0000000000 65535 f \n`;
      offsets.forEach((o) => { out += String(o).padStart(10, "0") + " 00000 n \n"; });
      out += `trailer << /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
      return out;
    }

    function buildMonthReport(doc, yy, mm) {
      const k = monthKey(yy, mm); const rec = state.allData[k] || { days: {} };
      const dim = new Date(yy, mm + 1, 0).getDate();
      const cfg=periodConfig(yy,mm);
      const c=monthly(yy,mm);
      
      doc.need(60); 
      doc.txt(40, `Resumen de horas - ${MESES[mm]} ${yy}`, { size: 16, bold: true }); doc.down(16);
      
      if(state.config.userName) {
        doc.txt(40, `Trabajador: ${state.config.userName}`, { size: 10, gray: false, bold: true }); doc.down(16);
      }

      doc.txt(40, `Tarifa normal ${cfg.rateNormal.toFixed(4)} EUR/h  ·  Festivo ${(cfg.rateNormal + cfg.plusFestivo).toFixed(4)} EUR/h`, { size: 9, gray: true }); doc.down(22);
      doc.need(20); doc.txt(40, "DIA", { size: 8.5, bold: true, gray: true }); doc.txt(170, "TIPO", { size: 8.5, bold: true, gray: true }); doc.txt(390, "HORAS", { size: 8.5, bold: true, gray: true, right: true }); doc.txt(555, "IMPORTE", { size: 8.5, bold: true, gray: true, right: true }); doc.down(5); doc.hr(); doc.down(13);

      for (let d = 1; d <= dim; d++) {
        const e = (rec.days||{})[d]; if (!e) continue;
        const h=e.hours;const info=C.daily(state.allData,state.config,yy,mm,d,e),imp=info.bruto;
        doc.need(13); doc.txt(40, `${d} ${MESES_CORTO[mm]}`, { size: 9.5 }); doc.txt(170, TYPES[e.type].label+(info.extra?' / '+info.extra+' extra pendiente':''), { size: 9.5, gray: e.type === "descanso" }); doc.txt(390, e.type === "descanso" ? "-" : String(h), { size: 9.5, right: true }); doc.txt(555, e.type === "descanso" ? "-" : eurPdf(imp), { size: 9.5, right: true }); doc.down(13);
      }
      doc.down(2); doc.hr(); doc.down(16); doc.need(15);
      doc.txt(40, `Dias: ${c.diasTrab} trab. / ${c.diasDesc} desc.   ·   H: ${c.hNormalPaid} norm. / ${c.hFestivo} fest.`, { size: 9.5 }); doc.down(14);
      if(extraActive(cfg)){doc.need(30);doc.txt(40,`Extras generadas pendientes del mes siguiente: ${fmtH(c.hExtraGen)} h`,{size:9});doc.down(13);doc.txt(40,`Extras del mes anterior estimadas en este mes: ${fmtH(c.hExtra)} h / ${eurPdf(c.brutoExtra)}`,{size:9});doc.down(15);}
      doc.need(15); doc.txt(40, "Total bruto", { size: 10.5, bold: true }); doc.txt(555, eurPdf(c.bruto), { size: 10.5, bold: true, right: true }); doc.down(15);
      c.dets.forEach((dd) => { doc.need(12); doc.txt(40, `${dd.name} (${dd.pct}%)`, { size: 9, gray: true }); doc.txt(555, "-" + eurPdf(dd.amount), { size: 9, gray: true, right: true }); doc.down(12); });
      doc.down(2); doc.hr(); doc.down(17); doc.need(18);
      doc.txt(40, "NETO ESTIMADO (no es nomina real)", { size: 11, bold: true }); doc.txt(555, eurPdf(c.neto), { size: 13, bold: true, right: true }); doc.down(20);doc.need(24);doc.txt(40,rec.historicalStatus==='confirmed'?'Tarifas del periodo confirmadas. Retenciones aproximadas sobre bruto.':'Tarifas historicas desconocidas: copia de la configuracion de migracion.',{size:8,gray:true});doc.down(15);
    }

    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    async function processDownload(blob, filename) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename }); return;
        }
      } catch(e) {}
      
      try {
        const base64 = await blobToBase64(blob);
        const a = document.createElement("a");
        a.href = base64;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 500);
      } catch(err) {
        alert("No se pudo descargar el archivo.");
      }
    }

    window.doExportMonth = () => {
      const doc = createPdfDoc(); buildMonthReport(doc, state.year, state.month);
      const blob = new Blob([new Uint8Array([...assemblePdf(doc.pages)].map(c=>c.charCodeAt(0)))], { type: "application/pdf" });
      const fname = `Horas_${MESES[state.month]}_${state.year}.pdf`;
      state.pdfReady = { blob, filename: fname };
      processDownload(blob, fname); render();
    };

    window.doExportYear = (yy) => {
      const doc = createPdfDoc(); doc.txt(40, `Resumen anual - ${yy}`, { size: 16, bold: true }); doc.down(30);
      if(state.config.userName) { doc.txt(40, `Trabajador: ${state.config.userName}`, { size: 10, bold: true }); doc.down(16); }
      for(let m=0;m<12;m++) if(state.allData[monthKey(yy,m)]) buildMonthReport(doc, yy, m);
      const blob = new Blob([new Uint8Array([...assemblePdf(doc.pages)].map(c=>c.charCodeAt(0)))], { type: "application/pdf" });
      const fname = `Horas_${yy}_completo.pdf`;
      state.pdfReady = { blob, filename: fname };
      processDownload(blob, fname); render();
    };

    // ============================================================
    // GEMINI: optional, minimal period context, no automatic edits.
    // ============================================================
    let aiService;
    const ai=()=>aiService ||= import('./ai-service.js');
    function aiSession(){return `${sync.session()}:${aiGeneration}:${cloud.user?.uid||''}`;}
    async function callAI(mode,question,text='') {
      const session=aiSession();const mod=await ai();if(session!==aiSession())throw {kind:'cancelled'};return mod.query({mode,question,text,context:mode==='chat'?minimalContext(question):null,app:cloud.ready?firebase.app()._delegate:null,user:cloud.user,currentSession:aiSession,session});
    }
    function minimalContext(q) {
      const mk=monthKey(state.year,state.month),cfg=periodConfig(),rec=state.allData[mk];
      const context={period:mk,limits:rec?.historicalStatus==='confirmed'?'Tarifas confirmadas':'Tarifas antiguas desconocidas, configuracion copiada al migrar'};
      if(/hora|jornada|d[ií]a|registr|semana|calcul|mes|resumen|n[oó]mina|compar/i.test(q)) {
        const calc=monthly();context.calculated=/tarifa|retenci|deducci|bruto|neto|calcul|n[oó]mina|compar|importe|salario/i.test(q)?calc:Object.fromEntries(Object.entries(calc).filter(([k])=>/^h|^dias/.test(k)));context.days=Object.entries(rec?.days||{}).filter(([,e])=>e).map(([day,e])=>({day:+day,type:e.type,hours:e.hours}));
      }
      if(/tarifa|retenci|deducci|bruto|neto|calcul|n[oó]mina|compar|importe|salario/i.test(q))context.rates=C.financial(cfg);
      return context;
    }
    window.sendChat=async(forceText)=>{
      const q=String(forceText||state.chatInput).trim();if(!q||state.chatLoading||state.config.hideMoney)return;
      if(q.length>2000){alert('Consulta demasiado larga (máximo 2.000 caracteres).');return;}
      const session=aiSession();state.chatInput='';state.chatMsgs.push({role:'user',text:q});state.chatLoading=true;render();
      try{const reply=await callAI('chat',q);if(session===aiSession()&&!state.config.hideMoney)state.chatMsgs.push({role:'bot',text:reply});}
      catch(e){if(session===aiSession()){const mod=await ai();state.chatMsgs.push({role:'bot',text:mod.errorMessage(e)});}}
      finally{if(session===aiSession()){state.chatLoading=false;render();}}
    };
    let pdfLoading;
    async function extractTextFromPDF(file) {
      if(file.size>10*1024*1024)throw Error('PDF demasiado grande: máximo 10 MB. No se ha enviado.');
      if(!pdfLoading)pdfLoading=loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').catch(e=>{pdfLoading=null;throw Error('No se pudo cargar el lector PDF. Requiere conexión la primera vez.');});
      await pdfLoading;pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      let pdf;try{pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;}catch{throw Error('PDF ilegible, dañado o protegido. No se ha enviado.');}
      try {
        if(pdf.numPages>40)throw Error('PDF de más de 40 páginas. No se ha enviado; prepara una copia del periodo correspondiente.');
        const pages=[],unread=[];let length=0;
        for(let i=1;i<=pdf.numPages;i++) {
          const page=await pdf.getPage(i),content=await page.getTextContent();
          let lines='',lastY=null;for(const item of content.items){const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>3)lines+='\n';lines+=item.str+' ';if(item.hasEOL)lines+='\n';lastY=y;}
          if(lines.trim().length<30)unread.push(i);length+=lines.length;
          if(length>120000)throw Error('Documento de más de 120.000 caracteres. No se ha recortado ni enviado. Separa periodos o elimina páginas no salariales.');
          pages.push(`Página ${i}:\n${lines}`);
        }
        if(unread.length)throw Error('No hay extracción fiable en las páginas '+unread.join(', ')+'. Puede ser un PDF escaneado o incompleto. No se ha comprobado ni enviado; usa un PDF con texto.');
        return {text:pages.join('\n\n'),pages:pdf.numPages};
      }finally{await pdf.destroy();}
    }
    window.handleNominaUpload=async(e)=>{
      const file=e.target.files[0];e.target.value='';if(!file||state.config.hideMoney||state.nomina.status==='loading')return;
      const session=aiSession();state.nomina={status:'loading',result:null,error:null};render();
      try{const extracted=await extractTextFromPDF(file);if(session!==aiSession())return;state.nomina={status:'review',text:C.redactPayroll(extracted.text),pages:extracted.pages,result:null,error:null};}
      catch(e){if(session===aiSession())state.nomina={status:'error',error:e.message,result:null};}
      if(session===aiSession())render();
    };
    window.cancelPayroll=()=>{aiGeneration++;state.nomina={status:'idle',result:null,error:null};render();};
    window.authorizePayroll=async()=>{
      if(state.config.hideMoney||state.nomina.status!=='review')return;
      const text=getEl('payroll-text').value;if(text.trim().length<30||text.length>120000){alert('Texto insuficiente o demasiado grande.');return;}
      const session=aiSession();state.nomina.status='loading';render();
      try{const facts=await callAI('payroll','Extrae exclusivamente datos explícitos del documento.',text);if(session!==aiSession())return;const result=C.comparePayroll(facts,state.allData,state.config);state.nomina={status:'done',facts,result,error:null};}
      catch(e){if(session===aiSession()){const mod=await ai();state.nomina.status='error';state.nomina.error=mod.errorMessage(e);}}
      if(session===aiSession())render();
    };
    function payrollMarkup() {
      if(state.config.hideMoney)return '<p class="privacy-note">Importes ocultos: el análisis de nóminas y sus resultados están ocultos.</p>';
      if(state.nomina.status==='review')return `<div class="nomina-preview"><p class="privacy-note">Se ha extraído texto localmente de ${state.nomina.pages} páginas. Aún no se ha enviado. Revisa el texto completo y elimina nombres, direcciones e identificadores que queden: la eliminación automática puede ser incompleta.</p><label for="payroll-text">Texto que se enviará a Google para extraer periodo, horas, tarifas y totales:</label><textarea id="payroll-text" oninput="state.nomina.text=this.value">${esc(state.nomina.text)}</textarea><p class="privacy-note">Gemini recibirá únicamente este texto revisado. La comparación se calcula después en este dispositivo. Google indica que en servicios gratuitos puede usar entradas y respuestas para mejorar productos y revisión humana. Sus condiciones contemplan tratamiento distinto en servicios de pago y en el EEE, Suiza y Reino Unido. No se ha verificado el plan ni el régimen aplicable a este proyecto; no se promete confidencialidad. No envíes datos sensibles sin revisar las <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener" style="color:var(--accent)">condiciones de Google</a> y <a href="https://firebase.google.com/docs/ai-logic/data-governance" target="_blank" rel="noopener" style="color:var(--accent)">Firebase AI Logic</a>.</p><button class="big-btn" onclick="authorizePayroll()">Autorizar envío de este texto a Google</button><button class="big-btn" onclick="cancelPayroll()">Cancelar y descartar texto</button></div>`;
      const r=state.nomina.result;
      return `${state.nomina.status==='loading'?'<p role="status">Preparando documento o consultando Gemini…</p>':''}${r?`<div role="status"><strong>${esc(r.label)}</strong><p>Periodo extraído: ${esc(state.nomina.facts.period||'desconocido')}. Revisa los datos extraídos; la IA puede equivocarse.</p>${r.differences.map(d=>`<p>${esc(d.label)}: nómina ${esc(d.actual)} ${esc(d.unit)}; registros ${esc(Math.round(d.expected*10000)/10000)} ${esc(d.unit)}.</p>`).join('')}${r.limits.map(x=>`<p>• ${esc(x)}</p>`).join('')}<p class="privacy-note">Comparación con estimaciones por porcentajes, no verificación legal ni nómina exacta. No se ha guardado ni modificado ningún registro.</p></div>`:''}${state.nomina.error?`<p role="alert" style="color:var(--danger)">${esc(state.nomina.error)}</p>`:''}`;
    }

    // ============================================================
    // AISLAMIENTO DOM (CERO PARPADEOS)
    // ============================================================
    const getEl = (id) => document.getElementById(id);
    let chartInst = null;

    function renderCalendarGrid() {
      const grid = getEl('calendar-grid');
      if(!grid) return;
      const mk = monthKey(state.year, state.month);
      const monthRec = state.allData[mk] || { days: {} };
      const dim = new Date(state.year, state.month + 1, 0).getDate();
      const fwd = (new Date(state.year, state.month, 1).getDay() + 6) % 7;
      
      let gridHtml = Array(fwd).fill('<div></div>').join('');
      for(let d=1; d<=dim; d++) {
        const e = monthRec.days[d]; const t = e ? TYPES[e.type] : null;
        const isT = state.month === new Date().getMonth() && state.year === new Date().getFullYear() && d === new Date().getDate();
        const isSel = state.selectedDay === d;
        
        let borderColor = "transparent";
        if (isSel) borderColor = "#E8EDF7";
        else if (isT) borderColor = "var(--accent)";
        
        gridHtml += `
          <button id="day-btn-${d}" class="day-cell" 
                  style="border-color:${borderColor}; ${t ? `background:${t.bg}` : ''}" 
                  aria-label="${d} de ${MESES[state.month]}, ${t?t.label:'sin registro'}${e&&e.type!=='descanso'?', '+fmtH(e.hours)+' horas':''}" aria-pressed="${isSel}" onclick="selectDay(${d})">
            <span style="color:${t?t.color:'var(--muted)'}">${d}</span>
            ${e && e.type !== 'descanso' ? `<span style="color:${hoursColor(Number(e.hours))}">${fmtH(e.hours)}h</span><span class="day-symbol" style="color:${t.color}">${e.type==='festivo'?'F':'N'}</span>` : e && e.type==='descanso' ? `<span style="color:var(--muted)">D · zZ</span>` : ''}
          </button>`;
      }
      grid.innerHTML = DIAS_SEMANA.map(d=>`<div style="text-align:center;color:var(--muted);font-size:11px;font-weight:600">${d}</div>`).join('') + gridHtml;
    }

    function renderEditor() {
      const container = getEl('editor-container');
      if(!container) return;
      
      if (!state.selectedDay) { container.innerHTML = ''; return; }
      
      const mk = monthKey(state.year, state.month);
      const monthRec = state.allData[mk] || { days: {} };
      const s = state.draft || { type: "normal", hours: 8 };
      const info=C.daily(state.allData,state.config,state.year,state.month,state.selectedDay,s),imp=info.bruto;

      // Banner con las horas de la semana del día seleccionado (en curso o cerrada)
      const w = calcWeekInfo(new Date(state.year, state.month, state.selectedDay));
      const wLabel = w.isCurrent ? '⏳ Semana en curso' : w.isClosed ? '✓ Semana cerrada' : 'Semana próxima';
      const wColor = w.isCurrent ? 'var(--accent)' : w.isClosed ? 'var(--success)' : 'var(--muted)';
      const weekBanner = `
        <div class="week-banner" style="border-color:${w.isCurrent ? 'rgba(79,163,255,0.45)' : 'var(--border)'}">
          <div>
            <div style="color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600">📅 Semana ${fmtDia(w.monday)} – ${fmtDia(w.sunday)}</div>
            <div style="color:${wColor}; font-size:11.5px; font-weight:600; margin-top:3px">${wLabel}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'Space Grotesk', system-ui; font-weight:700; font-size:24px; color:var(--text); font-variant-numeric:tabular-nums">${fmtH(w.total)} h</div>
            <div style="color:var(--muted); font-size:11px">${fmtH(w.hNormal)} norm. · ${fmtH(w.hFestivo)} fest. · ${w.dias} días</div>
          </div>
        </div>`;
      
      container.innerHTML = weekBanner + `
        <div class="editor">
          <div style="font-weight:700; font-size:16px; margin-bottom:12px">${state.selectedDay} de ${MESES[state.month].toLowerCase()}</div>
          <div style="display:flex; gap:8px; margin-bottom:12px">
            ${Object.entries(TYPES).map(([k, t]) => `<button class="type-btn" style="${s.type === k ? `background:${t.bg}; border-color:${t.color}; color:${t.color}` : ''}" aria-pressed="${s.type===k}" onclick="updateDraftType('${k}')">${t.label}</button>`).join('')}
          </div>
          ${s.type !== 'descanso' ? `
          <div style="display:flex; align-items:center; gap:10px; justify-content:center">
            <button class="step-btn" aria-label="Restar media hora" onclick="stepHours(-0.5)">−</button>
            <input type="number" id="draft-hours" min="0" max="24" step="0.01" inputmode="decimal" aria-label="Horas de la jornada" class="hours-input" value="${s.hours}" style="color:${hoursColor(Number(s.hours))}" oninput="stepHours(0, this.value)">
            <span style="color:var(--muted); font-size:14px">h</span>
            <button class="step-btn" aria-label="Sumar media hora" onclick="stepHours(0.5)">+</button>
          </div>` : ''}
          
          <button id="btn-add-day" class="add-btn" style="display:${!state.dayConfirmed ? 'block' : 'none'}; margin-top:14px" onclick="saveDay()">✓ Añadir</button>
          
          <div id="day-earn-box" class="day-earn-box" style="display:${state.dayConfirmed ? 'block' : 'none'}; margin-top:14px">
            ${s.type !== 'descanso' ? `
              <div style="color:var(--muted); font-size:11px; text-transform:uppercase; font-weight:600; letter-spacing:1px">💶 Bruto estimado de este día</div>
              <div style="font-family:'Space Grotesk', system-ui; font-weight:700; font-size:36px; color:var(--success); margin:4px 0">${fmt(imp)}</div>
              <div style="color:var(--muted); font-size:12px">${fmtH(s.hours-info.extra)} h × ${state.config.hideMoney?'•••• €/h':info.rate.toFixed(4)+' €/h'}${info.extra?`<br>${fmtH(info.extra)} h extra pendientes del mes siguiente`:''}</div>
            ` : `
              <div style="font-size:26px; margin-bottom:2px">😌</div>
              <div style="color:var(--muted); font-size:13px">Día de descanso, bien merecido</div>
            `}
          </div>
          ${monthRec.days[state.selectedDay] ? `<button class="big-btn" style="margin-top:10px; border-color:var(--danger); color:var(--danger)" onclick="clearDay()">Borrar este día</button>` : ''}
        </div>`;
    }

    // ============================================================
    // MOTOR PRINCIPAL DE RENDERIZADO
    // ============================================================
    window.switchTab = (t) => {
      vibrate(20);
      if (state.tab === 'anual' && t !== 'anual' && chartInst) { chartInst.destroy(); chartInst = null; }
      state.tab = t; render();
    };
    
    let lastRenderedTab=null;
    function render() {
      const active=document.activeElement,focusId=active?.id,selection=active?.selectionStart;
      const app=getEl('app');
      const renderTabs = `
        <nav class="tabs-bar">
          ${[["mes", "Mes"], ["anual", "Año"], ["ia", "💬 IA"], ["ajustes", "Ajustes"]].map(([k, l]) => `
            <button class="tab-btn ${state.tab === k ? 'active' : ''}" onclick="switchTab('${k}')">${l}</button>
          `).join('')}
          <button class="eye-btn ${state.config.hideMoney ? 'active' : ''}" aria-label="${state.config.hideMoney?'Mostrar importes':'Ocultar importes'}" aria-pressed="${state.config.hideMoney}" onclick="toggleMoney()">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.1"/>${state.config.hideMoney ? '<line x1="4.2" y1="20" x2="19.8" y2="4"/>' : ''}</svg>
          </button>
        </nav>`;

      let content = "";
      
      if (state.tab === "mes") {
        const mk = monthKey(state.year, state.month);
        const monthRec = state.allData[mk] || { days: {} };
        const dim = new Date(state.year, state.month + 1, 0).getDate();
        const cfg=periodConfig(),ei=extraActive(cfg)?calcExtraInfo(state.allData,state.year,state.month):null;
        const c=monthly();
        const proj=calcProjection(monthRec.days,c,cfg,state.year,state.month,dim);

        content = `
          <div class="tab-content"><div class="two-col">
            <div class="col-scroll">
              <div class="row" style="margin-bottom:14px">
                <button class="big-btn" style="width:42px" onclick="navMonth(-1)">‹</button>
                <div style="text-align:center"><div style="font-size:22px; font-weight:700; font-family:'Space Grotesk', system-ui">${MESES[state.month]}</div><div style="font-size:12px; color:var(--muted)">${state.year}</div></div>
                <button class="big-btn" style="width:42px" onclick="navMonth(1)">›</button>
              </div>
              <div class="neto-block">
                <div style="color:var(--muted); font-size:12px; font-weight:600; letter-spacing:1px">Neto estimado · registros del mes</div>
                <div class="neto-value">${fmt(c.neto)}</div>
                <div class="money-detail">Bruto ${fmt(c.bruto)} · Retenciones −${fmt(c.totalDed)}</div>
                <div class="hours-total">🕐 ${fmtH(c.hNormal + c.hFestivo)} h este mes · ${fmtH(c.hNormal)} normales · ${fmtH(c.hFestivo)} festivas</div>
              </div>
              
              <p class="privacy-note">Toca un día para registrar tus horas</p><p class="privacy-note">N · Normal　F · Festivo　D · Descanso</p><div id="calendar-grid" class="grid"></div>
              <div id="editor-container"></div>
            </div>
            
            <div class="col-scroll">
              ${proj ? `
                <div class="card" style="border-color: rgba(123,232,168,0.25);">
                  <div class="card-title">Proyección a fin de mes</div>
                  <div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:10px">
                    <span style="font-family:'Space Grotesk', system-ui; font-weight:700; font-size:26px; color:#7BE8A8;">≈ ${fmt(proj.projNeto)}</span>
                    <span style="color:var(--muted); font-size:12px">neto · bruto ≈ ${fmt(proj.projBruto)}</span>
                  </div>
                  <div style="color:var(--muted); font-size:12px; margin-top:6px; line-height:1.5;">A tu ritmo (${proj.avgH.toFixed(1)} h/día trab.): en los ${proj.remaining} días sin registrar que quedan, esta es una proyección orientativa; no es una nómina ni incluye el calendario futuro de festivos/extras.</div>
                </div>
              ` : ''}

              <div class="card">
                <div class="card-title">Cálculo según registros del mes</div><p class="privacy-note">Tarifas de este periodo ${monthRec.historicalStatus==='confirmed'?'confirmadas':'sin confirmar: registros antiguos con configuración copiada al migrar'}. Retenciones aproximadas sobre el bruto; una nómina real puede tener otros conceptos y bases.</p>${ei?`<p class="privacy-note">Hipótesis Sintax: semana lunes–domingo; normales + festivas superan 40 h; extras desde el último día normal; festivos mantienen su tarifa. ${fmtH(c.hExtraGen)} h extra generadas pendientes del mes siguiente. ${fmtH(c.hExtra)} h del mes anterior estimadas en este mes; no se confirma su abono real.</p>`:''}
                <div class="row"><span>H. normales (${c.hNormalPaid}h)</span> <span>${fmt(c.brutoNormal)}</span></div>
                <div class="row"><span>H. festivas (${c.hFestivo}h)</span> <span>${fmt(c.brutoFestivo)}</span></div>
                ${ei && c.hExtra > 0 ? `<div class="row"><span>H. extra (${c.hExtra}h)</span> <span style="color:var(--success)">${fmt(c.brutoExtra)}</span></div>` : ''}
                <div style="height:1px; background:var(--border-light); margin:8px 0"></div>
                <div class="row" style="font-weight:600"><span>Total bruto</span> <span>${fmt(c.bruto)}</span></div>
                ${c.dets.map(d => `<div class="row" style="color:var(--muted); font-size:13px"><span>${esc(d.name)}</span> <span>-${fmt(d.amount)}</span></div>`).join('')}
                <div style="height:1px; background:var(--border-light); margin:8px 0"></div>
                <div class="row" style="font-weight:700; color:var(--success); font-size:15px"><span>Neto estimado</span> <span>${fmt(c.neto)}</span></div>
              </div>

              <div class="card">
                <div class="card-title">Comprobar Nómina (IA)</div>
                <p class="privacy-note">Primero se prepara el texto en este dispositivo. Google solo lo recibe tras tu autorización.</p>
                <button class="big-btn" ${state.config.hideMoney||state.nomina.status==='loading'?'disabled':''} style="border-color:var(--success); color:var(--success)" onclick="getEl('nomina-upload').click()">📑 Preparar nómina (PDF)</button>
                ${payrollMarkup()}
              </div>

              <button class="big-btn" style="border-color:var(--accent); color:var(--accent); margin-bottom:10px" onclick="openExportModal()">📄 Exportar PDF</button>
            </div>
          </div></div>`;
      }
      
      else if (state.tab === "anual") {
        const rows = getAnnualData();
        const totalNeto = rows.reduce((s,r)=>s+r.neto, 0);
        const totalBruto = rows.reduce((s,r)=>s+r.bruto, 0);
        const totalHoras = rows.reduce((s,r)=>s+r.horas, 0);
        const totalDescansos = rows.reduce((s,r)=>s+r.diasDesc, 0);
        
        content = `
          <div class="tab-content"><div class="two-col">
            <div class="col-scroll">
              <div class="row" style="margin-bottom:14px; justify-content:center; gap:20px">
                <button class="big-btn" style="width:42px" onclick="vibrate(20); state.year--; render()">‹</button>
                <div style="font-size:22px; font-weight:700; font-family:'Space Grotesk', system-ui">${state.year}</div>
                <button class="big-btn" style="width:42px" onclick="vibrate(20); state.year++; render()">›</button>
              </div>
              <div class="neto-block">
                <div style="color:var(--muted); font-size:12px; font-weight:600; letter-spacing:1px">Neto acumulado ${state.year}</div>
                <div class="neto-value">${fmt(totalNeto)}</div>
                <div style="color:var(--success); font-size:13px; font-weight:600; margin-bottom:8px">Bruto total ≈ ${fmt(totalBruto)}</div>
                <div style="color:var(--muted); font-size:12px">${totalHoras} horas trabajadas · ${totalDescansos} días de descanso</div>
              </div>

              <div class="card">
                <div class="card-title">${state.config.hideMoney?'Horas por mes · importes ocultos':'Neto estimado por mes'}</div>
                <div style="position: relative; height: 220px; width: 100%;">
                  <div id="chart-anual" style="height:100%"></div>
                </div>
              </div>
            </div>
            <div class="col-scroll">
              <div class="card"><div class="card-title">Meses de ${state.year}</div>
                ${rows.map(r => `
                  <div class="row" style="border-bottom:1px solid var(--border-light); padding:10px 0; opacity:1">
                    <span>${MESES[r.m]}</span><span style="font-weight:600; font-variant-numeric:tabular-nums; color:${r.hasData?'var(--success)':'var(--muted)'}">${fmt(r.neto)}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div></div>`;
        setTimeout(renderChart, 100);
      }

      else if (state.tab === "ia") {
        content = `
          <div class="tab-content"><div class="ia-wrap">
            <div class="card" style="display:flex; flex-direction:column; flex:1; max-height: 70vh; min-height: 50vh;">
              <div class="card-title">Asistente Mis Horas · Gemini</div>
              
              <div id="chat-scroll-box" style="flex:1; overflow-y:auto; margin-bottom:12px; display:flex; flex-direction:column; gap:8px; padding-right:5px; min-height:0;">
                ${state.config.hideMoney?'<p class="privacy-note">Importes ocultos: conversaciones y resultados de IA ocultos.</p>':''}${!state.config.hideMoney && state.chatMsgs.length === 0 ? `<p style="color:var(--muted); font-size:13px">Consulta sobre el periodo seleccionado. Se envía a Google tu pregunta y únicamente los registros/cálculos o tarifas necesarios de ese periodo. Requiere conexión y sesión Google; no modifica tus datos.</p>` : ''}
                ${(state.config.hideMoney?[]:state.chatMsgs).map(m => `<div class="bubble ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.text)}</div>`).join('')}
                ${state.chatLoading && !state.config.hideMoney ? `<div class="bubble bot">Escribiendo...</div>` : ''}
              </div>
              
              <p class="privacy-note">Periodo: ${MESES[state.month]} ${state.year}. Cambia el mes en la pestaña Mes para consultar otro periodo. Las preguntas no envían conversaciones anteriores ni tu nombre. Evita escribir identificadores personales.</p><div style="display:flex; gap:8px">
                <input class="config-input" style="flex:1; text-align:left" id="chat-input" aria-label="Consulta a Gemini" ${state.config.hideMoney||state.chatLoading?'disabled':''} placeholder="Pregunta algo..." value="${esc(state.config.hideMoney?'':state.chatInput)}" oninput="state.chatInput=this.value" onkeydown="if(event.key==='Enter') sendChat()">
                <button class="big-btn" style="flex:0 0 auto; width:auto; border-color:var(--accent); color:var(--accent)" ${state.config.hideMoney||state.chatLoading?'disabled':''} onclick="sendChat()">Enviar</button>
              </div>
            </div>
          </div></div>`;
      }

      else if (state.tab === "ajustes") {
        content = `
          <div class="tab-content"><div class="ajustes-grid">
            <div class="col-scroll">
              <div class="card" style="border-color: ${cloud.user ? 'rgba(123,232,168,0.35)' : 'var(--border)'}">
                <div class="card-title">☁️ Cuenta y Nube</div>
                ${cloud.user ? `
                  <div class="row">
                    <span style="color:var(--text); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65%">${esc(cloud.user.email)}</span>
                    <span id="cloud-status" style="color:${cloud.status === 'error' ? 'var(--danger)' : 'var(--success)'}; font-size:12px; font-weight:600">${esc(cloud.errorMsg||'Guardado local')}</span>
                  </div>
                  ${cloud.status === 'error' && cloud.errorMsg ? `<div style="color:var(--danger); font-size:11px; margin:6px 0; word-break:break-word; background:rgba(255,139,139,0.08); padding:8px; border-radius:8px">${esc(cloud.errorMsg)}</div>` : ''}
                  <p style="color:var(--muted); font-size:11px; margin:6px 0 10px">Tus horas se guardan en la nube y se comparten entre tus dispositivos.</p>
                  <button class="big-btn" style="border-color:var(--accent); color:var(--accent); margin-bottom:8px" onclick="forceCloudPull()">⬇️ Forzar descarga de la nube</button>
                  <button class="big-btn" style="border-color:var(--danger); color:var(--danger)" onclick="logoutGoogle()">Cerrar sesión</button><button class="big-btn" onclick="retrySync()">Reintentar sincronización</button><button class="big-btn" onclick="copyGuest()">Copiar datos sin cuenta a esta cuenta</button>
                ` : `
                  <p style="color:var(--muted); font-size:12px; margin:0 0 10px">Inicia sesión para sincronizar tus datos entre el móvil y la tablet conservando una copia local por cuenta.</p>
                  <button class="big-btn" style="border-color:var(--accent); color:var(--accent)" onclick="loginGoogle()">🔐 Iniciar sesión con Google</button>
                `}
              </div>

              <div class="card">
                <div class="card-title">Tu Perfil</div>
                <div class="row">
                  <span style="color:var(--muted); font-size:13px">Nombre completo</span> 
                  <input type="text" class="config-input" style="width:140px; text-align:left;" placeholder="Ej. Fran" value="${esc(state.config.userName)}" aria-label="Nombre para el PDF" onchange="updateConfig('userName', this.value)">
                </div>
                <p style="color:var(--muted); font-size:11px; margin-top:6px;">Saldrá impreso en los PDFs generados.</p>
              </div>

              <div class="card">
                <div class="card-title">Tarifas actuales · nuevos periodos</div><p class="privacy-note">Cambiar estos ajustes no altera los periodos ya registrados. Para corregir uno, selecciona el mes y confirma explícitamente su configuración abajo.</p>
                <div class="row"><span>Hora normal (€)</span> <input type="number" step="0.01" class="config-input" value="${state.config.rateNormal}" onchange="updateConfig('rateNormal', this.value)"></div>
                <div class="row"><span>Plus festivo (€)</span> <input type="number" step="0.01" class="config-input" value="${state.config.plusFestivo}" onchange="updateConfig('plusFestivo', this.value)"></div>
                ${state.config.profile==='sintax' && state.config.sintaxUnlocked ? `<div class="row"><span>Hora Extra (€)</span> <input type="number" step="0.01" class="config-input" value="${state.config.rateExtra}" onchange="updateConfig('rateExtra', this.value)"></div>` : ''}
              </div>
              
              <div class="card">
                <div class="card-title">Retenciones</div>
                ${state.config.deductions.map((d,i) => `
                  <div style="display:flex; gap:8px; margin-bottom:8px">
                    <input class="config-input" style="flex:1; text-align:left" aria-label="Nombre de retención ${i+1}" value="${esc(d.name)}" onchange="updateDed(${i},'name',this.value)">
                    <input type="number" step="0.1" class="config-input" style="width:70px" aria-label="Porcentaje de retención ${i+1}" min="0" max="100" value="${d.pct}" onchange="updateDed(${i},'pct',this.value)">
                    <button aria-label="Eliminar retención ${i+1}" style="color:var(--danger);min-width:44px" onclick="delDed(${i})">✕</button>
                  </div>`).join('')}
                <button class="big-btn" onclick="vibrate(20); addDed()" style="margin-top:4px">+ Añadir</button>
              </div>
            </div>
            <div class="col-scroll">
              <div class="card">
                <div class="card-title">Perfil de Empresa</div>
                <select class="config-input" style="width:100%; text-align:left" onchange="updateConfig('profile', this.value)">
                  <option value="ett" ${state.config.profile==='ett'?'selected':''}>ETT (Estándar)</option>
                  <option value="sintax" ${state.config.profile==='sintax'?'selected':''}>Sintax (Extras vencidas)</option>
                </select>
                ${state.config.profile==='sintax' && !state.config.sintaxUnlocked ? `<div style="margin-top:10px; display:flex; gap:8px"><input type="password" id="pw-sintax" class="config-input" style="flex:1; text-align:left" placeholder="Contraseña"><button class="big-btn" style="flex:0; width:auto" onclick="unlockSintax()">Desbloquear</button></div>` : ''}
              </div>
              
              <div class="card">
                <div class="card-title">Copias de Seguridad</div><p class="privacy-note">PDF y copias contienen datos económicos aunque los importes estén ocultos en pantalla. La copia original v2 se conserva en este dispositivo.</p>
                <div style="display:flex; gap:8px">
                  <button class="big-btn" style="border-color:var(--success); color:var(--success)" onclick="vibrate(20); exportBackup()">⬇ Exportar</button>
                  <button class="big-btn" style="border-color:var(--accent); color:var(--accent)" onclick="vibrate(20); getEl('backup-upload').click()">⬆ Importar</button>
                </div>
                <button class="big-btn" onclick="exportRecovery()">Exportar recuperación</button>
                <button class="big-btn" onclick="restoreRecovery()">Restaurar copia previa</button>
              </div>
              <div class="card"><div class="card-title">Configuración de ${MESES[state.month]} ${state.year}</div><p class="privacy-note">${state.allData[monthKey(state.year,state.month)]?.historicalStatus==='confirmed'?'Configuración del periodo confirmada.':'Tarifas históricas desconocidas. La migración conservó las tarifas disponibles, sin inventar las anteriores.'} Revisa tarifas y retenciones actuales antes de aplicarlas a este periodo. Esta acción cambia sus cálculos de forma explícita.</p><button class="big-btn" onclick="confirmPeriodRates()">Aplicar tarifas y retenciones actuales a este periodo</button><button class="big-btn" onclick="toggleClosed()">${state.allData[monthKey(state.year,state.month)]?.closed?'Marcar registros como incompletos':'Confirmar que los registros del periodo están completos'}</button></div>
            </div>
          </div></div>`;
      }

      app.innerHTML = renderTabs + content + `
        <div class="watermark">
          &copy; ${new Date().getFullYear()} Propiedad de FranOlea. Todos los derechos reservados.
        </div>
      `;
      const pane=app.querySelector('.tab-content');if(pane && state.tab!==lastRenderedTab)pane.classList.add('tab-enter');lastRenderedTab=state.tab;
      app.querySelectorAll('input,select').forEach((el,i)=>{if(!el.id)el.id='field-'+i;if(!el.hasAttribute('aria-label'))el.setAttribute('aria-label',el.closest('.row')?.querySelector('span')?.textContent||el.placeholder||'Ajuste');});
      app.querySelectorAll('.tab-btn').forEach(el=>el.setAttribute('aria-current',el.classList.contains('active')?'page':'false'));
      renderModalExport();
      
      if (state.tab === "mes") {
        renderCalendarGrid();
        renderEditor();
      }
      
      if(focusId){const replacement=getEl(focusId);if(replacement && !replacement.disabled){replacement.focus({preventScroll:true});try{replacement.setSelectionRange(selection,selection);}catch{}}}
      if (state.tab === "ia") {
        const scrollBox = getEl("chat-scroll-box");
        if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
      }
    }

    // ============================================================
    // EVENTOS Y NAVEGACIÓN MODULAR
    // ============================================================
    window.navMonth = (dir) => { 
      vibrate(20);
      state.month += dir; state.selectedDay = null;
      if (state.month < 0) { state.month = 11; state.year--; }
      if (state.month > 11) { state.month = 0; state.year++; }
      render(); 
    };
    
    window.selectDay = (d) => {
      vibrate(20);
      state.selectedDay = state.selectedDay === d ? null : d;
      const mk = monthKey(state.year, state.month);
      const ex = (state.allData[mk]?.days || {})[state.selectedDay];
      state.draft = ex ? { ...ex } : { type: "normal", hours: 8 };
      state.dayConfirmed = !!ex;
      
      renderCalendarGrid();
      renderEditor();
    };

    window.updateDraftType = (type) => {
      vibrate(20);
      state.draft.type = type;
      if (type === 'descanso') state.draft.hours = 0;
      state.dayConfirmed = false;
      renderEditor();
    };

    window.stepHours = (diff, val) => {
      vibrate(20);
      let current = Number(state.draft.hours) || 0;
      let h=val!==undefined?(String(val).trim()===''?NaN:Number(String(val).replace(',','.'))):current+diff;
      h = Math.max(0, Math.min(24, h));
      
      state.draft.hours = h;
      if(!Number.isFinite(h))getEl('draft-hours')?.setAttribute('aria-invalid','true');else getEl('draft-hours')?.removeAttribute('aria-invalid');
      state.dayConfirmed = false;

      const inp = getEl('draft-hours');
      if (inp) {
        if (val === undefined) inp.value = h;
        inp.style.color = hoursColor(h);
      }

      const addBtn = getEl('btn-add-day');
      if (addBtn) addBtn.style.display = 'block';

      const earnBox = getEl('day-earn-box');
      if (earnBox) earnBox.style.display = 'none';
    };

    window.saveDay = () => {
      vibrate(100);
      const mk = monthKey(state.year, state.month);
      if(!state.selectedDay||!state.draft||!Number.isFinite(state.draft.hours)||state.draft.hours<0||state.draft.hours>24){alert('Horas no válidas.');return;}
      ensurePeriod();
      state.allData[mk].days[state.selectedDay] = { type: state.draft.type, hours: state.draft.type === "descanso" ? 0 : Number(state.draft.hours) };
      state.dayConfirmed = true; 
      saveState(); 
      render(); 
    };
    
    window.clearDay = () => {
      vibrate(20);
      const mk = monthKey(state.year, state.month);
      if(state.allData[mk] && state.allData[mk].days) state.allData[mk].days[state.selectedDay]=null;
      state.selectedDay = null; saveState(); render();
    }

    function setConfig(next) {
      try{const validated=C.config(next,DEFAULT_CONFIG);state.config=validated;saveState();render();}catch(e){alert(e.message);render();}
    }
    window.updateConfig=(k,v)=>{
      if(!['rateNormal','plusFestivo','rateExtra','profile','userName'].includes(k))return;
      const next=C.copy(state.config);next[k]=['profile','userName'].includes(k)?v:(String(v).trim()===''?NaN:Number(v));
      if(k==='profile'&&v!=='sintax')next.sintaxUnlocked=false;setConfig(next);
    };
    window.updateDed=(i,k,v)=>{const next=C.copy(state.config);if(!next.deductions[i]||!['pct','name'].includes(k))return;next.deductions[i][k]=k==='pct'?(String(v).trim()===''?NaN:Number(v)):v;setConfig(next);};
    window.delDed=i=>{const next=C.copy(state.config);next.deductions.splice(i,1);setConfig(next);};
    window.addDed=()=>{const next=C.copy(state.config);next.deductions.push({id:crypto.randomUUID(),name:'Nueva',pct:0});setConfig(next);};
    window.unlockSintax=()=>{if(getEl('pw-sintax').value==='Sintax_Granada')setConfig({...state.config,sintaxUnlocked:true});else alert('Contraseña incorrecta.');};
    window.confirmPeriodRates=()=>{
      if(!confirm('Se cambiarán los cálculos de '+MESES[state.month]+' '+state.year+' con las tarifas, perfil y retenciones actuales. Se guardará una copia recuperable.'))return;
      try{sync.recover('Antes de corregir tarifas del periodo');const rec=ensurePeriod();rec.rateConfig=C.financial(state.config);rec.historicalStatus='confirmed';saveState();render();}catch(e){alert(e.message);}
    };
    window.toggleClosed=()=>{ensurePeriod().closed=!ensurePeriod().closed;saveState();render();};
    window.exportBackup=()=>processDownload(new Blob([JSON.stringify({...payload(),config:{...state.config}})],{type:'application/json'}),`Backup_Horas_${new Date().toISOString().slice(0,10)}.json`);
    function replaceFromBackup(p,reason='Importar copia') {
      p=C.validateBackup(p,DEFAULT_CONFIG);
      if(!confirm(`${reason}: se reemplazarán los registros y ajustes de esta copia local (${Object.keys(state.allData).length} meses) por ${Object.keys(p.data).length} meses. Los borrados se sincronizarán en esta cuenta. Se conservará una recuperación previa. La preferencia de ocultar importes no cambia.`))return;
      sync.recover('Antes de importar');
      for(const [mk,old] of Object.entries(state.allData)) {
        if(!p.data[mk])p.data[mk]={...C.copy(old),days:{}};
        for(const d of Object.keys(old.days))if(!(d in p.data[mk].days))p.data[mk].days[d]=null;
      }
      const hidden=state.config.hideMoney;state.config={...p.config,hideMoney:hidden};state.allData=p.data;state.selectedDay=null;state.chatMsgs=[];state.nomina={status:'idle',result:null,error:null};aiGeneration++;saveState();render();
    }
    window.importBackup=async(e)=>{
      const file=e.target.files[0];e.target.value='';if(!file)return;
      try{if(file.size>5*1024*1024)throw Error('Copia demasiado grande (máximo 5 MB).');const p=C.validateBackup(JSON.parse(await file.text()),DEFAULT_CONFIG);replaceFromBackup(p);}
      catch(e){alert('Copia rechazada. Los datos existentes no se han alterado. '+e.message);}
    };
    window.restoreRecovery=()=>{
      try{const raw=sync.recovery();if(!raw){alert('No hay recuperación para esta cuenta.');return;}const list=JSON.parse(raw);replaceFromBackup(list.at(-1).payload,'Restaurar la última copia previa ('+list.at(-1).at+')');}catch(e){alert(e.message);}
    };
    window.renderChart=()=>{
      const el=getEl('chart-anual');if(!el)return;
      const rows=getAnnualData(),hidden=state.config.hideMoney,values=rows.map(r=>hidden?r.horas:r.neto),max=Math.max(1,...values),unit=hidden?'h':'€';
      const svg='<svg viewBox="0 0 520 210" width="100%" height="100%" role="img" aria-label="'+(hidden?'Horas registradas por mes':'Neto estimado por mes')+'">'+[0,.5,1].map(t=>`<text x="0" y="${180-t*150}" fill="#AFB8CC" font-size="12">${Math.round(max*t)} ${unit}</text><path d="M65 ${176-t*150} H515" stroke="#2A3247"/>`).join('')+rows.map((r,i)=>`<rect x="${70+i*37}" y="${176-values[i]/max*150}" width="25" height="${values[i]/max*150}" fill="#4FA3FF" rx="3"><title>${r.name}: ${hidden?fmtH(r.horas)+' h':eur(r.neto)}</title></rect><text x="${70+i*37}" y="199" fill="#AFB8CC" font-size="11">${r.name}</text>`).join('')+'</svg>';
      el.innerHTML=svg;
    };

    window.openExportModal = () => { vibrate(20); state.pdfReady = null; getEl('modal-export').style.display = 'flex'; renderModalExport(); };
    window.closeExport = () => { vibrate(20); getEl('modal-export').style.display = 'none'; };
    window.renderModalExport = () => {
      const m = getEl('modal-export-content'); if(!m) return;
      if (!state.pdfReady) {
        m.innerHTML = `
          <div style="font-family:'Space Grotesk', system-ui; font-weight:700; font-size:17px; margin-bottom:14px">Exportar PDF</div><p class="privacy-note">El PDF contiene datos económicos aunque estén ocultos en pantalla. Es un resumen estimado de registros, no una nómina real.</p>
          <button class="big-btn" style="border-color:var(--accent); color:var(--accent); margin-bottom:16px" onclick="doExportMonth()">📄 Este mes · ${MESES[state.month]} ${state.year}</button>
          <div style="color:var(--muted); font-size:11px; font-weight:600; margin-bottom:8px">O AÑO COMPLETO</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            ${[state.year, state.year-1].map(y => `<button class="big-btn" style="flex:1 0 45%; padding:10px 0" onclick="doExportYear(${y})">🗓 ${y}</button>`).join('')}
          </div>
          <button style="width:100%; text-align:center; color:var(--muted); margin-top:16px; font-size:13px" onclick="closeExport()">Cancelar</button>
        `;
      } else {
        m.innerHTML = `
          <div style="font-family:'Space Grotesk', system-ui; font-weight:700; font-size:17px; margin-bottom:14px; color:var(--success)">✓ PDF Generado</div>
          <p style="color:var(--text); font-size:13px; word-break:break-all; margin-bottom:16px">${esc(state.pdfReady.filename)}</p>
          <button class="big-btn" style="border-color:var(--success); color:var(--success); margin-bottom:8px" onclick="processDownload(state.pdfReady.blob, state.pdfReady.filename)">⬇ Descargar / Compartir</button>
          <button style="width:100%; text-align:center; color:var(--muted); margin-top:8px; font-size:13px" onclick="closeExport()">Cerrar</button>
        `;
      }
    };

    try{sync.load();}catch{}render();sync.setOnline(navigator.onLine!==false);void initCloud();
    // No automatic reload while editing: the worker waits for an explicit update.
    if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
      const offer=()=>{if(reg.waiting){const button=document.createElement('button');button.className='big-btn';button.textContent='Nueva versión disponible · actualizar';button.onclick=()=>{if(state.selectedDay&&!state.dayConfirmed&&!confirm('Hay una jornada sin guardar. ¿Descartar el borrador y actualizar?'))return;reg.waiting.postMessage({type:'ACTIVATE'});};document.body.append(button);}};
      offer();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',offer));
      let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloaded){reloaded=true;location.reload();}});
    }).catch(()=>{});
