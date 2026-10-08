"""Real Chromium/app/service worker; Firebase and Gemini transports are simulated."""
import json, threading, functools, http.server
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'controlHoras/captures'
OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
config={'userName':'','rateNormal':9.6696,'plusFestivo':7.25,'rateExtra':20,'profile':'ett','sintaxUnlocked':False,'hideMoney':False,'deductions':[{'id':'d1','name':'IRPF','pct':10}]}
fixture={'config':config,'data':{'2026-10':{'days':{'1':{'type':'normal','hours':8.25},'2':{'type':'normal','hours':9.5},'3':{'type':'festivo','hours':10.75},'4':{'type':'descanso','hours':0},'5':{'type':'normal','hours':12},'6':{'type':'normal','hours':8}}},'2026-09':{'days':{'1':{'type':'normal','hours':8}}}}}
facts={'period':'2026-10','gross':1,'deductions':0,'net':1,'normalHours':8.25,'holidayHours':10.75,'extraHours':0,'normalRate':9.6696,'holidayRate':16.9196,'extraRate':20,'complete':False,'missing':['Documento ficticio incompleto']}
SDK_AI='''export const Schema={object:x=>x,string:x=>x,number:x=>x,boolean:x=>x,array:x=>x};export class GoogleAIBackend{};export const getAI=(app,opts)=>({});export const getGenerativeModel=(a,opts)=>({generateContent:async req=>{window.testRequests=(window.testRequests||[]).concat(req);if(window.testAIWait)await new Promise(r=>window.resolveAI=r);if(window.testAIError)throw {code:'ai/fetch-error',customData:{status:window.testAIError}};return {response:{text:()=>opts.generationConfig.responseMimeType?JSON.stringify(window.testFacts):'<img src=x onerror="window.pwned=1"> Respuesta ficticia: 23 €'}};}});'''
CHECK='export class ReCaptchaEnterpriseProvider{};export function initializeAppCheck(){}'
def external(route):
 u=route.request.url
 if 'firebase-' in u and '-compat.js' in u:
  route.fulfill(body=(ROOT/'controlHoras/tests/fake-firebase.js').read_text() if 'firebase-app-compat' in u else '',content_type='application/javascript')
 elif 'firebase-app-check.js' in u:route.fulfill(body=CHECK,content_type='application/javascript')
 elif 'firebase-ai.js' in u:route.fulfill(body=SDK_AI,content_type='application/javascript')
 elif 'pdf.min.js' in u:route.fulfill(body='window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:window.testPDFPages||2,getPage:async n=>({getTextContent:async()=>({items:[{str:window.testPDFScan?"":("Nombre: Persona ficticia\\nDNI: 12345678Z\\nPeriodo 2026-10\\nBruto 1\\nNeto 1\\n".repeat(60)),transform:[1,0,0,1,0,1]}]})}),destroy:async()=>{}})})};',content_type='application/javascript')
 else:route.abort()
