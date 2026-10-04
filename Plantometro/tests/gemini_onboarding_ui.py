"""Real Chromium, synthetic SDK/model, isolated garden; never production."""
import ast,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'Plantometro/tests/ui_smoke.py';tree=ast.parse(source.read_text());names={'APP','AUTH','FIRESTORE','PLANT','AI_RESPONSE','APP_CHECK','FUNCTIONS'}
nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets) or isinstance(n,ast.FunctionDef) and n.name in {'route_external','enable_test_ai'}]
h={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),h)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/Plantometro/'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);profiles=[]
 for width,height,name in [(320,740,'Frank'),(390,844,'Rosita'),(768,1024,'Tablet')]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block');ctx.route('https://**/*',h['route_external']);h['enable_test_ai'](ctx)
  ctx.add_init_script('window.testPlants='+json.dumps([h['PLANT']])+';window.testWrites=[];')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url)
  expect(page.locator('#nickname-gate')).to_be_visible();expect(page.locator('#nickname-form h2')).to_have_text('¿Cuál es tu nombre o apodo?')
  page.locator('#nickname-input').fill(name);page.locator('#nickname-form button').click();expect(page.locator('#current-name')).to_have_text('Con '+name)
  page.reload();expect(page.locator('#nickname-gate')).to_be_hidden();expect(page.locator('#current-name')).to_have_text('Con '+name)
  page.evaluate("testPlants=[];testAuthCallback({uid:'other-account'})");expect(page.locator('#nickname-gate')).to_be_visible();expect(page.locator('#grid .card')).to_have_count(0)
  page.locator('#nickname-input').fill('Otra cuenta');page.locator('#nickname-form button').click()
  page.evaluate('testPlants='+json.dumps([h['PLANT']])+";testAuthCallback({uid:'test-user'})");expect(page.locator('#nickname-gate')).to_be_hidden();expect(page.locator('#current-name')).to_have_text('Con '+name)
  page.locator('.fab').click();page.locator('#f-name').fill('Mi nombre manual');page.locator('#f-identify').click();expect(page.locator('#f-suggestions')).to_be_visible();expect(page.locator('#f-name')).to_have_value('Mi nombre manual');page.get_by_role('button',name='Descartar sugerencias').click();expect(page.locator('#f-name')).to_have_value('Mi nombre manual')
  page.locator('#f-identify').click();expect(page.locator('#f-suggestions')).to_be_visible();page.locator('#use-especie').check();page.locator('#suggest-especie').fill('Especie corregida');page.get_by_role('button',name='Usar los datos seleccionados').click();expect(page.locator('#f-species')).to_have_value('Especie corregida');expect(page.locator('#f-name')).to_have_value('Mi nombre manual')
  page.locator('#f-photo').set_input_files(str(ROOT/'Plantometro/preview-assets/plant.jpg'));expect(page.locator('#f-prev img')).to_be_visible();before=page.locator('#f-prev img').get_attribute('src');page.evaluate("document.getElementById('f-photo').value='';document.getElementById('f-photo').dispatchEvent(new Event('change'))");assert page.locator('#f-prev img').get_attribute('src')==before
  page.locator('#f-save').click();expect(page.locator('#grid .card')).to_have_count(2);saved=page.evaluate('testWrites.at(-1).plant');assert saved['lastWater']=='' and saved['history']==[]
  page.locator('[data-open=existing]').click();page.locator('#d-ai-section > summary').click();page.locator('#d-aiphoto').click();expect(page.locator('#camera-modal')).to_be_visible()
  page.evaluate("Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'})}},configurable:true})");page.get_by_role('button',name='Abrir cámara',exact=True).click();expect(page.locator('#camera-status')).to_contain_text('No has dado permiso')
  page.locator('#camera-file').set_input_files(str(ROOT/'Plantometro/preview-assets/plant.jpg'));expect(page.locator('#camera-image')).to_be_visible();image=page.locator('#camera-image').get_attribute('src');page.evaluate("document.getElementById('camera-file').value='';document.getElementById('camera-file').dispatchEvent(new Event('change'))");assert page.locator('#camera-image').get_attribute('src')==image
  page.locator('#camera-file').set_input_files({'name':'too-big.jpg','mimeType':'image/jpeg','buffer':b'0'*(12*1024*1024+1)});expect(page.locator('#camera-status')).to_contain_text('demasiado grande');assert page.locator('#camera-image').get_attribute('src')==image
  out=ROOT/'Plantometro/captures';out.mkdir(exist_ok=True);page.locator('#camera-file').set_input_files(str(ROOT/'Plantometro/preview-assets/plant.jpg'));expect(page.locator('#camera-status')).to_contain_text('Revisa la foto');page.evaluate("document.getElementById('toast').classList.remove('show')");page.screenshot(path=str(out/f'gemini-photo-{width}.png'),animations='disabled')
  page.evaluate('window.testAIResponse='+json.dumps({**h['AI_RESPONSE'],'analisis':{'observado':'Hojas con una mancha visible.','causas':['Daño mecánico posible.','Otra causa por comprobar.'],'comprobar':['Toca la tierra antes de decidir.'],'recomendacion':'Observa la evolución con buena luz.'}}))
  page.get_by_role('button',name='Analizar esta foto').click();expect(page.locator('#ai-body')).to_contain_text('Una planta que observar');assert '{' not in page.locator('#ai-body').inner_text();expect(page.locator('#ai-body')).to_contain_text('Qué comprobar ahora');page.screenshot(path=str(out/f'gemini-analysis-{width}.png'),animations='disabled'); expect(page.locator('#ai-save')).to_be_visible();assert len(page.evaluate('testWrites'))==1
  page.locator('#ai-save').click();expect(page.locator('#ai-modal')).not_to_have_class('modal open');assert page.evaluate("testPlants.find(p=>p.id==='existing').gallery.length")>=1
  page.locator('#d-aiphoto').click();page.evaluate("window.stoppedCamera=false;const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);const media=c.captureStream(10);for(const t of media.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{window.stoppedCamera=true;stop();};}Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>media},configurable:true})")
  page.get_by_role('button',name='Abrir cámara',exact=True).click();expect(page.locator('#camera-capture')).to_be_visible();page.get_by_role('button',name='Capturar y analizar',exact=True).click();expect(page.locator('#ai-body')).to_contain_text('Una planta que observar');assert page.evaluate('stoppedCamera')
  page.locator('#ai-modal .xbtn').click();page.locator('#detail-modal .xbtn').click();page.locator('.fab').click();page.locator('#f-name').fill('Alta sin IA');page.evaluate("window.testAIError='resource-exhausted'");page.locator('#f-identify').click();expect(page.locator('#f-aistatus')).to_contain_text('límite');page.locator('#f-save').click();expect(page.locator('#grid .card')).to_have_count(3)
  page.locator('.fab').click();page.evaluate("document.documentElement.style.fontSize='32px'");assert page.locator('#plant-form').evaluate('e=>e.scrollWidth<=e.clientWidth+1');page.set_viewport_size({'width':width,'height':380});assert page.locator('#plant-form').evaluate('e=>e.scrollWidth<=e.clientWidth+1');page.locator('#form-modal .xbtn').click()
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');print('PASS',width,'nickname/account isolation/manual/suggestions/photo/cancel/size/camera denied+capture/context/save/quota')
  profiles.append(ctx)
 for ctx in profiles:ctx.close()
 browser.close()
server.shutdown()
