"""Browser regression tests with synthetic plants and mocked Google services.

Run: python Plantometro/tests/ui_smoke.py
Requires Python Playwright and Chromium (CHROMIUM_PATH can override the binary).
No production account, stored garden, or real Gemini key is used.
"""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get("PLANTOMETRO_TEST_OUTPUT", "/tmp/plantometro-tests"))
OUT.mkdir(parents=True, exist_ok=True)

APP = "export const initializeApp = config => config;"
AUTH = """
export const getAuth = () => ({currentUser:{uid:'test-user'}});
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {if(window.testSignInError)throw {code:window.testSignInError};window.testAuthCallback({uid:"test-user",displayName:"Prueba"});};
export const signInWithRedirect = async () => {if(window.testSignInError)throw {code:window.testSignInError};};
export const getRedirectResult = async () => {if(window.testRedirectError)throw {code:window.testRedirectError};return null;};
export const signOut = async () => {if(window.testSignOutError)throw {code:window.testSignOutError};window.testAuthCallback(null);};
export const onAuthStateChanged = (auth, cb) => {window.testAuthCallback=cb;queueMicrotask(()=>cb({uid:'test-user',displayName:'Prueba',email:'test@example.invalid'}));};
"""
FIRESTORE = """
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const collection = (...args) => args;
export const doc = (...args) => args;
export const onSnapshot = (ref, cb, error) => {
 window.testSnapshotError=error;window.testSnapshot=cb;
 queueMicrotask(()=>cb({docs:window.testPlants.map(p=>({data:()=>p}))}));
 return ()=>{};
};
export const setDoc = async (ref, p) => {
 if(window.testWriteError)throw {code:window.testWriteError};
 window.testWrites.push(JSON.parse(JSON.stringify({ref:ref.slice(1),plant:p})));
 const i=window.testPlants.findIndex(x=>x.id===p.id);if(i>=0)window.testPlants[i]=JSON.parse(JSON.stringify(p));else window.testPlants.push(JSON.parse(JSON.stringify(p)));
};
export const deleteDoc = async ref => {if(window.testWriteError)throw {code:window.testWriteError};(window.testDeletes||=[]).push(ref);window.testPlants=window.testPlants.filter(p=>p.id!==ref.at(-1));};
export const writeBatch = () => {const changes=[];return {set:(r,p)=>changes.push([r,p]),commit:async()=>{if(window.testWriteError)throw {code:window.testWriteError};for(const [r,p] of changes)await setDoc(r,p);}};};
export const runTransaction = async (db,cb) => {if(window.testWriteError)throw {code:window.testWriteError};const pending=[];await cb({get:async ref=>{const p=window.testPlants.find(p=>p.id===ref.at(-1));return {exists:()=>!!p,data:()=>JSON.parse(JSON.stringify(p))};},set:(r,p)=>pending.push([r,p])});for(const [r,p] of pending)await setDoc(r,p);};

"""
AI_RESPONSE = dict(resumen='Una planta que observar.',consejo='Comprueba la tierra antes de decidir.',confianza='baja',motivo='Foto o nombre insuficientes para confirmar.',sugerencias=dict(nombreComun='Monstera',especie='Monstera deliciosa',revisarCadaDias=5,abonoCadaDias=None,luz='media'))
APP_CHECK = 'export class ReCaptchaEnterpriseProvider {}; export const initializeAppCheck = () => ({});'
FUNCTIONS = """export const getFunctions=()=>({});
export const httpsCallable=(f,name,options)=>async data=>{
 window.testAIOptions=options;window.testAIRequest=data;window.testAICalls=(window.testAICalls||0)+1;
 if(window.testAIWait)await new Promise(r=>window.finishAI=r);
 if(window.testAIError)throw {code:window.testAIError,message:'Details must never be shown'};
 return {data:window.testAIResponse||RESPONSE};
};""".replace('RESPONSE',json.dumps(AI_RESPONSE))

def enable_test_ai(context):
    context.route('**/js/ai-config.js',lambda r:r.fulfill(body="export const aiConfig={enabled:true,region:'europe-west1',functionName:'plantometroAI',appCheckSiteKey:'public-test-only'};",content_type='application/javascript'))

PLANT = dict(id="existing", name="Monstera del salón con un nombre muy largo "*3,
             species="Monstera deliciosa", loc="Terraza", light="media", waterFreq=7,
             lastWater="2020-01-01", fertFreq=0, gallery=[dict(date="2020-01-01", img="", note="Foto antigua")],
             history=[dict(t="agua",date="2020-01-01",by="Pareja") for _ in range(65)],
             createdAt="2020-01-01T12:00:00Z", futureField="keep-me", desc="Una nota larga "*25)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

handler = functools.partial(QuietHandler, directory=str(ROOT))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_port}/Plantometro/"

