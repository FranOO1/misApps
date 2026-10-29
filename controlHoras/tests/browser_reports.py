"""Actual local UI/downloads and selectable PDFs; fictional data, no cloud/AI requests."""
import functools,http.server,io,json,re,threading
import fitz
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
fixture={'config':config,'data':{'2026-10':{'days':{'1':{'type':'normal','hours':8,'segments':[{'start':'09:00','end':'17:00','breakMinutes':0}],'shift':'Mañana','extraHours':2,'nightHours':1,'notes':'NOTA_DIARIA_FICTICIA'},'2':{'type':'festivo','hours':4},'3':{'type':'descanso','hours':0}},'rateConfig':rates,'historicalStatus':'confirmed','payroll':payroll},'2026-05':{'days':{'1':{'type':'normal','hours':4}},'rateConfig':rates,'historicalStatus':'confirmed'},'2026-01':{'days':{},'rateConfig':rates,'historicalStatus':'unknown'},'2025-09':{'days':{'1':{'type':'normal','hours':2}},'rateConfig':rates,'historicalStatus':'confirmed'}}}
def fits(page):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 assert page.locator('#app').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
def download(page,label,name):
 with page.expect_download() as event:page.get_by_role('button',name=label,exact=True).click()
 downloaded=event.value;assert downloaded.suggested_filename.endswith('.pdf') and '.zip' not in downloaded.suggested_filename
 path=OUT/name;downloaded.save_as(str(path));reader=PdfReader(io.BytesIO(path.read_bytes()));texts=[p.extract_text() for p in reader.pages]
 for i,text in enumerate(texts):assert f'Página {i+1} de {len(texts)}' in text,text[-200:]
 if name.endswith('-320.pdf'):
  rendered=fitz.open(path)
  for n in sorted({0,min(1,len(rendered)-1),len(rendered)//2}):rendered[n].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(OUT/(name[:-4]+f'-pagina-{n+1}.png'))
 return '\n'.join(texts),reader
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(320,740),(390,844),(768,1024),(1024,768)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='block',reduced_motion='reduce',has_touch=True,permissions=['clipboard-read','clipboard-write']);ctx.route('https://**/*',lambda r:r.abort());ctx.add_init_script('localStorage.setItem("horas-app-v2",'+json.dumps(json.dumps(fixture))+');')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL)
   page.get_by_role('button',name='Histórico',exact=True).tap();fits(page)
   expect(page.locator('.history-card .card-title')).to_have_text('Histórico')
   expect(page.locator('#report-year option')).to_have_text(['2026','2025'])
   assert page.locator('.history-month').count()==2
   assert page.locator('.history-month').first.get_attribute('data-period')=='2026-10'
   assert len(set(page.locator('.history-month').evaluate_all('es=>es.map(e=>getComputedStyle(e).backgroundColor)')))>=2
   for selector in ['#report-period','#real-gross','#real-net','#report-question','#report-context','#report-economy','#report-scope']:
    assert page.locator(selector).count()==0,selector
   assert page.locator('.history-card input,.history-card textarea').count()==0
   text=page.locator('.history-card').inner_text()
   assert 'Sin nómina' not in text and 'Contexto para IA' not in text and 'Nómina real' not in text
   expect(page.locator('[data-period="2026-10"]')).to_contain_text('12 h')
   expect(page.locator('[data-period="2026-10"]')).to_contain_text('126,00 EUR')
   before=page.evaluate('JSON.stringify(payload())')
   page.screenshot(path=str(OUT/f'history-simple-{width}.png'),full_page=True)
   text,reader=download(page,'Descargar PDF de Octubre 2026 con importes',f'report-month-{width}.pdf')
   assert len(reader.pages)>1 and 'Datos reales de nómina' in text and 'Estimación de la app' in text
   for expected in ['125,00 EUR','12,50 EUR','Contingencias comunes','09:00','17:00','NOTA_DIARIA_FICTICIA','NOTA_NOMINA_FICTICIA','140,00 EUR','126,00 EUR','IRPF','Días trabajados: 2']:
    assert expected in text,expected
   assert text.count('Fecha')>=2
   annual,_=download(page,'Descargar PDF anual con importes',f'report-year-{width}.pdf')
   for expected in ['Enero 2026','Diciembre 2026','Meses sin jornadas:','Meses sin nómina','16 h','180,00 EUR','18,00 EUR','162,00 EUR','12,50 EUR','Deducciones estimadas']:
    assert expected in annual,expected
   page.get_by_role('button',name='Seleccionar Mayo 2026',exact=True).tap()
   expect(page.locator('[data-period="2026-05"]')).to_have_attribute('data-selected','true')
   text,_=download(page,'Descargar PDF de Mayo 2026 con importes',f'report-no-payroll-{width}.pdf')
   assert 'Datos reales de nómina' not in text and '36,00 EUR' in text and '40,00 EUR' in text and '4,00 EUR' in text and 'Estimación de la app' in text
   # Privacy changes the visible estimates, never the explicitly labelled full PDF.
   page.get_by_role('button',name='Ocultar importes',exact=True).tap()
   assert '126,00' not in page.locator('.history-card').inner_text() and '36,00' not in page.locator('.history-card').inner_text()
   page.screenshot(path=str(OUT/f'history-hidden-{width}.png'),full_page=True)
   hidden,_=download(page,'Descargar PDF de Octubre 2026 con importes',f'report-hidden-{width}.pdf')
   assert '125,00 EUR' in hidden and '126,00 EUR' in hidden
   page.locator('#report-year').select_option('2025')
   expect(page.locator('.history-month')).to_have_count(1)
   expect(page.locator('.history-month')).to_contain_text('Septiembre')
   assert page.locator('#report-year').input_value()=='2025'
   page.get_by_role('button',name='Mostrar importes',exact=True).tap()
   text,_=download(page,'Descargar PDF de Septiembre 2025 con importes',f'report-older-{width}.pdf')
   assert '18,00 EUR' in text
   # No selection or download changes a saved payroll, tariff or journal.
   assert page.evaluate('JSON.stringify(payload())')==before
   page.evaluate('updateConfig("rateNormal","99")')
   assert page.evaluate('state.allData["2025-09"].rateConfig.rateNormal')==10
   page.locator('#report-year').select_option('2026');page.reload();page.get_by_role('button',name='Histórico',exact=True).tap()
   assert page.evaluate('state.allData["2026-10"].payroll.net')==110
   # Keyboard selection and enlarged text stay usable without overflow.
   page.get_by_role('button',name='Seleccionar Mayo 2026',exact=True).focus();page.keyboard.press('Enter')
   expect(page.locator('[data-period="2026-05"]')).to_have_attribute('data-selected','true')
   page.add_style_tag(content='html{font-size:125%} .history-card button,.history-card small{font-size:18px}')
   fits(page);page.screenshot(path=str(OUT/f'history-text-{width}.png'),full_page=True)
   # Empty copied/imported history shows an honest empty state, not invented months.
   page.evaluate('replaceFromBackup({config:state.config,data:{}})')
   expect(page.locator('.history-month')).to_have_count(0)
   expect(page.get_by_text('No hay registros en este año.',exact=True)).to_be_visible()
   expect(page.get_by_role('button',name='Descargar PDF anual con importes',exact=True)).to_be_disabled()
   fits(page);assert not errors,errors
   print(f'PASS compact history Chromium {width}: touch/keyboard/year/privacy/empty state, actual monthly and annual PDF downloads, selectable text/page numbers/rendered pages, estimates without payroll, preserved actual payroll and historic rates. No production cloud or Gemini.',flush=True);ctx.close()

  browser.close()
finally:server.shutdown()
