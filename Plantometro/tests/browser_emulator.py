"""Actual browser Firebase SDKs against local Auth/Firestore; Google OAuth is not tested.
Invoked by emulators.test.mjs with disposable custom tokens on stdin, never logs tokens.
"""
import functools,http.server,json,re,sys,threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
tokens=json.load(sys.stdin)
sync=(ROOT/'js/sync.js').read_text()
sync=re.sub(r'const fbConfig = \{[\s\S]*?\};',"const fbConfig={apiKey:'local-emulator-only',projectId:'demo-plantometro',authDomain:'localhost'};",sync,count=1)
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
        assert page.evaluate("import('./js/sync.js').then(m=>m.auth.app.options.projectId)")=='demo-plantometro'
        return ctx,page
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
    a.wait_for_function("import('./js/sync.js').then(m=>m.plants.find(p=>p.id==="+json.dumps(created)+").history.length===0)",timeout=30000)
    b.wait_for_function("import('./js/sync.js').then(m=>m.plants.find(p=>p.id==="+json.dumps(created)+").lastWater==='')",timeout=30000)
    # Offline SDK writes are queued, then confirmed and visible on the other device.
    ac.set_offline(True);a.locator('[data-water="'+created+'"]').click();expect(a.locator('#sync-status')).to_contain_text('pendientes en este dispositivo')
    ac.set_offline(False);expect(a.locator('#sync-status')).to_contain_text('confirmados en la nube',timeout=45000)
    b.wait_for_function("import('./js/sync.js').then(m=>m.plants.find(p=>p.id==="+json.dumps(created)+").history.length===1)",timeout=30000)
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
    ac.close();bc.close();cc.close();browser.close()
server.shutdown()
