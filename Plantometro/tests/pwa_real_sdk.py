"""Legacy update with real Firebase SDK and public weather, no authenticated garden.
Old/current static files are served locally with a long HTTP cache. No service adapter.
This is not Google OAuth, production CRUD, or physical Android installation.
"""
import http.server,json,subprocess,threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
old={}
for path in [ROOT/'index.html',ROOT/'styles.css',ROOT/'manifest.json',ROOT/'sw.js',*ROOT.glob('js/*.js')]:
 name=path.relative_to(ROOT).as_posix()
 result=subprocess.run(['git','show','584944b3a2976106f9bdd0bbdbf1ce5c5c636d7a:Plantometro/'+name],capture_output=True)
 if result.returncode==0:old[name]=result.stdout.decode()
phase={'legacy':True}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  name=urlparse(self.path).path.removeprefix('/Plantometro/') or 'index.html';path=ROOT/name
  if name.startswith('../'):self.send_error(400);return
  text=old.get(name) if phase['legacy'] else path.read_text() if path.is_file() and path.suffix in {'.html','.js','.css','.json'} else None
  if text is None:self.send_error(404);return
  mime='application/javascript' if name.endswith('.js') else 'text/css' if name.endswith('.css') else 'application/json' if name.endswith('.json') else 'text/html'
  data=text.encode();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store' if name=='sw.js' else 'public, max-age=3600');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
prefs={'name':'Prueba','theme':'dark','city':'Granada','lat':37.1773,'lon':-3.5986,'geminiKey':'migration-test-only','unknownPreference':'keep'}
garden=[{'id':'local-only-fixture','name':'Dato local de prueba','photo':'data:image/jpeg;base64,AAAA','history':[{'t':'agua','date':'2026-01-01'}],'gallery':[{'date':'2026-01-01','img':'data:image/jpeg;base64,AAAA'}]}]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/Plantometro/');expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=45000)
  page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');assert 'plantometro-v13' in page.evaluate('caches.keys()')
  page.evaluate('([prefs,garden])=>{localStorage.setItem("pg3b_settings",JSON.stringify(prefs));localStorage.setItem("pg3_cache_qa_only",JSON.stringify(garden));return caches.open("horas-v1")}',[prefs,garden])
  phase['legacy']=False;page.reload(wait_until='domcontentloaded')
  page.wait_for_function("caches.keys().then(k=>k.includes('plantometro-v16')&&!k.includes('plantometro-v13'))",timeout=60000)
  expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=60000)
  assert page.evaluate("import('./js/sync.js').then(s=>s.auth.currentUser===null)")
  assert page.locator('#s-gkey').count()==0
  assert page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')=={k:v for k,v in prefs.items() if k!='geminiKey'}
  assert page.evaluate('JSON.parse(localStorage.getItem("pg3_cache_qa_only"))')==garden
  assert 'horas-v1' in page.evaluate('caches.keys()')
  # Old cached settings can throw during the first navigation. The independent
  # boot must recover by itself; require the final app to stay error-free.
  legacy_errors=len(errors);page.reload(wait_until='domcontentloaded');expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=45000)
  assert len(errors)==legacy_errors,'The coherent new build has a browser error'
  ctx.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=45000)
  assert len(errors)==legacy_errors
  print('PASS legacy v13→v16 automatically recovers with real Firebase SDK; local preferences/photo/history/unrelated cache retained; final shell offline without new errors; no account/garden accessed',flush=True)
  ctx.close();browser.close()
finally:server.shutdown()
