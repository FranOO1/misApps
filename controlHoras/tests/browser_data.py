"""Real Chromium, fictional local data, cloud disabled. Imports/history/PDF/update."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
previous_release=False
PREVIOUS_HTML=b'''<!doctype html><meta charset="utf-8"><title>Previous PWA fixture</title><p>Previous installed shell</p><script>navigator.serviceWorker.register('./sw.js')</script>'''
PREVIOUS_SW=(ROOT/'controlHoras/tests/fixtures/sw-v5.js').read_bytes()
CURRENT_CACHE=__import__('re').search(r"const CACHE='([^']+)'",(ROOT/'controlHoras/sw.js').read_text()).group(1)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=self.path.split('?')[0]
  body=PREVIOUS_SW if previous_release and path=='/controlHoras/sw.js' else PREVIOUS_HTML if previous_release and path in ['/controlHoras/','/controlHoras/index.html'] else None
  if body is None:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type','application/javascript' if path.endswith('.js') else 'text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
config={'rateNormal':10,'plusFestivo':5,'rateExtra':20,'userName':'','profile':'sintax','sintaxUnlocked':True,'hideMoney':False,'deductions':[{'id':'one','name':'IRPF','pct':10}]}
data={'2025-12':{'days':{str(d):{'type':'normal','hours':10} for d in [29,30,31]}},'2026-01':{'days':{'1':{'type':'normal','hours':10},'2':{'type':'festivo','hours':10}}}}
original=json.dumps({'config':config,'data':data})
try:
 with sync_playwright() as p:
  browser=p.chromium.launch();ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.route('https://**/*',lambda r:r.abort());ctx.add_init_script('if(!localStorage.getItem("horas-app-v2"))localStorage.setItem("horas-app-v2",'+json.dumps(original)+');');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL)
  assert page.evaluate('localStorage.getItem("horas-original-v2")')==original
  assert page.evaluate('state.allData["2026-01"].historicalStatus')=='unknown'
  assert page.evaluate('monthly(2026,0).bruto')==150
  assert page.evaluate('monthly(2026,1).brutoExtra')==200
  page.evaluate('state.year=2026;state.month=0;render();selectDay(1)');assert page.evaluate('C.daily(state.allData,state.config,2026,0,1).bruto')==0
  before=page.evaluate('monthly(2026,0)');page.evaluate('updateConfig("rateNormal","100");updateDed(0,"pct","20")');assert page.evaluate('monthly(2026,0)')==before
  # Pay-only February is frozen before changes; annual/PDF/context agree.
  assert page.evaluate('monthly(2026,1).brutoExtra')==200
  assert page.evaluate('getAnnualData()[1].neto')==180
  assert page.evaluate('expectedForPeriod("2026-01").gross')==150
  pdf=page.evaluate('(()=>{const d=createPdfDoc();buildMonthReport(d,2026,0);return assemblePdf(d.pages);})()');assert '150,00' in pdf;assert 'extra pendiente' in pdf
  page.evaluate('processDownload=async()=>{};doExportYear(2026)');assert page.evaluate('state.pdfReady.blob.size')>1000
  saved=page.evaluate('JSON.stringify(payload())')
  for obj in [{'config':config,'data':{'2026-02':{'days':{'30':{'type':'normal','hours':8}}}}},{'config':config,'data':{'2026-01':{'days':{'1':{'type':'normal','hours':25}}}}},{'config':config,'data':{},'__proto__':{'polluted':True}}]:
   page.locator('#backup-upload').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(obj).encode()});page.wait_for_timeout(100);assert page.evaluate('JSON.stringify(payload())')==saved
  malicious={**config,'userName':'<img src=x onerror="window.pwned=1">','deductions':[{'id':'one','name':'</input><svg onload="window.pwned=1">','pct':10}]}
  valid={'config':malicious,'data':{'2026-01':{'days':{'3':{'type':'normal','hours':8.25}}}}}
  page.locator('#backup-upload').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(valid).encode()});page.wait_for_function('state.allData["2026-01"].days[3]?.hours===8.25');assert page.evaluate('state.allData["2026-01"].days[1]') is None;assert page.evaluate('!!sync.recovery()')
  page.get_by_role('button',name='Ajustes',exact=True).click();assert page.locator('#app img,#app svg[onload]').count()==0;assert not page.evaluate('window.pwned||false');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.evaluate('restoreRecovery()');assert page.evaluate('monthly(2026,0).bruto')==150
  page.reload();assert page.evaluate('monthly(2026,0).bruto')==150;assert page.evaluate('localStorage.getItem("horas-original-v2")')==original;assert not errors,errors
  print('PASS actual Chromium: legacy migration, preserved original, historic rates, year-boundary extras, pay-only annual/PDF, invalid/malicious import rejection, recoverable replacement and restore',flush=True);ctx.close()
  # Install an actual older worker fixture before serving the actual new worker.
  # Calling update() on the same bytes is not evidence of a version transition.
  previous_release=True
  ctx=browser.new_context(viewport={'width':768,'height':1024});ctx.route('https://**/*',lambda r:r.abort());ctx.add_init_script('if(!localStorage.getItem("horas-app-v2")){localStorage.setItem("horas-app-v2",'+json.dumps(original)+');localStorage.setItem("horas-hide-money","1");}');page=ctx.new_page();update_errors=[];page.on('pageerror',lambda e:update_errors.append(str(e)));page.goto(URL);page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');assert page.title()=='Previous PWA fixture';page.evaluate('caches.open("unrelated-cache")');assert 'horas-v5-completa-20261011' in page.evaluate('caches.keys()')
  previous_release=False
  page.evaluate('window.newWorkerReady=new Promise(resolve=>navigator.serviceWorker.addEventListener("controllerchange",resolve,{once:true}));navigator.serviceWorker.getRegistration().then(r=>r.update())');page.evaluate('newWorkerReady');page.wait_for_function('current=>caches.keys().then(keys=>!keys.includes("horas-v5-completa-20261011")&&keys.includes(current))',arg=CURRENT_CACHE);page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible();assert page.evaluate('localStorage.getItem("horas-original-v2")')==original;assert page.evaluate('monthly(2026,0).bruto')==150
  page.evaluate('state.year=2026;state.month=9;render();selectDay(7);saveDay()');ctx.set_offline(True);page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible();assert page.evaluate('state.allData["2026-10"].days[7].hours')==8;assert 'unrelated-cache' in page.evaluate('caches.keys()');assert not update_errors,update_errors;ctx.close();browser.close()
  print('PASS actual old-worker fixture → new application worker → offline reload: original records, migration and device privacy survive; unrelated cache retained. No production Firebase.',flush=True)
finally:server.shutdown()

