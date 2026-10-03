"""Real cache/SW and Firebase SDK; Auth/Firestore are local emulators.
Tests coherent update/offline opening, not Android installation or production.
"""
import http.server,json,re,subprocess,sys,threading,datetime
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];data=json.load(sys.stdin)
old={}
for path in [ROOT/'index.html',ROOT/'styles.css',ROOT/'manifest.json',ROOT/'sw.js',*ROOT.glob('js/*.js'),*ROOT.glob('shared/*.js')]:
 name=path.relative_to(ROOT).as_posix();r=subprocess.run(['git','show','a9c9382468e6b0bbdf15cad01a6ec2e8627288a2:Plantometro/'+name],capture_output=True)
 if r.returncode==0:old[name]=r.stdout
phase={'legacy':True}
def emulator_sync(text):
 text=re.sub(r'const fbConfig = \{[\s\S]*?\};',"const fbConfig={apiKey:'local-emulator-only',projectId:'demo-plantometro',authDomain:'localhost'};",text,count=1)
 text=text.replace('onAuthStateChanged, signOut }','onAuthStateChanged, signOut, connectAuthEmulator, signInWithCustomToken }')
 text=text.replace('writeBatch, runTransaction }','writeBatch, runTransaction, connectFirestoreEmulator }')
 text=text.replace('auth = getAuth(app);',"auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});")
 text=text.replace('  getRedirectResult(auth)',"  connectFirestoreEmulator(fs,'127.0.0.1',8080);if(!auth.currentUser)signInWithCustomToken(auth,window.localTestToken).catch(()=>{});\n  getRedirectResult(auth)")
 assert 'connectFirestoreEmulator' in text;return text
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  name=urlparse(self.path).path.removeprefix('/Plantometro/') or 'index.html';path=ROOT/name
  if not path.resolve().is_relative_to(ROOT):self.send_error(400);return
  body=old.get(name) if phase['legacy'] else path.read_bytes() if path.is_file() else None
  if body is None:self.send_error(404);return
  if name=='js/sync.js':body=emulator_sync(body.decode()).encode()
  mime='application/javascript' if name.endswith('.js') else 'text/css' if name.endswith('.css') else 'application/json' if name.endswith('.json') else 'text/html'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store' if name=='sw.js' else 'public, max-age=3600');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/Plantometro/'
prefs={'name':'Frank','theme':'dark','city':'Armilla','lat':37.14386,'lon':-3.62534,'customPreference':'keep'}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script('window.localTestToken='+json.dumps(data['token'])+';if(!localStorage.getItem("pg3b_settings"))localStorage.setItem("pg3b_settings",'+json.dumps(json.dumps(prefs))+');')
  ctx.route('https://api.open-meteo.com/**',lambda r:r.fulfill(json={'utc_offset_seconds':0,'current':{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'temperature_2m':24,'relative_humidity_2m':55,'weather_code':2,'wind_speed_10m':12},'daily':{}}))
  forbidden=[]
  for host in ['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com']:
   def reject(r,host=host):forbidden.append(host);r.abort()
   ctx.route('https://'+host+'/**',reject)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL,wait_until='domcontentloaded');expect(page.locator('#gate')).to_be_hidden(timeout=45000);expect(page.locator('.card')).to_have_count(1,timeout=45000)
  page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');assert 'plantometro-v16' in page.evaluate('caches.keys()')
  page.evaluate('caches.open("horas-v1")');phase['legacy']=False;page.reload(wait_until='domcontentloaded');page.wait_for_function("()=>{caches.keys().then(k=>window.updatedCache=k.includes('plantometro-v17')&&!k.includes('plantometro-v16'));return window.updatedCache===true;}",timeout=60000)
  expect(page.locator('#activity-btn')).to_be_visible(timeout=60000);expect(page.locator('#weather-peek')).to_be_visible();expect(page.locator('#gate')).to_be_hidden(timeout=45000);expect(page.locator('.card')).to_have_count(1)
  assert page.evaluate("import('./js/sync.js').then(m=>m.auth.app.options.projectId)")=='demo-plantometro'
  assert page.evaluate("import('./js/sync.js').then(m=>m.plants[0])")==data['fixture'];assert page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==prefs;assert 'horas-v1' in page.evaluate('caches.keys()')
  expect(page.locator('#weather-peek-temp')).to_contain_text('24');expect(page.locator('#activity-status')).to_contain_text('Cambios recientes');assert not errors,errors
  ctx.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.locator('#gate')).to_be_hidden(timeout=45000);expect(page.locator('.card')).to_have_count(1,timeout=45000);expect(page.locator('#weather-peek-age')).to_contain_text('Antigua');expect(page.locator('#activity-status')).to_contain_text('Sin conexión');assert page.evaluate("import('./js/sync.js').then(m=>m.plants[0])")==data['fixture'];assert page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==prefs
  assert not errors,errors;assert not forbidden,forbidden;print('PASS actual v16→v17 automatic update at /Plantometro/, coherent caches/new modules, preferences/photo/history preserved, unrelated cache kept; authenticated offline reopening with local Firebase SDK/cache and stale weather',flush=True)
  ctx.close();browser.close()
finally:server.shutdown()
