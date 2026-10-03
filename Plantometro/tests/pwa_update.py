"""Targeted real Chromium/worker regression: coherent updates preserve data/drafts.
Firebase and weather are explicit adapters. No production accounts or garden.
"""
import ast,functools,http.server,json,subprocess,threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
sdk={};source=ast.parse((ROOT/'tests/ui_smoke.py').read_text())
names={'APP','AUTH','FIRESTORE','APP_CHECK','FUNCTIONS','AI_RESPONSE'}
nodes=[n for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets)]
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(ROOT/'tests/ui_smoke.py'),'exec'),{'json':json},sdk)
mocks={'firebase-app.js':sdk['APP'],'firebase-auth.js':sdk['AUTH'],'firebase-app-check.js':sdk['APP_CHECK'],'firebase-functions.js':sdk['FUNCTIONS']}
mocks['firebase-firestore.js']=sdk['FIRESTORE'].replace('export const setDoc = async','const baseSetDoc = async')+'''
export const setDoc=async(ref,p)=>{
 if(window.testHoldWrite)await new Promise(r=>window.finishSave=r);
 await baseSetDoc(ref,p);localStorage.setItem('qa_plants',JSON.stringify(window.testPlants));
};
'''
plant={'id':'keep','name':'Planta de prueba','waterFreq':7,'lastWater':'2026-01-01','history':[{'t':'agua','date':'2026-01-01','by':'Prueba'}],'gallery':[{'date':'2026-01-01','img':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=','note':'Conservar'}],'unknownField':'keep','createdAt':'2026-01-01T12:00:00Z'}
legacy={'name':'Prueba','theme':'dark','city':'Granada','lat':37.1773,'lon':-3.5986,'customPreference':'keep','geminiKey':'migration-test-only'}
phase={'value':13}
old={}
for p in [ROOT/'index.html',ROOT/'styles.css',ROOT/'manifest.json',ROOT/'sw.js',*ROOT.glob('js/*.js')]:
    name=p.relative_to(ROOT).as_posix()
    r=subprocess.run(['git','show','584944b3a2976106f9bdd0bbdbf1ce5c5c636d7a:Plantometro/'+name],capture_output=True)
    if r.returncode==0:old[name]=r.stdout.decode()

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        path=urlparse(self.path).path.removeprefix('/Plantometro/') or 'index.html'
        if path.startswith('vendor/'):
            text=mocks.get(path.split('/')[-1]);mime='application/javascript'
        else:
            p=ROOT/path
            text=old.get(path) if phase['value']==13 else p.read_text() if p.is_file() and p.suffix in {'.html','.js','.css','.json'} else None
            mime='application/javascript' if path.endswith('.js') else 'text/css' if path.endswith('.css') else 'application/json' if path.endswith('.json') else 'text/html'
        if text is None:self.send_error(404);return
        for name in mocks:text=text.replace('https://www.gstatic.com/firebasejs/10.12.2/'+name,'./vendor/'+name if path=='sw.js' else '../vendor/'+name)
        if path=='sw.js' and phase['value']>16:text=text.replace('plantometro-v16','plantometro-v'+str(phase['value']))
        if path=='js/app.js':text+='\nwindow.qaBuild='+str(phase['value'])+';sessionStorage.qaBoots=String(Number(sessionStorage.qaBoots||0)+1);'
        data=text.encode();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store' if path=='sw.js' else 'public, max-age=3600');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/Plantometro/'
try:
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844})
    ctx.route('https://api.open-meteo.com/**',lambda r:r.fulfill(json={'current':{'temperature_2m':24,'relative_humidity_2m':55,'weather_code':2}}))
    ctx.add_init_script('window.testPlants=JSON.parse(localStorage.getItem("qa_plants")||'+json.dumps(json.dumps([plant]))+');window.testWrites=[];if(!localStorage.getItem("pg3b_settings"))localStorage.setItem("pg3b_settings",'+json.dumps(json.dumps(legacy))+');')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
    expect(page.locator('#grid .card')).to_have_count(1);page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller')
    assert 'plantometro-v13' in page.evaluate('caches.keys()')
    page.evaluate("caches.open('horas-v1')")
    phase['value']=16;page.reload();page.wait_for_function('window.qaBuild===16')
    page.wait_for_function("caches.keys().then(k=>k.includes('plantometro-v16')&&!k.includes('plantometro-v13'))")
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated'&&navigator.serviceWorker.controller===r.active)")
    expected={k:v for k,v in legacy.items() if k!='geminiKey'}
    assert page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==expected
    assert page.evaluate("import('./js/sync.js').then(s=>s.plants)")==[plant]
    assert 'horas-v1' in page.evaluate('caches.keys()')
    print('PASS PWA v13→v16: real worker, secret-only migration, garden/photos/history/preferences preserved, other-app cache retained',flush=True)

    page.locator('.fab').click();page.locator('#f-name').fill('Borrador sin guardar')
    boots=page.evaluate('sessionStorage.qaBoots');phase['value']=17
    page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
    page.wait_for_function("caches.keys().then(k=>k.includes('plantometro-v17')&&!k.includes('plantometro-v16'))")
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated'&&navigator.serviceWorker.controller===r.active)")
    assert page.evaluate('sessionStorage.qaBoots')==boots;expect(page.locator('#f-name')).to_have_value('Borrador sin guardar')
    # With a new worker active, responses use one coherent new version; the old
    # running form remains intact until the user closes it.
    assert page.evaluate("fetch('./js/app.js').then(r=>r.text()).then(t=>t.includes('window.qaBuild=17'))")
    page.locator('#form-modal .xbtn').click();page.wait_for_function('window.qaBuild===17');assert int(page.evaluate('sessionStorage.qaBoots'))==int(boots)+1
    print('PASS pending PWA update waits for the open form; closing it reloads once with coherent cached modules',flush=True)

    page.evaluate('window.testHoldWrite=true');page.locator('[data-water=keep]').click();page.wait_for_function('typeof finishSave==="function"')
    boots=page.evaluate('sessionStorage.qaBoots');phase['value']=18
    page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
    page.wait_for_function("caches.keys().then(k=>k.includes('plantometro-v18')&&!k.includes('plantometro-v17'))")
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated'&&navigator.serviceWorker.controller===r.active)")
    assert page.evaluate('sessionStorage.qaBoots')==boots
    page.evaluate('window.testHoldWrite=false;finishSave()');page.wait_for_function("import('./js/sync.js').then(s=>!s.hasPendingWrites())")
    # Preserve the visible Undo action as well as the write itself.
    expect(page.locator('#toast button')).to_be_visible();assert page.evaluate('sessionStorage.qaBoots')==boots
    page.wait_for_function('window.qaBuild===18',timeout=15000)
    saved=page.evaluate("import('./js/sync.js').then(s=>s.plants[0])")
    assert len(saved['history'])==2 and saved['gallery']==plant['gallery'] and saved['unknownField']=='keep'
    print('PASS PWA update waits for unconfirmed write and Undo; confirmed history/photos survive reload',flush=True)
    ctx.set_offline(True);page.reload();expect(page.locator('#grid .card')).to_have_count(1);assert page.evaluate('qaBuild')==18
    assert not errors,errors
    print('PASS updated app shell opens offline with coherent cached modules; Firebase/weather explicitly adapted',flush=True)
    ctx.set_offline(False)
    page.locator('[data-open=keep]').click();page.locator('#d-photo-section > summary').click();page.locator('#d-gal .gph').click()
    page.evaluate("window.addEventListener('plantometro:sync-idle',()=>{window.testPlants=[];localStorage.setItem('qa_plants','[]');testSnapshot({docs:[]});},{once:true})")
    page.locator('#pm-del').click();expect(page.locator('#photo-modal')).to_be_hidden();expect(page.locator('#grid .card')).to_have_count(0)
    assert not errors,errors
    print('PASS concurrent deletion of the plant while removing a diary photo produces no crash or resurrection',flush=True)
    ctx.close();browser.close()
finally:server.shutdown()