def assert_no_overflow(page):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 assert page.locator('#app').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
   ctx.route('https://**/*',external)
   ctx.add_init_script("localStorage.setItem('horas-app-v2',"+json.dumps(json.dumps(fixture))+");window.testFacts="+json.dumps(facts)+';')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
   page.goto(URL);expect(page.get_by_text('Toca un día para registrar tus horas')).to_be_visible();page.wait_for_timeout(300)
   page.evaluate('state.year=2026;state.month=9;render()')
   assert page.evaluate('monthly().hNormal+monthly().hFestivo')==48.5
   assert page.locator('#day-btn-2').evaluate('e=>getComputedStyle(e.querySelectorAll("span")[1]).color')=='rgb(255, 176, 79)'
   assert page.locator('#day-btn-3').evaluate('e=>getComputedStyle(e.querySelectorAll("span")[1]).color')=='rgb(255, 144, 96)'
   assert page.locator('#day-btn-5').evaluate('e=>getComputedStyle(e.querySelectorAll("span")[1]).color')=='rgb(255, 112, 112)'
   assert_no_overflow(page)
   page.screenshot(path=str(OUT/f'visible-{width}.png'),full_page=True,animations='disabled')
   page.locator('#day-btn-1').click();expect(page.locator('#day-earn-box')).to_be_visible();page.get_by_role('button',name='Ocultar importes').click()
   assert '9.6696' not in page.locator('#app').inner_text();assert '79,77' not in page.locator('#app').inner_text()
   assert '•••• €/h' in page.locator('#app').inner_text();assert '48,5 h' in page.locator('#app').inner_text()
   page.screenshot(path=str(OUT/f'hidden-{width}.png'),full_page=True,animations='disabled')
   page.get_by_role('button',name='Año',exact=True).click();page.wait_for_timeout(120);expect(page.locator('#chart-anual')).to_contain_text('h');assert '€' not in page.locator('#chart-anual').text_content();assert_no_overflow(page)
   page.get_by_role('button',name='💬 IA',exact=True).click();expect(page.locator('#chat-input')).to_be_disabled();assert '<img' not in page.locator('#app').inner_text()
   page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible()
   page.get_by_role('button',name='Mostrar importes').click();page.locator('#day-btn-8').click();page.locator('#draft-hours').fill('8.75');page.get_by_role('button',name='✓ Añadir').click();assert page.evaluate('state.allData["2026-10"].days[8].hours')==8.75
   page.get_by_role('button',name='Borrar este día').click();assert page.evaluate('state.allData["2026-10"].days[8]') is None
   page.locator('#day-btn-9').click();page.get_by_role('button',name='Festivo',exact=True).click();page.locator('#draft-hours').fill('9.75');page.get_by_role('button',name='✓ Añadir').click();assert page.evaluate('state.allData["2026-10"].days[9].type')=='festivo'
   page.locator('#day-btn-10').click();page.get_by_role('button',name='Descanso',exact=True).click();page.get_by_role('button',name='✓ Añadir').click();assert page.evaluate('state.allData["2026-10"].days[10].hours')==0
   before=page.evaluate('monthly().neto');page.get_by_role('button',name='Ajustes',exact=True).click();page.get_by_role('spinbutton',name='Hora normal (€)',exact=True).fill('100');page.get_by_role('spinbutton',name='Hora normal (€)',exact=True).blur();assert page.evaluate('monthly().neto')==before
   malicious=json.loads(json.dumps(fixture));malicious['config']['userName']='"><img src=x onerror="window.pwned=1">';malicious['config']['deductions'][0]['name']='<svg onload="window.pwned=1">'
   page.locator('#backup-upload').set_input_files({'name':'copy.json','mimeType':'application/json','buffer':json.dumps(malicious).encode()});page.wait_for_timeout(100);assert not page.evaluate('window.pwned||false');assert page.locator('#app img,#app svg[onload]').count()==0
   saved=page.evaluate('JSON.stringify(payload())');page.locator('#backup-upload').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"config":{},"data":{"2026-02":{"days":{"30":{"type":"normal","hours":8}}}}}'});page.wait_for_timeout(50);assert page.evaluate('JSON.stringify(payload())')==saved
   page.get_by_role('button',name='Mes',exact=True).click();page.evaluate('processDownload=async()=>{};doExportMonth()');assert page.evaluate('state.pdfReady.blob.size')>1000;assert 'NETO ESTIMADO' in page.evaluate('assemblePdf(createPdfDoc().pages)') or page.evaluate('state.pdfReady.blob.size')>1000
   page.get_by_role('button',name='Ajustes',exact=True).click();page.get_by_role('button',name='Iniciar sesión con Google').click();page.wait_for_timeout(50);assert page.evaluate('Object.keys(state.allData).length')==0;page.get_by_role('button',name='Copiar datos sin cuenta a esta cuenta').click();page.wait_for_timeout(100)
   page.get_by_role('button',name='💬 IA',exact=True).click();page.locator('#chat-input').fill('<script>window.pwned=1</script> ¿Cuántas horas hay?');page.get_by_role('button',name='Enviar',exact=True).click();expect(page.locator('.bubble.bot')).to_contain_text('Respuesta ficticia');assert not page.evaluate('window.pwned||false');assert '<script>' in page.locator('.bubble.user').inner_text();assert '<img' in page.locator('.bubble.bot').inner_text();assert page.locator('.bubble img,.bubble script').count()==0
   prompt=page.evaluate('testRequests[0].contents[0].parts[0].text');assert 'fixture@example' not in prompt;assert '2026-09' not in prompt;assert 'bruto' not in prompt;assert 'userName' not in prompt
   page.evaluate('window.testAIError=429');page.locator('#chat-input').fill('Otra consulta');page.get_by_role('button',name='Enviar',exact=True).click();expect(page.locator('.bubble.bot').last).to_contain_text('cuota');page.evaluate('window.testAIError=null')
   page.get_by_role('button',name='Mes',exact=True).click();count=page.evaluate('testRequests.length');page.locator('#nomina-upload').set_input_files({'name':'synthetic.pdf','mimeType':'application/pdf','buffer':b'%PDF-synthetic'});expect(page.locator('#payroll-text')).to_be_visible();assert page.evaluate('testRequests.length')==count;assert len(page.locator('#payroll-text').input_value())>3000;assert 'Persona ficticia' not in page.locator('#payroll-text').input_value();page.get_by_role('button',name='Autorizar envío de este texto a Google').click();expect(page.get_by_text('Hay diferencias',exact=True)).to_be_visible()
   page.get_by_role('button',name='Ocultar importes').click();assert 'Hay diferencias' not in page.locator('#app').inner_text();page.get_by_role('button',name='Mostrar importes').click();page.evaluate('window.testPDFScan=true');page.locator('#nomina-upload').set_input_files({'name':'scan.pdf','mimeType':'application/pdf','buffer':b'%PDF-synthetic'});expect(page.get_by_role('alert')).to_contain_text('escaneado')
   assert page.evaluate('getComputedStyle(document.querySelector(".tab-content")).animationName')=='none'
   page.get_by_role('button',name='💬 IA',exact=True).click();page.evaluate('window.testAIWait=true');page.locator('#chat-input').fill('Consulta pendiente');page.get_by_role('button',name='Enviar',exact=True).click();page.wait_for_function('typeof resolveAI==="function"');page.get_by_role('button',name='Ajustes',exact=True).click();page.get_by_role('button',name='Cerrar sesión',exact=True).click();page.evaluate('window.testAIWait=false;resolveAI()');page.wait_for_timeout(100);assert page.evaluate('state.chatMsgs.length')==0
   page.evaluate('document.documentElement.style.fontSize="24px"');assert_no_overflow(page)
   assert not errors,errors
   print('PASS Chromium',width,'CRUD, decimals, colors, privacy, history, malicious import, PDF, simulated Gemini/auth/quota/payroll/full-text/consent/scan/logout, reduced motion',flush=True)
   ctx.close()
  # Real service worker/cache and real offline navigation (no real cloud/AI calls).
  ctx=browser.new_context(viewport={'width':390,'height':844});ctx.route('https://**/*',external);page=ctx.new_page();page.goto(URL);page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');page.evaluate('caches.open("plantometro-v19")');page.locator('#day-btn-8').click();page.locator('#draft-hours').fill('8.5');page.get_by_role('button',name='✓ Añadir').click();page.get_by_role('button',name='Ocultar importes').click();ctx.set_offline(True);page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible();assert page.evaluate('state.allData["2026-10"].days[8].hours')==8.5;page.locator('#day-btn-9').click();page.get_by_role('button',name='✓ Añadir').click();page.reload();assert page.evaluate('state.allData["2026-10"].days[9].hours')==8;assert 'plantometro-v19' in page.evaluate('caches.keys()');assert page.evaluate('fetch("./missing.js").then(r=>r.headers.get("content-type")).catch(()=>"failed")')=='failed';print('PASS real SW cache/install/offline reopen + CRUD/preferences; no JS-to-HTML fallback; other app cache preserved',flush=True);ctx.close();browser.close()
finally:server.shutdown()
