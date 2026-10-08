"""Real Chromium + official Firebase 10/12 and PDF SDKs; auth/attestation/model responses SIMULATED."""
import base64,functools,http.server,json,threading,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'controlHoras/captures';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
cache={}
def resource(url):
 if url not in cache:cache[url]=urllib.request.urlopen(url,timeout=30).read()
 return cache[url]
def part(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
jwt=part({'alg':'none','typ':'JWT'})+'.'+part({'sub':'fixture-user','user_id':'fixture-user','aud':'mishoras-bb0cc','iss':'https://securetoken.google.com/mishoras-bb0cc','iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.fixture'
facts={'period':'2026-10','gross':100,'deductions':10,'net':90,'normalHours':10,'holidayHours':0,'extraHours':0,'normalRate':10,'holidayRate':15,'extraRate':0,'complete':True,'missing':[]}
fixture={'config':{'rateNormal':10,'plusFestivo':5,'rateExtra':0,'userName':'Persona Ficticia','profile':'ett','sintaxUnlocked':False,'hideMoney':False,'deductions':[{'id':'d1','name':'IRPF','pct':10}]},'data':{'2026-10':{'days':{'1':{'type':'normal','hours':10}}},'2026-09':{'days':{'1':{'type':'normal','hours':55}}}}}
requests=[];mode='ok'
def route_external(route):
 global mode
 url=route.request.url;headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, OPTIONS'}
 if route.request.method=='OPTIONS':route.fulfill(status=204,headers=headers);return
 if url.startswith('https://www.gstatic.com/firebasejs/') or url.startswith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/') or url=='https://cdn.jsdelivr.net/npm/chart.js':
  route.fulfill(body=resource(url),content_type='application/javascript',headers=headers)
 elif 'identitytoolkit.googleapis.com' in url:
  if 'accounts:lookup' in url:route.fulfill(json={'users':[{'localId':'fixture-user','createdAt':str(int(time.time()*1000)),'lastLoginAt':str(int(time.time()*1000)),'providerUserInfo':[]}]},headers=headers)
  else:route.fulfill(json={'idToken':jwt,'refreshToken':'fixture-refresh','expiresIn':'3600','localId':'fixture-user'},headers=headers)
 elif 'recaptcha/enterprise.js' in url:
  route.fulfill(body="window.grecaptcha={enterprise:{ready:f=>f(),render:()=>1,execute:async()=> 'fixture-recaptcha'}};",content_type='application/javascript',headers=headers)
 elif 'firebaseappcheck.googleapis.com' in url:
  route.fulfill(json={'token':'fixture-app-check','ttl':'3600s'},headers=headers)
 elif 'firebasevertexai.googleapis.com' in url:
  payload=json.loads(route.request.post_data);requests.append({'payload':payload,'headers':route.request.headers});(OUT/'gemini-endpoint.json').write_text(json.dumps({'url':url.split('?')[0]}))
  if mode=='quota':route.fulfill(status=429,json={'error':{'code':429,'message':'Synthetic quota','status':'RESOURCE_EXHAUSTED'}},headers=headers)
  else:
   payroll='responseSchema' in payload.get('generationConfig',{});text='{invalid}' if mode=='invalid' else json.dumps(facts) if payroll else '<img src=x onerror="window.pwned=1"> 10 horas registradas.'
   route.fulfill(json={'candidates':[{'content':{'role':'model','parts':[{'text':text}]},'finishReason':'STOP'}]},headers=headers)
 else:route.abort()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(390,844),(768,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='block',reduced_motion='reduce');ctx.route('https://**/*',route_external);ctx.add_init_script('localStorage.setItem("horas-app-v2",'+json.dumps(json.dumps(fixture))+');')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL)
   # Real compat SDK constructs a User; fake HTTP auth response never contacts production Auth.
   page.evaluate('''async()=>{const a=firebase.initializeApp(firebaseConfig,'fixture-user');const c=await a.auth().signInWithCustomToken('fixture-custom-token');cloud.user=c.user;}''')
   page.get_by_role('button',name='💬 IA',exact=True).click();page.locator('#ai-period').fill('2026-10');page.locator('#ai-period').dispatch_event('change');page.locator('#chat-input').fill('¿Cuántas horas registré este mes?');page.get_by_role('button',name='Enviar',exact=True).click();expect(page.locator('.bubble.bot')).to_contain_text('10 horas registradas.',timeout=60000)
   req=requests[-1];assert req['headers'].get('authorization')=='Bearer '+jwt;assert req['headers'].get('x-firebase-appcheck')=='fixture-app-check';payload=json.dumps(req['payload']);assert '55' not in payload;assert '2026-09' not in payload;assert 'Persona Ficticia' not in payload;assert 'gross' not in payload;assert page.locator('.bubble img').count()==0;assert not page.evaluate('window.pwned||false');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/f'gemini-chat-{width}.png'),full_page=True)
   mode='quota';before=len(requests);page.locator('#chat-input').fill('Horas del mes');page.get_by_role('button',name='Enviar',exact=True).click();expect(page.locator('.bubble.bot').last).to_contain_text('cuota',timeout=45000);assert len(requests)==before+1;mode='ok'
   page.evaluate('navigator.__defineGetter__("onLine",()=>false)');before=len(requests);page.locator('#chat-input').fill('Horas');page.get_by_role('button',name='Enviar',exact=True).click();expect(page.locator('.bubble.bot').last).to_contain_text('Sin conexión');assert len(requests)==before;page.evaluate('navigator.__defineGetter__("onLine",()=>true)')
   page.get_by_role('button',name='Mes',exact=True).click()
   pdf=page.evaluate('''()=>{const d=createPdfDoc();for(const t of ['Nombre: Persona Ficticia','Periodo octubre 2026: horas normales 10, festivas 0, extras 0','Tarifa normal 10 EUR, festiva total 15 EUR','Bruto 100 EUR; retenciones 10 EUR; neto 90 EUR']){d.txt(40,t);d.down(20);}return Array.from(assemblePdf(d.pages),c=>c.charCodeAt(0));}''')
   before=len(requests);page.locator('#nomina-upload').set_input_files({'name':'ficticia.pdf','mimeType':'application/pdf','buffer':bytes(pdf)});expect(page.locator('#payroll-text')).to_be_visible(timeout=60000);assert 'Persona Ficticia' not in page.locator('#payroll-text').input_value();assert len(requests)==before;assert 'Página 1' in page.locator('#payroll-text').input_value();page.screenshot(path=str(OUT/f'gemini-consent-{width}.png'),full_page=True)
   page.get_by_role('button',name='Autorizar envío de este texto a Google',exact=True).click();expect(page.get_by_text('No se puede comprobar con la información disponible',exact=True)).to_be_visible(timeout=45000);assert len(requests)==before+1;payload=json.dumps(requests[-1]['payload']);assert 'Persona Ficticia' not in payload;assert 'recordedHours' not in payload;assert '2026-09' not in payload
   page.get_by_role('checkbox').check();expect(page.get_by_text('Cuadra con los datos disponibles',exact=True)).to_be_visible();assert page.evaluate('state.allData["2026-10"].days[1].hours')==10
   page.get_by_role('button',name='Ocultar importes').click();assert page.locator('#payroll-text').count()==0;assert page.get_by_text('Cuadra con los datos disponibles',exact=True).count()==0;page.get_by_role('button',name='Mostrar importes').click()
   mode='invalid';page.locator('#nomina-upload').set_input_files({'name':'ficticia.pdf','mimeType':'application/pdf','buffer':bytes(pdf)});expect(page.locator('#payroll-text')).to_be_visible(timeout=45000);page.get_by_role('button',name='Autorizar envío de este texto a Google',exact=True).click();expect(page.get_by_text('Gemini devolvió una respuesta inválida. No se ha comprobado la nómina ni cambiado datos.',exact=True)).to_be_visible(timeout=45000);mode='ok';assert not errors,errors
   print(f'PASS Chromium {width}: actual legacy→modular Auth bridge, official AI/App Check SDK schema/headers, PDF extraction, consent, local comparison, privacy, quota/invalid/offline; MODEL AND ATTESTATION SIMULATED',flush=True);ctx.close()
  browser.close()
finally:server.shutdown()
