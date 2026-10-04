"""Real Chromium DOM with explicit SDK adapters; no production services or garden.
Run from repository root: python Plantometro/tests/security_ui.py
"""
import ast,base64,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'Plantometro/tests/ui_smoke.py';tree=ast.parse(source.read_text())
names={'APP','AUTH','FIRESTORE','PLANT','AI_RESPONSE','APP_CHECK','FUNCTIONS'}
functions={'route_external','enable_test_ai','open_section','check_contrast','clear_dock'}
nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or
       isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets) or
       isinstance(n,ast.FunctionDef) and n.name in functions]
helpers={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),helpers)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/Plantometro/'
photo='data:image/jpeg;base64,'+base64.b64encode((ROOT/'Plantometro/preview-assets/plant.jpg').read_bytes()).decode()
plant={**helpers['PLANT'],'name':'Planta de prueba','photo':photo,'gallery':[{'date':'2026-01-01','img':photo,'note':'Foto anterior'}]}
def section(page,id):helpers['open_section'](page,id)
def ficha(page):page.locator('[data-open=existing]').click()
def settings(page):page.locator('#settings-btn').click()
def close(page,id):page.locator('#'+id+' .xbtn').click()

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(320,740),(768,1024)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
        ctx.route('https://**/*',helpers['route_external'])
        prefs={'name':'Test','city':'Granada','theme':'dark','summerMode':True,'lastNotif':'2026-01-01','customPreference':'preserve','geminiKey':'obsolete-test-marker'}
        ctx.add_init_script('window.testPlants='+json.dumps([plant])+';window.testWrites=[];window.notificationCalls=0;localStorage.setItem("pg3b_settings",'+json.dumps(json.dumps(prefs))+');localStorage.setItem("other-app","preserve");'+
          "Object.defineProperty(window,'Notification',{value:class{constructor(){window.notificationCalls++;}static permission='granted';static async requestPermission(){window.notificationCalls++;return 'granted';}}});Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve({showNotification:async()=>window.notificationCalls++}),addEventListener(){},register:async()=>({update:async()=>{}})},configurable:true});")
        page=ctx.new_page();errors=[];logs=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:logs.append(m.text));page.goto(URL)
        expect(page.locator('#grid .card')).to_have_count(1)
        migrated=page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))');expected={**prefs};del expected['geminiKey'];assert migrated==expected
        assert page.evaluate('localStorage.getItem("other-app")')=='preserve'
        assert page.locator('#s-gkey,#s-notif-sw,[data-action=enableNotifs]').count()==0
        page.locator('.fab').click();expect(page.locator('#f-identify')).to_be_disabled();expect(page.locator('#f-ai-availability')).to_have_text('Ayuda con IA no disponible');close(page,'form-modal')
        ficha(page);section(page,'d-ai-section');expect(page.locator('#d-aicard')).to_be_disabled();expect(page.locator('#d-ai-availability')).to_have_text('Ayuda con IA no disponible');close(page,'detail-modal')
        assert page.evaluate('notificationCalls')==0 and page.evaluate('testWrites.length')==0
        assert not any('obsolete-test-marker' in s for s in logs),logs
        # Existing JSON saved by the old preview is displayed as readable advice, without migration writes.
        page.evaluate("testSnapshot({docs:[{data:()=>({...testPlants[0],lastAI:{date:'2026-01-01',text:JSON.stringify({nombreComun:'Poto',consejo:'Mira la tierra.'})}})}]})")
        ficha(page);section(page,'d-ai-section');page.locator('#d-lastai-btn').click();expect(page.locator('#ai-body')).to_contain_text('Mira la tierra.');assert '{' not in page.locator('#ai-body').inner_text();close(page,'ai-modal');close(page,'detail-modal')
        # Authentication and read errors remain safe; logout failure keeps this account's garden.
        page.evaluate("window.testSignOutError='auth/network-request-failed';import('./js/sync.js').then(m=>m.doSignOut())")
        expect(page.locator('#toast')).to_contain_text('No se pudo cerrar sesión');expect(page.locator('#grid .card')).to_have_count(1)
        page.evaluate("window.testSignOutError=null;testSnapshotError({code:'permission-denied'})")
        expect(page.locator('#sync-status')).to_contain_text('rechazó el permiso')
        page.evaluate("testSnapshotError({code:'unavailable'})");expect(page.locator('#sync-status')).to_contain_text('no está disponible')
        assert 'se enviarán' not in page.locator('#sync-status').inner_text()
        page.evaluate("import('./js/sync.js').then(m=>m.doSignOut())");expect(page.locator('#gate')).to_be_visible()
        page.evaluate("window.testSignInError='auth/unauthorized-domain'");page.get_by_role('button',name='Continuar con Google').click();expect(page.locator('#gate-error')).to_contain_text('dominio no está autorizado')
        page.evaluate("window.testSignInError=null");page.get_by_role('button',name='Continuar con Google').click();expect(page.locator('#gate')).to_be_hidden()
        assert not errors,errors
        print(f'PASS {width}x{height}: secret-only migration, no credential UI, unavailable AI, no notification request/send, legacy JSON, login/logout/read errors',flush=True)
        ctx.close()

        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
        ctx.route('https://**/*',helpers['route_external']);helpers['enable_test_ai'](ctx)
        ctx.add_init_script('window.testPlants='+json.dumps([plant])+';window.testWrites=[];')
        page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL);expect(page.locator('#grid .card')).to_have_count(1)
        if page.locator('#nickname-gate').is_visible():page.locator('#nickname-input').fill('Prueba');page.locator('#nickname-form button').click()
        page.locator('.fab').click();page.locator('#f-name').fill('Nombre personal')
        # Empty, invalid, quota, latency and unavailable results never alter a draft.
        for code,message in [('functions/resource-exhausted','límite'),('functions/deadline-exceeded','tardando'),('functions/permission-denied','esta cuenta'),('functions/unavailable','no disponible')]:
            page.evaluate('code=>window.testAIError=code',code);page.locator('#f-identify').click();expect(page.locator('#f-aistatus')).to_contain_text(message);expect(page.locator('#f-name')).to_have_value('Nombre personal')
        page.evaluate('window.testAIError=null;window.testAIResponse={}')
        page.locator('#f-identify').click();expect(page.locator('#f-aistatus')).to_contain_text('respuesta válida')
        page.evaluate('window.testAIResponse=null;window.testAIWait=true')
        page.locator('#f-identify').click();page.wait_for_function('typeof finishAI==="function"')
        page.locator('#f-name').fill('Nombre corregido durante la consulta');page.evaluate('window.testAIWait=false;finishAI()')
        expect(page.locator('#f-suggestions')).to_be_hidden();expect(page.locator('#f-name')).to_have_value('Nombre corregido durante la consulta');assert page.evaluate('testWrites.length')==0
        # The outer deadline covers SDK initialization and token/network waits too.
        page.clock.install();page.evaluate('window.testAIWait=true');page.locator('#f-identify').click();page.wait_for_function('typeof finishAI==="function"');page.clock.fast_forward(45001)
        expect(page.locator('#f-aistatus')).to_contain_text('tardando demasiado');expect(page.locator('#f-identify')).to_be_enabled();page.evaluate('window.testAIWait=false;finishAI()');assert page.evaluate('testWrites.length')==0;page.clock.resume()
        close(page,'form-modal')
        # Review is human-readable and has no automatic writes, including after close.
        ficha(page);section(page,'d-ai-section');page.locator('#d-aicard').click();expect(page.locator('#ai-save')).to_be_visible()
        assert '{' not in page.locator('#ai-body').inner_text();assert page.evaluate('testWrites.length')==0
        assert page.evaluate('testAIOptions.limitedUseAppCheckTokens') is True and page.evaluate('testAIOptions.timeout')==45000
        page.locator('#ai-apply').click();expect(page.locator('#f-freq')).to_have_value('7');page.locator('#use-revisarCadaDias').check();page.locator('#suggest-revisarCadaDias').fill('9');page.get_by_role('button',name='Usar los datos seleccionados').click()
        expect(page.locator('#f-freq')).to_have_value('9');assert page.evaluate('testPlants[0].waterFreq')==7;close(page,'form-modal');assert page.evaluate('testWrites.length')==0
        ficha(page);section(page,'d-ai-section');page.locator('#d-aicard').click();expect(page.locator('#ai-save')).to_be_visible();page.locator('#ai-save').click();page.wait_for_function('testWrites.length===1')
        assert page.evaluate('testWrites[0].plant.history')==plant['history'] and page.evaluate('testWrites[0].plant.gallery')==plant['gallery'];assert '{' not in page.evaluate('testWrites[0].plant.lastAI.text')
        close(page,'detail-modal');page.evaluate('window.testAIWait=true');ficha(page);section(page,'d-ai-section');page.locator('#d-aicard').click();page.wait_for_function('typeof finishAI==="function"');close(page,'ai-modal');page.evaluate('window.testAIWait=false;finishAI()');close(page,'detail-modal');assert page.evaluate('testWrites.length')==1
        # Photo advice requires an explicit save; decoding errors/cancel preserve data.
        ficha(page);section(page,'d-ai-section')
        page.locator('#d-aiphoto').click()
        with page.expect_file_chooser() as event:page.get_by_role('button',name='Elegir foto',exact=True).click()
        event.value.set_files([]);assert page.evaluate('testWrites.length')==1
        page.locator('#camera-file').set_input_files(dict(name='broken.jpg',mimeType='image/jpeg',buffer=b'invalid'));expect(page.locator('#camera-status')).to_contain_text('No se pudo leer la foto')
        page.locator('#camera-file').set_input_files(str(ROOT/'Plantometro/preview-assets/ficus.jpg'));expect(page.locator('#camera-image')).to_be_visible();page.get_by_role('button',name='Analizar esta foto').click();expect(page.locator('#ai-save')).to_have_text('Guardar foto y consejo');assert page.evaluate('testWrites.length')==1
        page.locator('#ai-save').click();page.wait_for_function('testWrites.length===2');assert len(page.evaluate('testPlants[0].gallery'))==2
        section(page,'d-photo-section');page.locator('#d-gal [data-g="0"]').click();page.evaluate("window.testWriteError='permission-denied'");page.locator('#pm-del').click();expect(page.locator('#sync-status')).to_contain_text('rechazó el permiso');expect(page.locator('#photo-modal')).to_be_visible();assert len(page.evaluate('testPlants[0].gallery'))==2
        page.evaluate('window.testWriteError=null');page.locator('#pm-del').click();expect(page.locator('#photo-modal')).to_be_hidden();assert len(page.evaluate('testPlants[0].gallery'))==1
        close(page,'detail-modal')
        # A rejected riego rolls back; an unavailable correction keeps exact history.
        before=page.evaluate('JSON.stringify(testPlants[0])');page.evaluate("window.testWriteError='permission-denied'");page.locator('[data-water=existing]').click();expect(page.locator('#sync-status')).to_contain_text('rechazó el permiso');assert page.evaluate('JSON.stringify(testPlants[0])')==before
        page.evaluate('window.testWriteError=null');page.locator('[data-water=existing]').click();page.wait_for_function('testPlants[0].history[0].eventId!==undefined');history=page.evaluate('JSON.stringify(testPlants[0].history)')
        page.evaluate("window.testWriteError='unavailable';import('./js/plants.js').then(m=>m.correctWater('existing',testPlants[0].history[0].eventId))");expect(page.locator('#sync-status')).to_contain_text('no está disponible');assert page.evaluate('JSON.stringify(testPlants[0].history)')==history;page.evaluate('window.testWriteError=null')
        # Cancel copy, malformed JSON, oversized file, and delete cancellation/success.
        copied={**plant,'id':'copied','updatedAt':'2026-10-02T12:00:00Z'}
        page.once('dialog',lambda d:d.dismiss());page.locator('#backup-file').set_input_files(dict(name='copy.json',mimeType='application/json',buffer=json.dumps([copied]).encode()));expect(page.locator('#grid .card')).to_have_count(1)
        page.locator('#backup-file').set_input_files(dict(name='bad.json',mimeType='application/json',buffer=b'{bad'));expect(page.locator('#toast')).to_contain_text('No se restauró ninguna ficha')
        page.evaluate("import('./js/plants.js').then(m=>m.importData({target:{value:'',files:[{size:11*1024*1024}]}}))");expect(page.locator('#toast')).to_contain_text('supera 10 MB')
        # Weather invalid body/error, no city match and denied GPS never change watering.
        dates=page.evaluate('testPlants.map(p=>p.lastWater)');ctx.route('**/api.open-meteo.com/**',lambda r:r.fulfill(json={'current':{'temperature_2m':'invalid'}}));settings(page);page.get_by_role('button',name='Clima de tu zona').click();page.clock.install();page.clock.fast_forward(11000);page.locator('.wrefresh').click();expect(page.locator('#w-updated')).to_contain_text('Lectura antigua');page.clock.resume();assert 'NaN' not in page.locator('#weather-modal').inner_text();close(page,'weather-modal')
        ctx.route('**/geocoding-api.open-meteo.com/**',lambda r:r.fulfill(json={'results':[]}));settings(page);page.locator('#s-city').fill('Nada');page.get_by_role('button',name='Buscar ciudad',exact=True).click();expect(page.locator('#georesults')).to_contain_text('Sin resultados')
        page.evaluate("Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok,error)=>error({code:1})},configurable:true})");page.get_by_title('Usar mi ubicación').click();expect(page.locator('#toast')).to_contain_text('No se pudo obtener');close(page,'settings-modal');assert page.evaluate('testPlants.map(p=>p.lastWater)')==dates
        # Modal bounds and touch actions in the smaller space left by a keyboard.
        page.locator('.fab').click();page.locator('#f-name').fill('Nombre largo '*6);page.set_viewport_size({'width':width,'height':390});page.locator('#plant-form').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
        b=page.locator('#plant-form').bounding_box();assert b['y']>=0 and b['y']+b['height']<=391
        for selector in ['#f-photo-button','#f-identify','#f-save','#form-modal .xbtn']:assert page.locator(selector).bounding_box()['height']>=44
        expect(page.locator('.fab')).to_be_hidden();close(page,'form-modal');page.set_viewport_size({'width':width,'height':height})
        ficha(page);section(page,'d-manage-section');page.once('dialog',lambda d:d.dismiss());page.locator('#d-del').click();expect(page.locator('#grid .card')).to_have_count(1)
        page.once('dialog',lambda d:d.accept());page.locator('#d-del').click();expect(page.locator('#grid .card')).to_have_count(0);assert page.evaluate('testDeletes.length')==1
        assert not errors,errors
        print(f'PASS {width}x{height}: AI errors/late results, readable review, explicit save/field correction, photo/cancel/error, gallery delete rollback, riego/correction error, copy cancel/invalid/size, weather/GPS errors, keyboard/touch and delete cancel/success',flush=True)
        ctx.close()
    browser.close()
server.shutdown()