def route_external(route):
    url = route.request.url
    if "firebase-app.js" in url:
        route.fulfill(body=APP, content_type="application/javascript")
    elif "firebase-auth.js" in url:
        route.fulfill(body=AUTH, content_type="application/javascript")
    elif "firebase-firestore.js" in url:
        route.fulfill(body=FIRESTORE, content_type="application/javascript")
    elif 'firebase-app-check.js' in url:
        route.fulfill(body=APP_CHECK,content_type='application/javascript')
    elif 'firebase-functions.js' in url:
        route.fulfill(body=FUNCTIONS,content_type='application/javascript')
    elif "bigdatacloud.net" in url:
        route.fulfill(json={"city":"Ciudad GPS"})
    elif "geocoding-api.open-meteo.com" in url:
        route.fulfill(json={"results":[{"name":"Granada","latitude":37.17,"longitude":-3.59,"country":"España"}]})
    elif "api.open-meteo.com" in url:
        route.fulfill(json=dict(current=dict(temperature_2m=34,relative_humidity_2m=35,weather_code=61),
                               daily=dict(precipitation_probability_max=[80,70],precipitation_sum=[4,2])))
    else:
        route.fulfill(body="",content_type="text/css" if "fonts.googleapis" in url else "text/plain")

def open_section(page, section):
    if not page.locator('#'+section).evaluate('e=>e.open'):
        page.locator('#'+section+' > summary').click()

def open_settings(page):
    page.locator('#settings-btn').click()

def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth > innerWidth")

def check_contrast(page):
    pairs = page.evaluate("""() => {
      const s=getComputedStyle(document.documentElement), names=['--ink','--ink2','--green','--grana','--amber','--blue','--care'];
      return [...['--bg','--surface','--surface2'].flatMap(bg=>names.map(fg=>[fg,bg,s.getPropertyValue(fg).trim(),s.getPropertyValue(bg).trim()])), ['--add-ink','--add-bg',s.getPropertyValue('--add-ink').trim(),s.getPropertyValue('--add-bg').trim()]];
    }""")
    def luminance(h):
        v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
        v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
        return sum(a*b for a,b in zip(v,[.2126,.7152,.0722]))
    for fg,bg,a,b in pairs:
        x,y=sorted([luminance(a),luminance(b)])
        assert (y+.05)/(x+.05)>=4.5, (fg,bg,a,b)

