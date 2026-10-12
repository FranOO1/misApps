"""Actual local UI/downloads and selectable PDFs; fictional data, no cloud/AI requests."""
import functools,http.server,io,json,re,threading
from pathlib import Path
from pypdf import PdfReader
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'controlHoras/captures';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
config={'rateNormal':10,'plusFestivo':5,'rateExtra':20,'userName':'Persona Ficticia','profile':'ett','sintaxUnlocked':False,'hideMoney':False,'deductions':[{'id':'i','name':'IRPF','pct':10}]}
rates={k:v for k,v in config.items() if k not in ['userName','hideMoney']}
payroll={'gross':125,'deductionsTotal':15,'net':110,'received':None,'incomesComplete':True,'deductionsComplete':True,'note':'NOTA_NOMINA_FICTICIA','recordedAt':None,'incomes':{'base':{'name':'Salario base','kind':'base','amount':100},'holiday':{'name':'Festivos','kind':'holiday','amount':25}},'deductions':{'irpf':{'name':'IRPF','kind':'irpf','base':125,'pct':10,'amount':12.5},'ss':{'name':'Contingencias comunes','kind':'socialSecurity','base':125,'pct':2,'amount':2.5}}}
fixture={'config':config,'data':{'2026-10':{'days':{'1':{'type':'normal','hours':8,'segments':[{'start':'09:00','end':'17:00','breakMinutes':0}],'shift':'Mañana','extraHours':2,'nightHours':1,'notes':'NOTA_DIARIA_FICTICIA'},'2':{'type':'festivo','hours':4},'3':{'type':'descanso','hours':0}},'rateConfig':rates,'historicalStatus':'confirmed','payroll':payroll},'2026-01':{'days':{},'rateConfig':rates,'historicalStatus':'unknown'},'2025-09':{'days':{'1':{'type':'normal','hours':2}},'rateConfig':rates,'historicalStatus':'confirmed'}}}
def fits(page):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 assert page.locator('#app').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
def download(page,label,name):
 with page.expect_download() as event:page.get_by_role('button',name=label,exact=True).click()
 downloaded=event.value;assert downloaded.suggested_filename.endswith('.pdf') and '.zip' not in downloaded.suggested_filename
 path=OUT/name;downloaded.save_as(str(path));reader=PdfReader(io.BytesIO(path.read_bytes()));texts=[p.extract_text() for p in reader.pages]
 for i,text in enumerate(texts):assert f'Página {i+1} de {len(texts)}' in text,text[-200:]
 return '\n'.join(texts),reader
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(320,740),(768,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='block',reduced_motion='reduce',has_touch=True,permissions=['clipboard-read','clipboard-write']);ctx.route('https://**/*',lambda r:r.abort());ctx.add_init_script('localStorage.setItem("horas-app-v2",'+json.dumps(json.dumps(fixture))+');')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL)
   page.get_by_role('button',name='Histórico',exact=True).tap();fits(page)
   years=page.locator('.history-year summary').all_text_contents();assert years==sorted(years,reverse=True)
   page.locator('#report-period').fill('2026-10');page.locator('#report-period').dispatch_event('change');expect(page.locator('#real-gross')).to_have_value('125');expect(page.locator('#real-received')).to_have_value('')
   assert not page.locator('#report-economy').is_checked();text,_=download(page,'Descargar PDF mensual',f'report-safe-{width}.pdf');assert '125,00 EUR' not in text and 'NOTA_' not in text;assert '12 h' in text and 'No registrado' in text
   page.locator('#report-economy').check();text,reader=download(page,'Descargar PDF mensual',f'report-month-{width}.pdf');assert len(reader.pages)>1;assert 'Datos reales de nómina' in text;assert 'Estimación de la app' in text;assert '125,00 EUR' in text and '12,50 EUR' in text and 'Contingencias comunes' in text;assert '09:00' in text and '17:00' in text;assert 'NOTA_DIARIA_FICTICIA' in text;assert 'NOTA_NOMINA_FICTICIA' in text;assert text.count('Fecha')>=2
   annual,_=download(page,'Descargar PDF anual completo',f'report-year-{width}.pdf');assert 'Enero 2026' in annual and 'Diciembre 2026' in annual;assert 'Meses incluidos: 2026-10' in annual;assert 'Meses sin jornadas:' in annual and 'Meses sin nómina' in annual;assert '12,50 EUR' in annual
   page.locator('#report-economy').uncheck();page.locator('#report-question').fill('Explica el total de horas sin inventar datos');page.get_by_role('button',name='Copiar contexto para IA',exact=True).click();expect(page.locator('#report-context')).to_be_visible();context=page.locator('#report-context').input_value();assert 'NOTA_' not in context and 'Persona Ficticia' not in context;assert 'gross' not in context;assert 'Mi pregunta:' in context;assert page.evaluate('navigator.clipboard.readText()')==context
   page.locator('#report-period').fill('2025-09');page.locator('#report-period').dispatch_event('change');page.locator('#real-gross').fill('77.25');page.locator('#real-net').fill('0');page.get_by_role('button',name='Añadir deducción',exact=True).click();line=page.evaluate('Object.keys(payrollDraft().deductions).at(-1)');page.locator('#real-deductions-'+line+'-name').fill('Otra deducción');page.locator('#real-deductions-'+line+'-amount').fill('0');page.get_by_role('button',name='Guardar nómina real',exact=True).click();assert page.evaluate('state.allData["2025-09"].payroll.gross')==77.25;assert page.evaluate('state.allData["2025-09"].payroll.net')==0;assert page.evaluate('state.allData["2025-09"].payroll.deductionsTotal') is None
   page.reload();page.get_by_role('button',name='Histórico',exact=True).click();page.locator('#report-period').fill('2025-09');page.locator('#report-period').dispatch_event('change');expect(page.locator('#real-gross')).to_have_value('77.25');expect(page.locator('#real-net')).to_have_value('0');page.evaluate('updateConfig("rateNormal","99")');assert page.evaluate('state.allData["2025-09"].rateConfig.rateNormal')==10
   page.get_by_role('button',name='Ocultar importes').click();expect(page.locator('#real-gross')).to_have_count(0);assert '77.25' not in page.locator('#app').inner_text();fits(page);page.screenshot(path=str(OUT/f'history-hidden-{width}.png'),full_page=True)
   page.get_by_role('button',name='Mostrar importes').click();fits(page);page.screenshot(path=str(OUT/f'history-{width}.png'),full_page=True)
   assert not errors,errors;print(f'PASS reports Chromium {width}: touch/history, real PDF downloads/selectable text/page numbers/annual coverage, economics choice, local clipboard, partial/zero payroll save/reopen, historic rates/privacy. No production cloud or Gemini.',flush=True);ctx.close()
  browser.close()
finally:server.shutdown()
