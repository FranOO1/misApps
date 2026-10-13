"""Actual Chromium UI and SW. External cloud/AI are blocked; no real user data."""
import functools,http.server,json,threading,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'controlHoras/captures';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  # This suite covers the paused UI without a cloud/session. Enabled AI is tested separately.
  if self.path.split('?')[0].endswith('/ai-config.js'):
   body=(ROOT/'controlHoras/ai-config.js').read_text().replace('enabled:true','enabled:false').encode()
   self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  super().do_GET()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
# Exactly the Chart.js dependency used by the app. No Firebase credential/session.
chart=urllib.request.urlopen('https://cdn.jsdelivr.net/npm/chart.js',timeout=30).read()
fixture={'config':{'rateNormal':10,'plusFestivo':5,'rateExtra':20,'userName':'','profile':'ett','sintaxUnlocked':False,'hideMoney':False,'deductions':[{'id':'d1','name':'IRPF','pct':10}]},'data':{'2026-10':{'days':{'1':{'type':'normal','hours':8.25},'2':{'type':'normal','hours':9.5},'3':{'type':'festivo','hours':10.75},'4':{'type':'descanso','hours':0},'5':{'type':'normal','hours':12},'6':{'type':'normal','hours':8}}}}}
def external(route):
 if route.request.url=='https://cdn.jsdelivr.net/npm/chart.js':route.fulfill(body=chart,content_type='application/javascript')
 else:route.abort()
