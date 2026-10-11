"""Isolated probe in real Chromium/official SDKs. Auth, attestation and model are SIMULATED."""
import base64,functools,http.server,json,re,threading,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/gemini-prueba/'
options=dict(re.findall(r'(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId): "([^"]+)"',(ROOT/'controlHoras/index.html').read_text()))
cache={};requests=[];limited_tokens=set();consumed_tokens=set();blocked=[];mode='ok'
def resource(url):
 if url not in cache:cache[url]=urllib.request.urlopen(url,timeout=30).read()
 return cache[url]
def part(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
jwt=part({'alg':'none','typ':'JWT'})+'.'+part({'sub':'fixture-user','user_id':'fixture-user','aud':'mishoras-bb0cc','iss':'https://securetoken.google.com/mishoras-bb0cc','iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.fixture'
def route_external(route):
 url=route.request.url;headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, OPTIONS'}
 if route.request.method=='OPTIONS':route.fulfill(status=204,headers=headers);return
 if url.startswith('https://www.gstatic.com/firebasejs/'):
  route.fulfill(body=resource(url),content_type='application/javascript',headers=headers)
 elif 'identitytoolkit.googleapis.com' in url:
  if 'accounts:lookup' in url:route.fulfill(json={'users':[{'localId':'fixture-user','createdAt':str(int(time.time()*1000)),'lastLoginAt':str(int(time.time()*1000)),'providerUserInfo':[]}]},headers=headers)
  else:route.fulfill(json={'idToken':jwt,'refreshToken':'fixture-refresh','expiresIn':'3600','localId':'fixture-user'},headers=headers)
 elif 'recaptcha/enterprise.js' in url:
  route.fulfill(body="let fixtureCaptchaSuccess=()=>{};window.grecaptcha={enterprise:{ready:f=>f(),render:(e,o)=>{fixtureCaptchaSuccess=o.callback;return 'fixture-widget';},execute:async()=>{fixtureCaptchaSuccess();return 'fixture-recaptcha';}}};",content_type='application/javascript',headers=headers)
 elif 'firebaseappcheck.googleapis.com' in url:
  if mode=='first400':
   route.fulfill(status=400,json={'error':{'code':400,'status':'INVALID_ARGUMENT','message':'App not registered. PRIVATE_FIXTURE token not for display','details':[{'metadata':{'token':'PRIVATE_FIXTURE'}}]}},headers=headers);return
  payload=json.loads(route.request.post_data or '{}');limited=payload.get('limited_use') is True
  token='fixture-limited-'+str(len(limited_tokens)+1) if limited else 'fixture-app-check'
  if limited:limited_tokens.add(token)
  route.fulfill(json={'token':token,'ttl':'3600s'},headers=headers)
 elif 'firebasevertexai.googleapis.com' in url:
  token=route.request.headers.get('x-firebase-appcheck');assert token in limited_tokens and token not in consumed_tokens,'Every request requires a fresh limited-use attestation';consumed_tokens.add(token)
  requests.append({'payload':json.loads(route.request.post_data),'headers':route.request.headers})
  if mode=='quota':route.fulfill(status=429,json={'error':{'code':429,'message':'Synthetic quota','status':'RESOURCE_EXHAUSTED'}},headers=headers)
  elif mode=='attestation':route.fulfill(status=401,json={'error':{'code':401,'message':'Firebase App Check token is invalid.','status':'UNAUTHENTICATED'}},headers=headers)
  else:route.fulfill(json={'candidates':[{'content':{'role':'model','parts':[{'text':'<img src=x onerror="window.pwned=1"> 8,25 horas ficticias.'}]},'finishReason':'STOP'}]},headers=headers)
 else:blocked.append(url);route.abort()

try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(320,740),(768,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
   ctx.route('https://**/*',route_external)
   ctx.add_init_script('''const fixtureValue='NO LEER: DATOS REALES CENTINELA';localStorage.setItem('horas-app-v2',fixtureValue);localStorage.setItem('horas-hide-money','1');window.realDataAccess=[];for(const name of ['getItem','setItem','removeItem']){const original=Storage.prototype[name];Storage.prototype[name]=function(key,...args){if(key==='horas-app-v2'||key==='horas-hide-money')realDataAccess.push(name+':'+key);return original.call(this,key,...args);};}''')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));before=len(requests)
   page.goto(URL);expect(page.locator('#status')).to_contain_text('No hay sesión',timeout=60000)
   expect(page.locator('#send')).to_be_disabled();assert len(requests)==before
   # A legacy compat SDK writes a fictional Auth session to the normal persistence.
   # Reopening the page must read that same session with SDK 12; no app JS is executed.
   for name in ['app-compat','auth-compat']:page.add_script_tag(url=f'https://www.gstatic.com/firebasejs/10.14.1/firebase-{name}.js')
   page.evaluate('''async options=>{firebase.initializeApp(options);await firebase.auth().signInWithCustomToken('fixture-custom-token');}''',options)
   page.reload();expect(page.locator('#status')).to_contain_text('Sesión disponible',timeout=60000)
   expect(page.locator('#send')).to_be_enabled();assert len(requests)==before
   assert not page.evaluate('window.realDataAccess'),page.evaluate('window.realDataAccess')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.locator('#send').click();expect(page.locator('#result')).to_contain_text('8,25 horas ficticias.',timeout=60000)
   assert len(requests)==before+1
   request=requests[-1];prompt=request['payload']['contents'][0]['parts'][0]['text']
   assert '"recordedHours":8.25' in prompt and '"fictitious":true' in prompt
   assert 'CENTINELA' not in prompt and 'fixture-user' not in prompt
   assert request['headers']['authorization']=='Firebase '+jwt
   assert request['headers']['x-firebase-appcheck'] in consumed_tokens
   assert page.locator('#result img').count()==0 and not page.evaluate('window.pwned||false')
   assert page.evaluate('navigator.serviceWorker.controller===null')
   assert page.evaluate('navigator.serviceWorker.getRegistrations().then(x=>x.length)')==0
   assert not page.evaluate('window.realDataAccess')
   mode='attestation';before=len(requests);page.locator('#send').click()
   expect(page.locator('#status')).to_contain_text('App Check rechazó',timeout=45000)
   expect(page.locator('#result')).to_contain_text('HTTP 401');assert len(requests)==before+1
   mode='quota';before=len(requests);page.locator('#send').click()
   expect(page.locator('#status')).to_contain_text('cuota',timeout=45000);assert len(requests)==before+1
   page.evaluate('navigator.__defineGetter__("onLine",()=>false);window.dispatchEvent(new Event("offline"))')
   expect(page.locator('#status')).to_contain_text('Sin conexión');expect(page.locator('#send')).to_be_disabled();assert len(requests)==before+1
   page.evaluate('navigator.__defineGetter__("onLine",()=>true);window.dispatchEvent(new Event("online"))');mode='ok'
   page.locator('#send').click();expect(page.locator('#result')).to_contain_text('8,25 horas ficticias.',timeout=45000)
   page.evaluate('''async()=>{const {getAuth,signOut}=await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');await signOut(getAuth());}''')
   expect(page.locator('#status')).to_contain_text('No hay sesión');expect(page.locator('#send')).to_be_disabled();expect(page.locator('#result')).to_have_text('')
   # Fresh client: first exchange rejection is transformed by the official SDK.
   # It must retain its original safe cause and block all further UI sends.
   page.evaluate('''async options=>{const {getAuth,signInWithCustomToken}=await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');await signInWithCustomToken(getAuth(),'fixture-custom-token');}''',options)
   mode='first400';before=len(requests);page.reload();expect(page.locator('#send')).to_be_enabled(timeout=60000);page.locator('#send').click()
   expect(page.locator('#result')).to_contain_text('appCheck/initial-throttle',timeout=45000)
   expect(page.locator('#result')).to_contain_text('Primer rechazo: HTTP 400 · INVALID_ARGUMENT · La aplicación no está registrada en App Check.')
   expect(page.locator('#send')).to_be_disabled();assert len(requests)==before
   assert 'PRIVATE_FIXTURE' not in page.locator('body').inner_text()
   page.evaluate('window.dispatchEvent(new Event("online"))');expect(page.locator('#send')).to_be_disabled()
   mode='ok'
   assert not page.evaluate('window.realDataAccess') and not errors,errors
   assert not blocked,blocked
   print(f'PASS isolated Chromium {width}: persisted SDK 10→12 session; consent; no real-data access/Firestore/SW; fictitious payload; safe text; 401/quota/offline/sign-out. AUTH, ATTESTATION AND MODEL SIMULATED.',flush=True)
   ctx.close()
  browser.close()
finally:server.shutdown()