def clear_dock(page):
    # The scroll viewport physically ends above the dock, at every scroll offset.
    # Check painted (clipped) card areas, not off-screen document rectangles.
    result=page.evaluate("""() => {
      const pane=document.querySelector('.wrap'),dock=document.querySelector('.add-dock'),fab=document.querySelector('.fab');
      const p=pane.getBoundingClientRect(),d=dock.getBoundingClientRect(),b=fab.getBoundingClientRect();
      const intersects=(a,c)=>a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top;
      const collisions=[...document.querySelectorAll('.card-photo,.card .name,.card .next,.waterbtn')].filter(el=>{
        const r=el.getBoundingClientRect(),visible={left:Math.max(r.left,p.left),right:Math.min(r.right,p.right),top:Math.max(r.top,p.top),bottom:Math.min(r.bottom,p.bottom)};
        return visible.left<visible.right&&visible.top<visible.bottom&&intersects(visible,b);
      }).map(el=>el.className);
      return {paneBottom:p.bottom,dockTop:d.top,scrollWidth:pane.scrollWidth,clientWidth:pane.clientWidth,buttonBottom:b.bottom,buttonTop:b.top,dockBottom:d.bottom,height:visualViewport.height,collisions,hit:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)?.closest('.fab')===fab};
    }""")
    assert result['paneBottom']<=result['dockTop']+.5,result
    assert result['scrollWidth']<=result['clientWidth']+1,result
    assert result['buttonTop']>=result['dockTop'] and result['buttonBottom']<=result['dockBottom'],result
    assert result['buttonBottom']<=result['height']+1 and result['hit'] and not result['collisions'],result

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),args=["--no-sandbox"])
    for width,height in [(320,740),(390,844),(768,1024),(820,1180)]:
        context=browser.new_context(viewport=dict(width=width,height=height),service_workers="block")
        context.route("https://**/*",route_external)
        enable_test_ai(context)
        context.add_init_script("window.testPlants="+json.dumps([PLANT])+";window.testWrites=[];localStorage.setItem('pg3b_settings',JSON.stringify({name:'Fran',geminiKey:'test-placeholder',summerMode:true}));")
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(URL)
        expect(page.locator("#grid .card")).to_have_count(1)
        expect(page.locator("#gate")).to_be_hidden()
        expect(page.locator("h1.brand")).to_have_text("Plantómetro")
        expect(page.locator("#grid .next")).to_contain_text("Recordatorio del")
        assert not overflow(page)
        for theme in ["light","dark"]:
            page.evaluate(f"import('./js/settings.js').then(m=>m.setTheme('{theme}'))")
            check_contrast(page)
            page.screenshot(path=str(OUT/f"home-{width}-{theme}.png"),full_page=True)
        page.locator("#grid [data-open]").first.click()
        open_section(page,"d-care-section")
        expect(page.locator("#d-rain")).to_contain_text("Exterior")
        expect(page.locator("#d-rain")).to_contain_text("Lluvia prevista")
        expect(page.locator("#d-freq")).to_contain_text("Cada 7 días")
        assert page.locator("#d-water").is_visible()
        page.locator("#d-water").click()
        saved=page.evaluate("testWrites.at(-1).plant")
        assert len(saved["history"])==66 and saved["history"][0]["by"]=="Fran"
        assert saved["history"][1:]==PLANT["history"] and saved["gallery"]==PLANT["gallery"]
        assert saved["futureField"]=="keep-me" and saved["waterFreq"]==7
        page.locator("#toast button").click()
        page.wait_for_function("testWrites.at(-1).plant.history.length === 65")
        assert page.evaluate("testWrites.at(-1).plant.history.length")==65
        open_section(page,"d-manage-section")
        page.locator("#d-edit").click()
        expect(page.locator("#f-details")).to_have_attribute("open", "")
        page.locator("#f-name").fill("Mi planta editada")
        page.locator("#f-loc").fill("Salón")
        page.locator("#f-save").click()
        saved=page.evaluate("testWrites.at(-1).plant")
        assert saved["history"]==PLANT["history"] and saved["gallery"]==PLANT["gallery"] and saved["futureField"]=="keep-me"
        page.locator("#grid [data-open]").first.click()
        expect(page.locator("#d-rain")).to_be_hidden()
        page.locator("#detail-modal .xbtn").click()
        page.locator(".fab").click()
        assert not page.locator("#f-details").evaluate("e=>e.open")
        page.locator("#f-name").fill("Monstera personalizada")
        page.locator("#f-identify").click()
        expect(page.locator("#f-suggestions")).to_be_visible()
        expect(page.locator("#f-suggestions")).to_contain_text("Identificación dudosa")
        expect(page.locator("#f-name")).to_have_value("Monstera personalizada")
        expect(page.locator("#f-freq")).to_have_value("7")
        assert not overflow(page)
        page.screenshot(path=str(OUT/f"suggestions-{width}.png"),full_page=True)
        page.get_by_role("button",name="Descartar sugerencias").click()
        expect(page.locator("#f-name")).to_have_value("Monstera personalizada")
        page.locator("#f-identify").click()
        expect(page.locator("#f-suggestions")).to_be_visible()
        page.locator("#use-especie").check()
        page.locator("#use-revisarCadaDias").check()
        page.locator("#suggest-revisarCadaDias").fill("9")
        page.get_by_role("button",name="Usar los datos seleccionados").click()
        expect(page.locator("#f-freq")).to_have_value("9")
        expect(page.locator("#f-species")).to_have_value("Monstera deliciosa")
        expect(page.locator("#f-name")).to_have_value("Monstera personalizada")
        # Name-only identification, photo-only identification and photo compression.
        photo=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=")
        page.locator("#f-photo").set_input_files(dict(name="plant.png",mimeType="image/png",buffer=photo))
        expect(page.locator("#f-prev img")).to_be_visible()
        page.locator("#f-name").fill("")
        page.locator("#f-identify").click()
        expect(page.locator("#f-suggestions")).to_be_visible()
        page.locator("#use-nombreComun").check()
        page.get_by_role("button",name="Usar los datos seleccionados").click()
        page.locator("#f-save").click()
        expect(page.locator("#grid .card")).to_have_count(2)
        saved=page.evaluate("testWrites.at(-1).plant")
        assert saved["lastWater"]=="" and saved["history"]==[] and saved["photo"].startswith("data:image/jpeg")
        assert saved["waterFreq"]==9
        open_settings(page)
        page.get_by_role("button",name="Clima de tu zona").click()
        expect(page.locator("#weather-modal")).to_be_visible()
        expect(page.locator("#w-tip")).to_contain_text("Lluvia prevista")
        page.locator(".wrefresh").click()
        page.locator("#weather-modal .xbtn").click()
        open_settings(page)
        page.locator("#s-city").fill("Granada")
        page.get_by_title("Buscar",exact=True).click()
        expect(page.locator("#georesults button")).to_have_count(1)
        page.locator("#georesults button").click()
        page.locator("#settings-modal .xbtn").click()
        assert not errors, errors
        print(f"PASS {width}x{height}: open, edit, history, undo, name/photo suggestions, discard, correction, add, weather, contrast")
        context.close()
    # Form polish in touch/mobile Chromium. Native Android's OS picker still needs
    # a device check: Playwright opens a browser file chooser and simulates cancellation.
    for width,height in [(320,740),(768,1024)]:
        ua="Mozilla/5.0 (Linux; Android 13; " + ("Pixel 5" if width<660 else "Tablet") + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 " + ("Mobile " if width<660 else "") + "Safari/537.36"
        context=browser.new_context(viewport=dict(width=width,height=height),has_touch=True,is_mobile=True,user_agent=ua,service_workers="block")
        context.route("https://**/*",route_external)
        enable_test_ai(context)
        original_photo='data:image/jpeg;base64,'+base64.b64encode((ROOT/'Plantometro/preview-assets/plant.jpg').read_bytes()).decode()
        original={**PLANT,"name":"Mi planta","photo":original_photo}
        context.add_init_script("window.testPlants="+json.dumps([original])+";window.testWrites=[];")
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
        # New plant: no native English file input, a tactile button and clear reminder.
        page.locator('.fab').tap()
        expect(page.locator('#f-photo')).to_be_hidden()
        expect(page.locator('#f-photo-button')).to_have_text('Añadir foto')
        expect(page.locator('#f-prev img')).to_have_count(0)
        expect(page.locator('#f-freq-label')).to_have_text('Recordarme cada')
        expect(page.locator('#f-freq-note')).to_have_text('Comprueba la tierra antes de regar')
        assert page.locator('#f-photo-button').bounding_box()['height']>=44
        assert 'Choose File' not in page.locator('#plant-form').inner_text()
        page.locator('#f-freq').fill('1');expect(page.locator('#f-freq-unit')).to_have_text('día')
        page.locator('#f-freq').fill('7');expect(page.locator('#f-freq-unit')).to_have_text('días')
        page.locator('#f-name').fill('La nueva')
        with page.expect_file_chooser() as event:
            page.locator('#f-photo-button').tap()
        event.value.set_files(str(ROOT/'Plantometro/preview-assets/ficus.jpg'))
        expect(page.locator('#f-prev img')).to_be_visible()
        expect(page.locator('#f-photo-button')).to_have_text('Cambiar foto')
        new_preview=page.locator('#f-prev img').get_attribute('src')
        assert new_preview.startswith('data:image/jpeg') and page.evaluate('testWrites.length')==0
        # Cancel choosing a replacement; preview and draft remain untouched.
        with page.expect_file_chooser() as event:
            page.locator('#f-photo-button').tap()
        event.value.set_files([])
        page.locator('#f-photo').dispatch_event('cancel')
        assert page.locator('#f-prev img').get_attribute('src')==new_preview
        expect(page.locator('#f-name')).to_have_value('La nueva')
        expect(page.locator('#f-photo-button')).to_have_text('Cambiar foto')
        assert not overflow(page)
        for theme in ['light','dark']:
            page.evaluate(f"import('./js/settings.js').then(m=>m.setTheme('{theme}'))")
            check_contrast(page)
            page.screenshot(path=str(OUT/f'form-photo-{width}-{theme}.png'))
        page.locator('#f-save').tap()
        expect(page.locator('#grid .card')).to_have_count(2)
        assert page.evaluate('testWrites.at(-1).plant.photo')==new_preview
        assert page.evaluate('testWrites.at(-1).plant.history')==[]
        # Edit: the original full photo, history and diary survive cancelling and saving.
        page.locator('[data-open=existing]').tap();open_section(page,'d-manage-section');page.locator('#d-edit').tap()
        expect(page.locator('#f-photo-button')).to_have_text('Cambiar foto')
        assert page.locator('#f-prev img').get_attribute('src')==original_photo
        before=page.evaluate('testWrites.length')
        with page.expect_file_chooser() as event:
            page.locator('#f-photo-button').tap()
        event.value.set_files([]);page.locator('#f-photo').dispatch_event('cancel')
        assert page.locator('#f-prev img').get_attribute('src')==original_photo
        assert page.evaluate('testWrites.length')==before
        # A decoding failure also leaves the previous photograph intact.
        page.locator('#f-photo').set_input_files(dict(name='broken.jpg',mimeType='image/jpeg',buffer=b'not an image'))
        expect(page.locator('#toast')).to_contain_text('No se pudo leer la foto')
        assert page.locator('#f-prev img').get_attribute('src')==original_photo
        page.locator('#f-save').tap()
        page.wait_for_function('testWrites.length===2')
        saved=page.evaluate('testWrites.at(-1).plant')
        assert saved['photo']==original_photo and saved['history']==original['history'] and saved['gallery']==original['gallery']
        assert saved['futureField']=='keep-me'
        assert not errors,errors
        print(f'PASS photo form {width}x{height} Android/touch emulation: add/change button, real chooser event, photo preview, simulated cancel, failed decoding, untouched previous photo/history, reminder singular/plural')
        context.close()
    # Regression scenarios on real DOM, with explicit service failure and account changes.
    for width,height in [(390,844),(768,1024)]:
        context=browser.new_context(viewport=dict(width=width,height=height),service_workers="block")
        context.route("https://**/*",route_external)
        enable_test_ai(context)
        context.add_init_script("window.testPlants="+json.dumps([{**PLANT,"name":"Bob","gallery":[]}])+";window.testWrites=[];")
        page=context.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)));page.goto(URL)
        expect(page.locator("#grid .card")).to_have_count(1)
        expect(page.locator("#garden-summary")).to_have_text("Hoy toca cuidar una planta.")
        expect(page.locator("#search-panel")).to_be_hidden()
        open_settings(page)
        page.get_by_role("button",name="Buscar una planta",exact=True).click()
        page.locator("#q").fill("No existe")
        expect(page.locator("#grid .card")).to_have_count(0)
        page.locator("#q").fill("Bob")
        expect(page.locator("#grid .card")).to_have_count(1)
        page.get_by_role("button",name="Cerrar búsqueda").click()
        page.locator("#grid [data-open]").first.click()
        # Two waterings plus fertilizer: correct the earlier exact event after toast expiry.
        page.locator("#d-water").click();page.wait_for_function("testWrites.length===1")
        first=page.evaluate("testWrites[0].plant.history[0].eventId")
        page.locator("#d-water").click();page.wait_for_function("testWrites.length===2")
        second=page.evaluate("testWrites[1].plant.history[0].eventId")
        open_section(page,"d-care-section")
        page.locator("#d-fertbtn").click();page.wait_for_function("testWrites.length===3")
        open_section(page,"d-history-section")
        page.wait_for_timeout(5100)
        page.once("dialog",lambda d:d.accept())
        page.locator(f'[data-correct="{first}"]').click()
        page.wait_for_function("testWrites.length===4")
        saved=page.evaluate("testWrites.at(-1).plant")
        assert saved["history"][0]["t"]=="abono" and saved["history"][1]["eventId"]==second
        assert all(h.get("eventId")!=first for h in saved["history"])
        assert page.evaluate("import('./js/plants.js').then(m=>m.correctWater('existing', '"+second+"'))")
        saved=page.evaluate("testWrites.at(-1).plant")
        assert saved["lastWater"]==PLANT["lastWater"] and saved["history"][0]["t"]=="abono"
        # Invalid copies and duplicate IDs must not write any document.
        before=page.evaluate("testWrites.length")
        for payload in [[{"id":"bad"}], [PLANT,PLANT]]:
            page.locator("#backup-file").set_input_files(dict(name="bad.json",mimeType="application/json",buffer=json.dumps(payload).encode()))
            expect(page.locator("#toast")).to_contain_text("No se restauró ninguna ficha")
            assert page.evaluate("testWrites.length")==before
        # Genuine permission errors must rollback and must not promise future synchronization.
        page.evaluate("window.testWriteError='permission-denied'")
        open_section(page,"d-manage-section")
        page.locator("#d-edit").click();page.locator("#f-name").fill("Nombre que no se guardó");page.locator("#f-save").click()
        expect(page.locator("#sync-status")).to_contain_text("rechazó el permiso")
        expect(page.locator("#f-name")).to_have_value("Bob")
        page.locator("#form-modal .xbtn").click()
        page.locator("#grid [data-open]").first.click()
        open_section(page,"d-manage-section")
        page.once("dialog",lambda d:d.accept());page.locator("#d-del").click()
        expect(page.locator("#sync-status")).to_contain_text("rechazó el permiso")
        expect(page.locator("#grid .card")).to_have_count(1)
        page.evaluate("window.testWriteError=null")
        page.locator("#detail-modal .xbtn").click()
        assert page.locator("#q").input_value()==""
        # Valid restore is one batch; rejected batch rolls back every optimistic document.
        copied={**PLANT,"id":"copy","name":"Copia","gallery":[],"updatedAt":"2026-10-01T12:00:00Z"}
        page.once("dialog",lambda d:d.accept())
        page.locator("#backup-file").set_input_files(dict(name="valid.json",mimeType="application/json",buffer=json.dumps([copied]).encode()))
        expect(page.locator("#toast")).to_contain_text("Restauración confirmada: 1 planta")
        expect(page.locator("#grid .card")).to_have_count(2)
        page.evaluate("window.testWriteError='permission-denied'")
        page.once("dialog",lambda d:d.accept())
        page.locator("#backup-file").set_input_files(dict(name="valid.json",mimeType="application/json",buffer=json.dumps([{**copied,"id":"copy-2"},{**copied,"id":"copy-3"}]).encode()))
        expect(page.locator("#sync-status")).to_contain_text("rechazó el permiso")
        expect(page.locator("#grid .card")).to_have_count(2)
        page.evaluate("window.testWriteError=null")
        # GPS, daily photos beyond the old six-photo cap, saved Gemini review, export.
        context.grant_permissions(["geolocation"],origin=URL)
        context.set_geolocation(dict(latitude=37.17,longitude=-3.59))
        page.evaluate("import('./js/ui.js').then(m=>m.openModal('settings-modal'))")
        page.get_by_title("Usar mi ubicación").click()
        expect(page.locator("#s-city")).to_have_value("Ciudad GPS")
        page.locator("#s-name").fill("Fran")
        page.get_by_role("button",name="Guardar ajustes").click()
        assert page.evaluate("""async()=>{const s=await import('./js/sync.js'),p=await import('./js/photos.js');for(let i=0;i<7;i++)await p.pushDiary(s.plants.find(p=>p.id==='existing'),'data:image/png;base64,AAAA','Foto '+i);return s.plants.find(p=>p.id==='existing').gallery.length===7;}""")
        page.locator("#grid [data-open]").first.click()
        expect(page.locator("#d-gal .gph")).to_have_count(7)
        open_section(page,"d-ai-section")
        page.locator("#d-aicard").click()
        expect(page.locator("#ai-save")).to_be_visible()
        page.locator("#ai-save").click()
        page.locator("#detail-modal .xbtn").click()
        page.locator("#grid [data-open]").first.click()
        open_section(page,"d-ai-section")
        page.locator("#d-lastai-btn").click();expect(page.locator("#ai-body")).not_to_be_empty()
        page.locator("#ai-modal .xbtn").click();page.locator("#detail-modal .xbtn").click()
        open_settings(page)
        page.locator("#acc-btn").click()
        with page.expect_download() as download:
            page.get_by_role("button",name="Descargar copia de seguridad").click()
        exported=json.loads(Path(download.value.path()).read_text())
        assert exported["app"]=="plantometro" and len(exported["plants"])==2
        assert len(next(p for p in exported["plants"] if p["id"]=="existing")["gallery"])==7
        page.locator("#account-modal .xbtn").click()
        # Logout erases account-local garden; the next account starts empty.
        assert page.evaluate("localStorage.getItem('pg3_cache_test-user')")
        page.evaluate("""() => {
          window.oldSnapshot=window.testSnapshot;
          window.pendingRestore=import('./js/plants.js').then(m=>m.importData({target:{files:[{size:100,text:()=>new Promise(r=>window.finishRestore=r)}],value:''}}));
        }""")
        page.wait_for_function("typeof finishRestore==='function'")
        page.evaluate("import('./js/sync.js').then(m=>m.doSignOut())")
        expect(page.locator("#gate")).to_be_visible()
        assert page.evaluate("import('./js/sync.js').then(m=>m.plants.length)")==0
        assert page.evaluate("localStorage.getItem('pg3_cache_test-user')")==None
        page.evaluate("window.testPlants=[];testAuthCallback({uid:'other-account',displayName:'Otro'})")
        expect(page.locator("#grid .card")).to_have_count(0)
        before=page.evaluate("testWrites.length")
        page.evaluate("oldSnapshot({docs:[{data:()=>({id:'old-account',name:'No debe aparecer',waterFreq:7})}]})")
        page.evaluate("finishRestore(JSON.stringify([{id:'old-copy',name:'No debe restaurarse',waterFreq:7}]))")
        page.evaluate("pendingRestore")
        expect(page.locator("#toast")).to_contain_text("La cuenta cambió")
        assert page.evaluate("testWrites.length")==before
        expect(page.locator("#grid .card")).to_have_count(0)
        page.evaluate("import('./js/sync.js').then(m=>m.doSignOut())")
        page.get_by_role("button",name="Continuar con Google").click()
        expect(page.locator("#gate")).to_be_hidden()
        expect(page.locator("#grid .card")).to_have_count(0)
        assert not errors,errors
        print(f"PASS regressions {width}x{height}: singular summary, discreet search, exact durable watering correction, failed write/delete, atomic restore, logout/account isolation")
        context.close()
    # Minimal home ordering and "check, do nothing" behavior, with mock services.
    context=browser.new_context(viewport=dict(width=320,height=740),service_workers="block")
    context.route("https://**/*",route_external)
    page=context.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
    from datetime import date,timedelta
    today=date.today()
    garden=[{**PLANT,"id":id,"name":name,"history":[],"gallery":[],"lastWater":str(today+timedelta(days=offset))} for id,name,offset in [('soon','La próxima',-3),('due','La de hoy',-7),('late','La pendiente',-10)]]
    garden += [{**PLANT,"id":"new","name":"Nueva sin riego","history":[],"gallery":[],"lastWater":"","createdAt":str(today)+'T12:00:00Z'}]
    context.add_init_script("window.testPlants="+json.dumps(garden)+";window.testWrites=[];")
    page.goto(URL)
    expect(page.locator("#garden-summary")).to_have_text("Hoy toca cuidar 2 plantas.")
    assert page.locator("#grid .card").evaluate_all("cards=>cards.map(c=>c.dataset.plant)")==['late','due','soon','new']
    expect(page.locator("#search-toggle")).to_be_hidden()
    expect(page.locator("#q")).to_be_hidden()
    assert not page.locator('#week,#chips,#due-banner,.statbar').count()
    assert page.locator('#grid .card').evaluate_all("cards=>cards.every(c=>c.querySelectorAll('[data-water]').length===1&&c.querySelectorAll('button').length===2)")
    assert 'hoy' in page.locator('[data-plant=due] .next').inner_text().lower()
    # Opening and leaving a ficha records nothing and does not postpone a plant.
    page.locator('[data-open=late]').click()
    page.locator('#detail-modal .xbtn').click()
    assert page.evaluate('testWrites.length')==0
    assert page.locator('[data-plant=late]').get_attribute('class')=='card late'
    page.locator('[data-open=new]').click()
    expect(page.locator('#d-last')).to_have_text('Sin riegos registrados')
    page.locator('#detail-modal .xbtn').click()
    page.locator('[data-water=due]').click()
    page.wait_for_function('testWrites.length===1')
    saved=page.evaluate('testWrites.at(-1).plant')
    assert saved['lastWater']==str(today) and len(saved['history'])==1
    assert page.locator('#grid .card').evaluate_all("cards=>cards.map(c=>c.dataset.plant)")==['late','soon','due','new']
    page.locator('#toast button').click()
    page.wait_for_function('testWrites.length===2')
    assert page.evaluate('testWrites.at(-1).plant.lastWater')==str(today-timedelta(days=7))
    # Larger gardens get a discreet search button, never an always-open input.
    page.evaluate("""() => {testSnapshot({docs:Array.from({length:9},(_,i)=>({data:()=>({...testPlants[0],id:'many-'+i,name:'Planta '+i})}))});}""")
    expect(page.locator('#search-toggle')).to_be_visible()
    page.locator('#search-toggle').click();page.locator('#q').fill('Planta 8')
    expect(page.locator('#grid .card')).to_have_count(1)
    page.get_by_role('button',name='Cerrar búsqueda').click()
    expect(page.locator('#grid .card')).to_have_count(9)
    assert not overflow(page) and not errors,errors
    # Natural labels for no pending plants and an empty garden, with a photo fallback.
    page.evaluate("day=>testSnapshot({docs:[{data:()=>({...testPlants[0],id:'future',name:'Mi planta',lastWater:day,photo:null})}]})",str(today))
    expect(page.locator('#garden-summary')).to_have_text('Hoy, tu jardín puede esperar.')
    expect(page.locator('.card-photo svg')).to_be_visible()
    expect(page.locator('.card-photo img')).to_have_count(0)
    page.evaluate("testSnapshot({docs:[]})")
    expect(page.locator('#garden-summary')).to_have_text('Un rincón para tus plantas.')
    expect(page.locator('#grid .empty h2')).to_have_text('Tu jardín empieza aquí')
    print('PASS minimal home: chronological order, one watering action, no changes on inspection, new plant without invented water, discreet search')
    context.close()
    # Self-contained preview with embedded photographs; network deliberately blocked.
    for width,height in [(320,740),(390,844),(768,1024),(820,1180)]:
        context=browser.new_context(viewport=dict(width=width,height=height),service_workers="block")
        context.route("https://**/*",lambda r:r.abort())
        page=context.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(URL+"preview.html")
        expect(page.locator("#grid .card")).to_have_count(2)
        expect(page.locator("aside")).to_contain_text("simulados")
        page.wait_for_function("[...document.querySelectorAll('#grid .card-photo img')].every(i=>i.complete&&i.naturalWidth>0)")
        for theme in ['light','dark']:
            open_settings(page)
            page.get_by_role('button',name='Claro' if theme=='light' else 'Oscuro',exact=True).click()
            page.locator('#settings-modal .xbtn').click()
            check_contrast(page)
            assert not overflow(page)
            page.screenshot(path=str(OUT/f"preview-{width}-{theme}.png"),full_page=True)
        page.locator("#grid [data-open]").first.click()
        expect(page.locator('#d-next')).to_contain_text('recordatorio de hace 77 días')
        expect(page.locator('#d-water')).to_be_visible()
        page.locator('#detail-modal .xbtn').click()
        page.locator('.fab').click()
        expect(page.locator('#f-photo-button')).to_have_text('Añadir foto')
        expect(page.locator('#f-photo')).to_be_hidden()
        expect(page.locator('#f-freq-label')).to_have_text('Recordarme cada')
        expect(page.locator('#f-freq-note')).to_have_text('Comprueba la tierra antes de regar')
        assert not overflow(page)
        assert not errors,errors
        context.close()
    print('PASS preview: embedded photos, mobile/tablet layouts, both themes, services explicitly simulated')
    # Dock layout with the actual app, synthetic garden and simulated services.
    # Font preference and safe insets are varied; keyboard is simulated by viewport resize.
    photo='data:image/jpeg;base64,'+base64.b64encode((ROOT/'Plantometro/preview-assets/plant.jpg').read_bytes()).decode()
    from datetime import date,timedelta
    day=date.today()
    many=[{**PLANT,'id':'layout-'+str(i),'name':('La planta del salón junto a la ventana con un nombre largo '*3 if i==1 else 'Planta '+str(i)), 'photo':photo if i%3 else None,'history':[],'gallery':[],'waterFreq':7,'lastWater':str(day-timedelta(days=[12,7,3][i%3]))} for i in range(14)]
    many.append({**PLANT,'id':'fresh','name':'Recién añadida sin riego','photo':None,'history':[],'gallery':[],'lastWater':'','createdAt':str(day)+'T12:00:00Z'})
    for width,height in [(320,740),(390,844),(768,1024),(1024,768),(768,640)]:
        context=browser.new_context(viewport=dict(width=width,height=height),has_touch=True,service_workers='block')
        context.route('https://**/*',route_external)
        context.add_init_script('window.testPlants=[];window.testWrites=[];')
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
        expect(page.locator('#gate')).to_be_hidden()
        # Zero, one and many plants, and the three chronological states.
        for garden in [[],[many[1]],many]:
            page.evaluate('list=>{testPlants=list;testSnapshot({docs:list.map(p=>({data:()=>p}))})}',garden)
            expect(page.locator('#grid .card')).to_have_count(len(garden))
            for theme in ['light','dark']:
                page.evaluate(f"import('./js/settings.js').then(m=>m.setTheme('{theme}'))")
                check_contrast(page)
                for zoom in ['100%','200%']:
                    page.evaluate('size=>document.documentElement.style.fontSize=size',zoom)
                    page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
                    clear_dock(page)
                    for fraction in [0,.35,.7,1]:
                        page.evaluate('f=>{const p=document.querySelector(".wrap");p.scrollTop=f*(p.scrollHeight-p.clientHeight)}',fraction)
                        clear_dock(page)
        page.evaluate("document.documentElement.style.fontSize='100%';document.documentElement.style.setProperty('--safe-bottom','34px')")
        page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        clear_dock(page)
        assert page.locator('.fab').bounding_box()['y']+page.locator('.fab').bounding_box()['height']<=height-34
        # No destructive cropping, no image substitution when the photo is absent.
        page.wait_for_function("[...document.querySelectorAll('.card-photo img')].every(i=>i.complete&&i.naturalWidth>0)")
        assert page.locator('.card-photo img').evaluate_all("imgs=>imgs.every(i=>getComputedStyle(i).objectFit==='contain')")
        assert page.locator('[data-plant=layout-0] .card-photo img').count()==0
        assert page.locator('[data-plant=layout-0] .next').inner_text().startswith('Recordatorio del ')
        assert page.locator('[data-plant=layout-1] .next').inner_text()=='Hoy toca mirar la tierra'
        assert 'Mirar la tierra el ' in page.locator('[data-plant=layout-2] .next').inner_text()
        fresh=page.locator('[data-plant=fresh]');assert fresh.get_attribute('class')=='card ok'
        # Shrink available height while searching, then restore orientation/height.
        page.locator('#search-toggle').click();page.locator('#q').fill('Planta')
        page.set_viewport_size(dict(width=width,height=max(320,int(height*.55))))
        page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        clear_dock(page)
        page.set_viewport_size(dict(width=width,height=height))
        page.get_by_role('button',name='Cerrar búsqueda').click()
        # Global add action is absent behind every app window and returns on close.
        page.locator('.fab').click();expect(page.locator('#form-modal')).to_be_visible();expect(page.locator('.fab')).to_be_hidden()
        page.locator('#f-name').fill('Sin fecha inventada')
        page.set_viewport_size(dict(width=width,height=max(320,int(height*.55))))
        page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        expect(page.locator('.fab')).to_be_hidden()
        page.locator('#plant-form').evaluate('el=>Promise.all(el.getAnimations().map(a=>a.finished))')
        sheet=page.locator('#plant-form').bounding_box();assert sheet['y']>=0 and sheet['y']+sheet['height']<=max(320,int(height*.55))+1,(width,height,sheet)
        page.locator('#f-save').scroll_into_view_if_needed();expect(page.locator('#f-save')).to_be_in_viewport()
        page.locator('#form-modal .xbtn').click()
        page.set_viewport_size(dict(width=width,height=height));clear_dock(page)
        # Ficha, settings and secondary windows cannot be obscured by the dock.
        page.locator('[data-open=layout-0]').click();expect(page.locator('.fab')).to_be_hidden()
        assert page.locator('#d-next').inner_text().find('recordatorio de hace')>=0
        page.locator('#detail-modal .xbtn').click()
        page.locator('#settings-btn').click();expect(page.locator('.fab')).to_be_hidden()
        page.get_by_role('button',name='Clima de tu zona').click();expect(page.locator('.fab')).to_be_hidden()
        page.locator('#weather-modal .xbtn').click();clear_dock(page)
        assert page.evaluate('testWrites.length')==0 and not errors,errors
        print(f'PASS reserved dock {width}x{height}: zero/one/many, both themes, text 200%, full scroll, safe inset 34px, simulated keyboard, modals, full photos, date states and fresh plant')
        context.close()
    # Real service worker and offline app shell, without a production sign-in.
    context=browser.new_context(viewport=dict(width=390,height=844))
    context.route("https://**/*",route_external)
    context.add_init_script("window.testPlants=[];window.testWrites=[];")
    page=context.new_page();page.goto(URL)
    page.evaluate("navigator.serviceWorker.ready")
    page.reload()
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    keys=page.evaluate("caches.keys()")
    assert "plantometro-v14" in keys
    assert page.evaluate("caches.open('plantometro-v14').then(c=>c.match(location.href).then(Boolean))")
    # Preserve caches belonging to the other apps on the same GitHub Pages origin.
    page.evaluate("caches.open('horas-v1')")
    sw=page.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.active.scriptURL)")
    assert sw.endswith("/Plantometro/sw.js")
    manifest=page.evaluate("fetch('./manifest.json').then(r=>r.json())")
    assert manifest["display"]=="standalone" and manifest["start_url"]=="./index.html"
    context.set_offline(True);page.reload()
    expect(page.locator("h1.brand")).to_have_text("Plantómetro")
    assert "horas-v1" in page.evaluate("caches.keys()")
    print("PASS PWA: scoped worker v14, app cache, offline shell, standalone manifest, other-app cache retained")
    context.close();browser.close()
server.shutdown()
print(f"Screenshots: {OUT}")