def no_overflow(page):
 measurements=page.evaluate('({tab:state.tab,width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("#app *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))})')
 assert measurements['scroll']<=measurements['width']+1,measurements
 assert page.locator('#app').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width,height in [(320,740),(390,844),(768,1024),(844,390),(1280,900)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce',service_workers='block',has_touch=True)
   ctx.route('https://**/*',external);ctx.add_init_script("if(!localStorage.getItem('horas-app-v2'))localStorage.setItem('horas-app-v2',"+json.dumps(json.dumps(fixture))+");const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:['2026-10-08T12:00:00Z']));}static now(){return new OriginalDate('2026-10-08T12:00:00Z').getTime();}};")
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL);expect(page.get_by_text('Toca un día para registrar tus horas')).to_have_count(0);no_overflow(page)
   expect(page.locator('#more-details')).not_to_have_attribute('open','')
   expect(page.get_by_text('Proyección a fin de mes',exact=True)).to_be_visible()
   for day,count in [(1,2),(3,2),(4,1)]:
    assert page.locator(f'#day-btn-{day} span').count()==count
   assert page.locator('#day-btn-4').inner_text().split()==['4']
   colors=[page.locator(f'#day-btn-{day}').evaluate('e=>getComputedStyle(e).backgroundColor') for day in [1,3,4]];assert len(set(colors))==3
   expect(page.locator('#monthly-hours')).to_contain_text('48,5 h este mes')
   expect(page.locator('#monthly-hours-breakdown')).to_have_text('10,75 horas festivas')
   page.evaluate('window.savedDays=structuredClone(state.allData["2026-10"].days)')
   for days,total,breakdown in [({'1':{'type':'normal','hours':8.25}},'8,25',None),({},'0',None),({'1':{'type':'festivo','hours':10.75}},'10,75','10,75 horas festivas')]:
    page.evaluate('days=>{state.allData["2026-10"].days=days;render()}',days)
    expect(page.locator('#monthly-hours')).to_contain_text(total+' h este mes')
    if breakdown:expect(page.locator('#monthly-hours-breakdown')).to_have_text(breakdown)
    else:expect(page.locator('#monthly-hours-breakdown')).to_have_count(0)
   page.evaluate('state.allData["2026-10"].days=savedDays;render()')
   page.screenshot(path=str(OUT/f'menu-{width}.png'),full_page=True,animations='disabled')
   nav=page.locator('.tabs-bar');items=nav.locator('button').all()
   assert len(items)==6
   boxes=[item.bounding_box() for item in items]
   assert len(set(round(box['y']) for box in boxes))<=(2 if width<380 else 1),boxes
   assert nav.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
   assert boxes[-1]['width']>=44 and boxes[-1]['height']>=44
   for key,label in [('mes','Mes'),('anual','Año'),('ia','IA'),('ajustes','Ajustes'),('historico','Histórico')]:
    button=page.locator('#nav-'+key);box=button.bounding_box();assert box['height']>=44 and box['width']>=44
    assert button.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),{'viewport':width,'button':key,'size':button.evaluate('e=>({width:e.clientWidth,scroll:e.scrollWidth})')}
    button.tap();expect(page.locator('#nav-'+key)).to_have_attribute('aria-current','page')
    if key=='anual':page.wait_for_function('chartInst && chartInst.canvas.isConnected')
    no_overflow(page)
   page.locator('#nav-mes').focus();page.keyboard.press('Enter')
   for key,press in [('anual','Enter'),('ia','Space'),('historico','Enter'),('ajustes','Enter')]:
    page.keyboard.press('Tab');expect(page.locator('#nav-'+key)).to_be_focused();page.keyboard.press(press)
    expect(page.locator('#nav-'+key)).to_have_attribute('aria-current','page');expect(page.locator('#nav-'+key)).to_be_focused()
   page.locator('#nav-privacy').focus();page.keyboard.press('Space');expect(page.locator('#nav-privacy')).to_be_focused();expect(page.locator('#nav-privacy')).to_have_attribute('aria-pressed','true');page.keyboard.press('Space');expect(page.locator('#nav-privacy')).to_be_focused();expect(page.locator('#nav-privacy')).to_have_attribute('aria-pressed','false')
   page.locator('#nav-mes').tap();expect(page.locator('#day-btn-4')).to_have_attribute('aria-label','4 de Octubre, Descanso')
   assert page.locator('.calendar-heading,.calendar-legend').count()==0;expect(page.locator('#day-btn-4')).to_have_text('4 ZZ')
   assert page.locator('#day-btn-4').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(51, 31, 38)'
   page.screenshot(path=str(OUT/f'visible-{width}.png'),full_page=True,animations='disabled')
   page.evaluate('selectDay(8)')
   add=page.locator('#btn-add-day');box=add.bounding_box()
   assert add.evaluate('e=>!['+json.dumps('fixed')+','+json.dumps('sticky')+'].includes(getComputedStyle(e).position)')
   if width==390:assert box['y']+box['height']<=height,{'viewport':height,'add':box}
   page.screenshot(path=str(OUT/f'add-visible-{width}.png'),full_page=True,animations='disabled')
   page.locator('#day-btn-1').click();expect(page.locator('#day-earn-box')).to_be_visible();page.get_by_role('button',name='Ocultar importes').click();assert '10.00 €/h' not in page.locator('#app').inner_text();assert '•••• €/h' in page.locator('#app').inner_text();assert '48,5 h' in page.locator('#app').inner_text();no_overflow(page)
   page.screenshot(path=str(OUT/f'hidden-{width}.png'),full_page=True,animations='disabled')
   page.get_by_role('button',name='Año',exact=True).click();page.wait_for_timeout(250);assert page.evaluate('chartInst.data.datasets[0].label')=='Horas';assert page.evaluate('chartInst.data.datasets[0].data[9]')==48.5;assert not page.evaluate('chartInst.options.animation');no_overflow(page)
   page.get_by_role('button',name='IA',exact=True).click();expect(page.locator('#chat-input')).to_have_count(0);expect(page.get_by_text('La IA no está disponible ahora. Tus horas siguen guardándose con normalidad.',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Enviar',exact=True)).to_have_count(0);page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible();page.get_by_role('button',name='Mostrar importes').click()
   page.locator('#day-btn-8').click();page.locator('#draft-hours').fill('8.75');page.get_by_role('button',name='✓ Añadir').click();assert page.evaluate('state.allData["2026-10"].days[8].hours')==8.75;page.get_by_role('button',name='Borrar este día').click();assert page.evaluate('state.allData["2026-10"].days[8]||null') is None
   for h,color in [('9.49','rgb(232, 237, 247)'),('9.5','rgb(255, 176, 79)'),('10.75','rgb(255, 152, 104)'),('12','rgb(255, 128, 128)')]:
    if page.evaluate('state.selectedDay')==9:page.locator('#day-btn-9').click()
    page.locator('#day-btn-9').click();page.locator('#draft-hours').fill(h);assert page.locator('#draft-hours').evaluate('e=>getComputedStyle(e).color')==color;page.get_by_role('button',name='✓ Añadir').click();assert page.locator('#day-btn-9').evaluate('e=>getComputedStyle(e.querySelectorAll("span")[1]).color')==color
   page.locator('#day-btn-10').click();page.get_by_role('button',name='Festivo',exact=True).click();page.get_by_role('button',name='✓ Añadir').click();assert 'Festivo' in page.locator('#day-btn-10').get_attribute('aria-label');assert page.locator('#day-btn-10 span').count()==2;page.locator('#day-btn-11').click();page.get_by_role('button',name='Descanso',exact=True).click();page.get_by_role('button',name='✓ Añadir').click();assert page.evaluate('state.allData["2026-10"].days[11].hours')==0
   page.locator('#more-details summary').click();expect(page.locator('#more-details')).to_have_attribute('open','');page.locator('#more-details summary').focus();page.keyboard.press('Enter');expect(page.locator('#more-details')).not_to_have_attribute('open','')
   page.get_by_role('button',name='Ocultar importes').click();page.evaluate('applyRemote({config:{...state.config,hideMoney:false},data:state.allData})');expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible()
   page.get_by_role('button',name='Ajustes',exact=True).click();expect(page.get_by_role('spinbutton',name='Hora normal (€)',exact=True)).to_be_enabled();assert 'copias contienen datos económicos' in page.locator('#app').inner_text();page.get_by_role('button',name='Mes',exact=True).click();page.get_by_role('button',name='Exportar PDF').click();expect(page.get_by_text('Elige si el PDF incluye información económica. Los datos reales y las estimaciones se identifican por separado.')).to_be_visible()
   page.get_by_role('button',name='Cancelar',exact=True).click();page.evaluate('processDownload=async()=>{};doExportMonth()');assert page.evaluate('state.pdfReady.blob.size')>1000
   page.get_by_role('button',name='Mostrar importes').click();page.get_by_role('button',name='IA',exact=True).click();page.evaluate('state.aiEnabled=true;state.aiBlocked=false;state.chatMsgs=[{role:"user",text:"<script>window.pwned=1</script>"},{role:"bot",text:"<img src=x onerror=\\"window.pwned=1\\"> 23 €"}];render()');assert page.locator('.bubble script,.bubble img').count()==0;assert not page.evaluate('window.pwned||false')
   page.evaluate('document.documentElement.style.fontSize="24px"');no_overflow(page);assert page.evaluate('getComputedStyle(document.querySelector(".tab-content")).animationName')=='none';assert not errors,errors
   page.evaluate('switchTab("mes");state.selectedDay=null;selectDay(13)');page.add_style_tag(content='body{font-size:20px!important}button,input,select,textarea,.privacy-note,.money-detail,.calendar-legend{font-size:18px!important}.day-cell span{font-size:16px!important}')
   no_overflow(page);page.locator('#btn-add-day').scroll_into_view_if_needed();expect(page.locator('#btn-add-day')).to_be_visible();assert page.locator('#btn-add-day').evaluate('e=>getComputedStyle(e).position')=='static';page.screenshot(path=str(OUT/f'enlarged-{width}.png'),full_page=True,animations='disabled')
   print(f'PASS actual Chromium {width}: layout, CRUD, colors, privacy, chart dataset, persistence, remote preference, editable rates, PDF, escaped AI, reduced motion',flush=True);ctx.close()
  # Actual new worker, installed from this app. No adapter for CacheStorage/SW.
  ctx=browser.new_context(viewport={'width':390,'height':844});ctx.route('https://**/*',external);page=ctx.new_page();page.goto(URL);page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');page.evaluate('caches.open("plantometro-v19")');page.locator('#day-btn-8').click();page.locator('#draft-hours').fill('8.5');page.get_by_role('button',name='✓ Añadir').click();page.evaluate('openHistory();editRealPayroll("gross","90");editRealPayroll("net","0");saveRealPayroll();switchTab("mes")');page.get_by_role('button',name='Ocultar importes').click();ctx.set_offline(True);page.reload();expect(page.get_by_role('button',name='Mostrar importes')).to_be_visible();assert page.evaluate('state.allData[Object.keys(state.allData)[0]].days[8].hours')==8.5;assert page.evaluate('state.allData[Object.keys(state.allData)[0]].payroll.gross')==90;assert page.evaluate('state.allData[Object.keys(state.allData)[0]].payroll.net')==0;page.locator('#day-btn-9').click();page.get_by_role('button',name='✓ Añadir').click();page.reload();assert page.evaluate('state.allData[Object.keys(state.allData)[0]].days[9].hours')==8;assert 'plantometro-v19' in page.evaluate('caches.keys()');assert page.evaluate('fetch("./missing.js").then(r=>r.headers.get("content-type")).catch(()=>"failed")')=='failed';print('PASS actual SW install/cache/offline hours/privacy/reopen, missing JS failure, other-app cache retained',flush=True);ctx.close();browser.close()
finally:server.shutdown()

