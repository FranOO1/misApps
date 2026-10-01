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
export const signInWithPopup = async () => {};
export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null;
export const signOut = async () => {};
export const onAuthStateChanged = (auth, cb) => queueMicrotask(()=>cb({uid:'test-user',displayName:'Prueba',email:'test@example.invalid'}));
"""
FIRESTORE = """
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const collection = (...args) => args;
export const doc = (...args) => args;
export const onSnapshot = (ref, cb) => {
 window.testSnapshot=cb;
 queueMicrotask(()=>cb({docs:window.testPlants.map(p=>({data:()=>p}))}));
 return ()=>{};
};
export const setDoc = async (ref, p) => {
 window.testWrites.push(JSON.parse(JSON.stringify({ref:ref.slice(1),plant:p})));
};
export const deleteDoc = async () => {};
"""
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
    elif "generativelanguage.googleapis.com" in url:
        assert route.request.headers.get("x-goog-api-key") == "test-placeholder"
        result = dict(nombreComun="Monstera", especie="Monstera deliciosa", revisarCadaDias=5,
                      luz="media", confianza="baja", motivo="Foto o nombre insuficientes para confirmar.",
                      consejo="Comprueba la humedad, no riegues por calendario.")
        route.fulfill(json=dict(candidates=[dict(content=dict(parts=[dict(text=json.dumps(result))]))]))
    elif "geocoding-api.open-meteo.com" in url:
        route.fulfill(json={"results":[{"name":"Granada","latitude":37.17,"longitude":-3.59,"country":"España"}]})
    elif "api.open-meteo.com" in url:
        route.fulfill(json=dict(current=dict(temperature_2m=34,relative_humidity_2m=35,weather_code=61),
                               daily=dict(precipitation_probability_max=[80,70],precipitation_sum=[4,2])))
    else:
        route.fulfill(body="",content_type="text/css" if "fonts.googleapis" in url else "text/plain")

def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth > innerWidth")

def check_contrast(page):
    pairs = page.evaluate("""() => {
      const s=getComputedStyle(document.documentElement), names=['--ink','--ink2','--green','--grana','--amber','--blue'];
      return ['--bg','--surface','--surface2'].flatMap(bg=>names.map(fg=>[fg,bg,s.getPropertyValue(fg).trim(),s.getPropertyValue(bg).trim()]));
    }""")
    def luminance(h):
        v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
        v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
        return sum(a*b for a,b in zip(v,[.2126,.7152,.0722]))
    for fg,bg,a,b in pairs:
        x,y=sorted([luminance(a),luminance(b)])
        assert (y+.05)/(x+.05)>=4.5, (fg,bg,a,b)

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),args=["--no-sandbox"])
    for width,height in [(320,740),(390,844),(768,1024),(820,1180)]:
        context=browser.new_context(viewport=dict(width=width,height=height),service_workers="block")
        context.route("https://**/*",route_external)
        context.add_init_script("window.testPlants="+json.dumps([PLANT])+";window.testWrites=[];localStorage.setItem('pg3b_settings',JSON.stringify({name:'Fran',geminiKey:'test-placeholder',summerMode:true}));")
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(URL)
        expect(page.locator("#grid .card")).to_have_count(1)
        expect(page.locator("#gate")).to_be_hidden()
        expect(page.locator(".brand h1")).to_have_text("🌿Plantómetro")
        expect(page.locator("#grid .next")).to_contain_text("Revisión pendiente")
        assert not overflow(page)
        for theme in ["light","dark"]:
            page.evaluate(f"import('./js/settings.js').then(m=>m.setTheme('{theme}'))")
            check_contrast(page)
            page.screenshot(path=str(OUT/f"home-{width}-{theme}.png"),full_page=True)
        page.locator("#grid [data-open]").first.click()
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
        assert page.evaluate("testWrites.at(-1).plant.history.length")==65
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
        page.locator("[data-view=week]").click()
        expect(page.locator("#week")).to_be_visible()
        assert "regar" not in page.locator("#week").inner_text().lower()
        page.locator(".weather summary").click()
        expect(page.locator("#w-tip")).to_contain_text("Lluvia prevista")
        page.locator(".wrefresh").click()
        page.evaluate("import('./js/ui.js').then(m=>m.openModal('settings-modal'))")
        page.locator("#s-city").fill("Granada")
        page.get_by_title("Buscar",exact=True).click()
        expect(page.locator("#georesults button")).to_have_count(1)
        page.locator("#georesults button").click()
        page.locator("#settings-modal .xbtn").click()
        assert not errors, errors
        print(f"PASS {width}x{height}: open, edit, history, undo, name/photo suggestions, discard, correction, add, weather, calendar, contrast")
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
    assert "plantometro-v9" in keys
    assert page.evaluate("caches.open('plantometro-v9').then(c=>c.match(location.href).then(Boolean))")
    # Preserve caches belonging to the other apps on the same GitHub Pages origin.
    page.evaluate("caches.open('horas-v1')")
    sw=page.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.active.scriptURL)")
    assert sw.endswith("/Plantometro/sw.js")
    manifest=page.evaluate("fetch('./manifest.json').then(r=>r.json())")
    assert manifest["display"]=="standalone" and manifest["start_url"]=="./index.html"
    context.set_offline(True);page.reload()
    expect(page.locator(".brand h1")).to_have_text("🌿Plantómetro")
    assert "horas-v1" in page.evaluate("caches.keys()")
    print("PASS PWA: scoped worker v9, app cache, offline shell, standalone manifest, other-app cache retained")
    context.close();browser.close()
server.shutdown()
print(f"Screenshots: {OUT}")
