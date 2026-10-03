"""Actual browser Firebase SDKs against local Auth/Firestore; Google OAuth is not tested.
Invoked by emulators.test.mjs with disposable custom tokens on stdin, never logs tokens.
"""
import functools,http.server,json,re,sys,threading,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
tokens=json.load(sys.stdin)
sync=(ROOT/'js/sync.js').read_text()
sync=re.sub(r'const fbConfig = \{[\s\S]*?\};',"const fbConfig={apiKey:'local-emulator-only',projectId:'demo-plantometro',authDomain:'localhost',appId:'1:123456:web:local-test'};",sync,count=1)
sync=sync.replace('onAuthStateChanged, signOut }','onAuthStateChanged, signOut, connectAuthEmulator, signInWithCustomToken }')
sync=sync.replace('writeBatch, runTransaction }','writeBatch, runTransaction, connectFirestoreEmulator }')
sync=sync.replace('auth = getAuth(app);',"auth = getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});")
sync=sync.replace('  getRedirectResult(auth)',"  connectFirestoreEmulator(fs,'127.0.0.1',8080);\n  signInWithCustomToken(auth,window.localTestToken).catch(()=>{});\n  getRedirectResult(auth)")
assert 'connectAuthEmulator' in sync and 'demo-plantometro' in sync
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[];forbidden=[]
    def context(token,width,height):
        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
        ctx.add_init_script('window.localTestToken='+json.dumps(token)+';')
        ctx.route('**/js/sync.js',lambda r:r.fulfill(body=sync,content_type='application/javascript'))
        ctx.route('https://api.open-meteo.com/**',lambda r:r.fulfill(json={'current':{'temperature_2m':24,'relative_humidity_2m':55,'weather_code':2},'daily':{'precipitation_probability_max':[0,0],'precipitation_sum':[0,0]}}))
        # Fail closed if SDK configuration accidentally points at a production service.
        for host in ['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com']:
            def reject(r,host=host):forbidden.append(host);r.abort()
            ctx.route('https://'+host+'/**',reject)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL,wait_until='domcontentloaded')
        expect(page.locator('#gate')).to_be_hidden(timeout=45000)
        expect(page.locator('#nickname-gate')).to_be_visible()
        page.locator('#nickname-input').fill('Rosita' if width==768 else 'Frank' if token==tokens['owner'] else 'Otra persona')
        page.locator('#nickname-form button').click()
        assert page.evaluate("import('./js/sync.js').then(m=>m.auth.app.options.projectId)")=='demo-plantometro'
        page.evaluate("import('./js/sync.js').then(m=>window.localSync=m)")
        return ctx,page
    if not os.environ.get('PLANTOMETRO_AI_TRANSPORT_ONLY'):
        ac,a=context(tokens['owner'],390,844);bc,b=context(tokens['owner'],768,1024);cc,c=context(tokens['other'],390,844)
        expect(a.locator('#grid .card')).to_have_count(1);expect(b.locator('#grid .card')).to_have_count(1);expect(c.locator('#grid .card')).to_have_count(0)
        a.locator('.fab').click();a.locator('#f-name').fill('Nueva real de prueba');a.locator('#f-photo').set_input_files(str(ROOT/'preview-assets/plant.jpg'));expect(a.locator('#f-prev img')).to_be_visible();a.locator('#f-save').click()
        expect(a.locator('#sync-status')).to_contain_text('confirmados en la nube',timeout=30000);expect(b.locator('#grid .card')).to_have_count(2,timeout=30000)
        created=a.locator('.card').filter(has_text='Nueva real de prueba').get_attribute('data-plant')
        assert a.evaluate("import('./js/sync.js').then(m=>m.plants.find(p=>p.id==='keep').futureField)")=='preserved'
        a.locator('[data-open="'+created+'"]').click();a.locator('#d-manage-section > summary').click();a.locator('#d-edit').click();a.locator('#f-name').fill('Editada en móvil');a.locator('#f-save').click()
        expect(b.locator('[data-plant="'+created+'"] .name')).to_have_text('Editada en móvil',timeout=30000)
        a.locator('[data-water="'+created+'"]').click();expect(a.locator('#sync-status')).to_contain_text('confirmados en la nube',timeout=30000)
        expect(a.locator('#toast button')).to_be_visible();a.locator('#toast button').click()
        a.wait_for_function("()=>localSync.plants.find(p=>p.id==="+json.dumps(created)+").history.length===0",timeout=30000)
        b.wait_for_function("()=>localSync.plants.find(p=>p.id==="+json.dumps(created)+").lastWater===''",timeout=30000)
        # Offline SDK writes are queued, then confirmed and visible on the other device.
        ac.set_offline(True);a.locator('[data-water="'+created+'"]').click();expect(a.locator('#sync-status')).to_contain_text('pendientes en este dispositivo')
        ac.set_offline(False);expect(a.locator('#sync-status')).to_contain_text('confirmados en la nube',timeout=45000)
        b.wait_for_function("()=>localSync.plants.find(p=>p.id==="+json.dumps(created)+").history.length===1",timeout=30000)
        # Export/restore across real local service preserves photographs and all fields.
        a.locator('#settings-btn').click();a.locator('#acc-btn').click()
        with a.expect_download() as download:a.get_by_role('button',name='Descargar copia de seguridad').click()
        backup=json.loads(Path(download.value.path()).read_text());assert len(backup['plants'])==2
        fresh=next(p for p in backup['plants'] if p['id']==created);assert fresh['photo'].startswith('data:image/jpeg') and len(fresh['history'])==1
        copy={**fresh,'id':'restored-emulator','name':'Restaurada de prueba'}
        a.once('dialog',lambda d:d.accept());a.locator('#backup-file').set_input_files({'name':'copy.json','mimeType':'application/json','buffer':json.dumps([copy]).encode()})
        expect(b.locator('#grid .card')).to_have_count(3,timeout=30000)
        a.locator('[data-open="'+created+'"]').click();a.locator('#d-manage-section > summary').click();a.once('dialog',lambda d:d.dismiss());a.locator('#d-del').click();expect(b.locator('#grid .card')).to_have_count(3)
        a.once('dialog',lambda d:d.accept());a.locator('#d-del').click();expect(b.locator('#grid .card')).to_have_count(2,timeout=30000)
        # Logout removes the device's account-specific cache; a separate account remains empty.
        a.locator('#settings-btn').click();a.locator('#acc-btn').click();a.get_by_role('button',name='Cerrar sesión').click();expect(a.locator('#gate')).to_be_visible()
        assert a.evaluate("localStorage.getItem('pg3_cache_browser-owner')") is None
        expect(c.locator('#grid .card')).to_have_count(0)
        assert not forbidden,'A request tried to use a production Firebase service';assert not errors,'Browser JavaScript errors: '+str(len(errors))
        print('PASS actual browser SDK + local Auth/Firestore: mobile/tablet sign-in, isolated accounts, live sync, add/photo/edit, riego/undo, offline queue/reconnect, export/restore, delete cancel/success and logout',flush=True)
    # Real Firebase 12.10 SDK + local authenticated session. AI HTTP response and
    # App Check boundary are adapters: no actual Gemini or attestation is claimed.
    ai_ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    ai_ctx.add_init_script('window.localTestToken='+json.dumps(tokens['owner'])+';')
    ai_ctx.route('**/js/sync.js',lambda r:r.fulfill(body=sync,content_type='application/javascript'))
    ai_service=(ROOT/'js/ai-service.js').read_text().replace('throw {code};', 'window.testAIErrorCode={code,originalCode:error?.code,name:error?.name};throw {code};')
    ai_ctx.route('**/js/ai-service.js',lambda r:r.fulfill(body=ai_service,content_type='application/javascript'))
    ai_ctx.route('**/js/ai-config.js',lambda r:r.fulfill(body="export const aiConfig={enabled:true,provider:'firebase-ai',appCheckSiteKey:'public-adapter-only'}",content_type='application/javascript'))
    ai_ctx.route('**/firebase-app-check.js',lambda r:r.fulfill(body="export class ReCaptchaEnterpriseProvider{};export const initializeAppCheck=()=>({});",content_type='application/javascript'))
    requests=[];ai_mode={"status":200,"invalid":False}
    response={'resumen':'Modelo de prueba HTTP, no Gemini.','consejo':'Comprueba la tierra.','confianza':'baja','motivo':'Sin identificación real.','sugerencias':{'nombreComun':None,'especie':None,'ubicacion':None,'revisarCadaDias':8,'abonoCadaDias':None,'luz':None}}
    def ai_response(route):
        req=route.request
        if req.method=='OPTIONS':route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'});return
        assert req.headers.get('authorization','').startswith('Firebase '),'Official AI SDK must send Firebase ID token'
        payload=req.post_data_json;requests.append(payload)
        if ai_mode['status']!=200:route.fulfill(status=ai_mode['status'],json={'error':{'code':ai_mode['status'],'message':'Controlled provider failure'}},headers={'Access-Control-Allow-Origin':'*'});return
        route.fulfill(json={'candidates':[{'content':{'parts':[{'text':'invalid response' if ai_mode['invalid'] else json.dumps(response)}]},'finishReason':'STOP'}]},headers={'Access-Control-Allow-Origin':'*'})
    ai_ctx.route('https://firebasevertexai.googleapis.com/**',ai_response)
    for host in ['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com']:
        ai_ctx.route('https://'+host+'/**',lambda r:r.abort())
    ai_page=ai_ctx.new_page();ai_page.on('pageerror',lambda e:errors.append(str(e)));ai_page.goto(URL)
    expect(ai_page.locator('#gate')).to_be_hidden(timeout=45000)
    ai_page.locator('#nickname-input').fill('AI Test');ai_page.locator('#nickname-form button').click()
    ai_page.locator('.fab').click();ai_page.locator('#f-name').fill('Poto de prueba');ai_page.locator('#f-identify').click()
    try:expect(ai_page.locator('#f-suggestions')).to_be_visible(timeout=45000)
    except Exception:raise AssertionError({'code':ai_page.evaluate('window.testAIErrorCode'),'jsErrors':errors,'requestCount':len(requests)})
    expect(ai_page.locator('#f-name')).to_have_value('Poto de prueba')
    assert len(requests)==1 and 'Poto de prueba' in requests[0]['contents'][0]['parts'][0]['text']
    ai_page.get_by_role('button',name='Descartar sugerencias').click()
    ai_mode['status']=429;ai_page.locator('#f-identify').click();expect(ai_page.locator('#f-aistatus')).to_contain_text('límite');expect(ai_page.locator('#f-name')).to_have_value('Poto de prueba')
    ai_mode['status']=200;ai_mode['invalid']=True;ai_page.locator('#f-identify').click();expect(ai_page.locator('#f-aistatus')).to_contain_text('respuesta válida');expect(ai_page.locator('#f-name')).to_have_value('Poto de prueba')
    ai_ctx.set_offline(True);ai_page.locator('#f-identify').click();expect(ai_page.locator('#f-aistatus')).to_contain_text('No hay conexión');assert len(requests)==3
    assert not errors,errors
    print('PASS official Firebase AI Logic 12.10 SDK transport + real local Auth: Firebase ID token, prompt, structured response and explicit suggestions; Gemini/App Check adapted',flush=True)
    ai_ctx.close()
    if not os.environ.get('PLANTOMETRO_AI_TRANSPORT_ONLY'):ac.close();bc.close();cc.close()
    browser.close()
server.shutdown()
