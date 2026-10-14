"""Chromium mobile/tablet; fake SDK/Auth/model. Never production or personal data."""
import ast,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'Plantometro/tests/ui_smoke.py';tree=ast.parse(source.read_text())
names={'APP','AUTH','FIRESTORE','PLANT','AI_RESPONSE','APP_CHECK','FUNCTIONS'}
nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets) or isinstance(n,ast.FunctionDef) and n.name in {'route_external','enable_test_ai','open_section'}]
h={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),h)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/Plantometro/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,740),(390,844),(768,1024)]:
   for theme in ['light','dark']:
    ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block');ctx.route('https://**/*',h['route_external']);h['enable_test_ai'](ctx)
    plant={**h['PLANT'],'name':'Poto con un nombre muy largo que sigue siendo legible'}
    ctx.add_init_script('window.testPlants='+json.dumps([plant])+";window.testWrites=[];localStorage.setItem('pg3b_settings',"+json.dumps(json.dumps({'name':'Frank','theme':theme,'city':'Armilla'}))+');')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url)
    page.locator('[data-open=existing]').click();h['open_section'](page,'d-ai-section');page.locator('#d-aicard').click()
    expect(page.locator('#ai-question-form')).to_be_visible();assert page.evaluate('window.testAICalls||0')==0
    question='¿Por qué amarillean las hojas?';page.locator('#ai-question').fill(question);page.locator('#ai-send').click();expect(page.locator('#ai-body')).to_contain_text('Una planta que observar')
    assert page.evaluate('testAIRequest.mode')=='question';assert page.evaluate('testAIRequest.question')==question;assert page.evaluate('testWrites.length')==0
    assert '{' not in page.locator('#ai-body').inner_text();expect(page.locator('#ai-question')).to_have_value('')
    assert page.locator('#ai-send').evaluate('e=>e.getBoundingClientRect().height')>=44
    page.locator('#ai-question').fill('¿Y dónde la pongo?');page.locator('#ai-send').click();expect(page.locator('#ai-question')).to_have_value('');assert len(page.evaluate('testAIRequest.conversation'))==2
    assert page.evaluate('testWrites.length')==0
    out=ROOT/'Plantometro/captures';out.mkdir(exist_ok=True);page.screenshot(path=str(out/f'gemini-question-{width}-{theme}.png'),animations='disabled')
    page.evaluate('document.documentElement.style.fontSize="32px"');assert page.locator('#ai-modal .sheet').evaluate('e=>e.scrollWidth<=e.clientWidth+1');page.set_viewport_size({'width':width,'height':380});page.locator('#ai-question').fill('Con teclado abierto');assert page.locator('#ai-modal .sheet').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.evaluate('document.documentElement.style.fontSize=""');page.set_viewport_size({'width':width,'height':height});page.locator('#ai-modal .xbtn').click()
    page.locator('#d-aicard').click();page.locator('#ai-question').fill('Nueva consulta');page.locator('#ai-send').click();expect(page.locator('#ai-question')).to_have_value('');assert page.evaluate('testAIRequest.conversation.length')==0
    page.evaluate("window.testAIError='resource-exhausted'");page.locator('#ai-question').fill('No borres mi pregunta');page.locator('#ai-send').click();expect(page.locator('#ai-body')).to_contain_text('límite');expect(page.locator('#ai-question')).to_have_value('No borres mi pregunta');assert page.evaluate('testWrites.length')==0
    page.evaluate('window.testAIError=null;window.testAIWait=true');page.locator('#ai-question').fill('Pregunta en curso');page.locator('#ai-send').click();page.wait_for_function('typeof finishAI==="function"');page.locator('#ai-question').fill('Pregunta nueva aún sin enviar');page.evaluate('window.testAIWait=false;finishAI()');expect(page.locator('#ai-send')).to_be_enabled();expect(page.locator('#ai-question')).to_have_value('Pregunta nueva aún sin enviar')
    page.locator('#ai-modal .xbtn').click();page.evaluate('window.testAIError=null');page.locator('#d-aiphoto').click();page.locator('#camera-file').set_input_files(str(ROOT/'Plantometro/preview-assets/plant.jpg'));page.get_by_role('button',name='Analizar esta foto').click();expect(page.locator('.ai-photo-thumb')).to_be_visible();expect(page.locator('#ai-send')).to_be_enabled()
    page.locator('#ai-question').fill('¿Qué debo comprobar primero?');page.locator('#ai-send').click();expect(page.locator('#ai-question')).to_have_value('');assert page.evaluate('testAIRequest.photo.startsWith("data:image/jpeg")');assert len(page.evaluate('testAIRequest.conversation'))==2;assert page.evaluate('testWrites.length')==0
    page.locator('#ai-modal .xbtn').click();page.locator('#d-aicard').click();page.evaluate("testPlants=[];testAuthCallback({uid:'other-account'})");expect(page.locator('#ai-modal')).not_to_have_class('modal open');expect(page.locator('#ai-question')).to_have_value('');assert page.evaluate('testWrites.length')==0
    assert not errors,errors;ctx.close();print('PASS',width,theme,'question/follow-up/no automatic writes/close isolation/photo context/quota/200%/keyboard')
  for width,height in [(390,844),(768,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=True)
   remote=[];ctx.route('https://**/*',lambda r:(remote.append(r.request.url),r.abort()))
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url+'preview.html');expect(page.locator('.card')).to_have_count(10)
   page.locator('.card [data-open]').first.click();page.locator('#d-ai-section>summary').click();page.locator('#d-aicard').click();page.locator('#ai-question').fill('¿Cómo la cuido en invierno?');page.locator('#ai-send').click();expect(page.locator('#ai-body')).to_contain_text('Respuesta de ejemplo')
   assert not errors,errors;assert not remote,remote;page.screenshot(path=str(ROOT/f'Plantometro/captures/preview-question-{width}.png'),animations='disabled');ctx.close();print('PASS',width,'self-contained preview/10 examples/question/no real services')
  browser.close()
finally:server.shutdown()
