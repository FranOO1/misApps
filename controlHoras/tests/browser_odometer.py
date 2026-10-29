"""Actual Chromium animation and privacy, fictional local records only."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'controlHoras/captures';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
fixture={'config':{'rateNormal':10,'plusFestivo':5,'rateExtra':20,'profile':'ett','sintaxUnlocked':False,'hideMoney':False,'deductions':[{'id':'d','name':'IRPF','pct':10}]},'data':{}}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(320,740),(390,844),(768,1024),(1024,768)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='block',has_touch=True)
   ctx.route('https://**/*',lambda r:r.abort());ctx.add_init_script('localStorage.setItem("horas-app-v2",'+json.dumps(json.dumps(fixture))+');')
   page=ctx.new_page();page.on('dialog',lambda d:d.accept());errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL)
   assert page.evaluate('netAnimations.length')==0
   page.evaluate('selectDay(1);state.draft.hours=4;saveDay()')
   assert page.evaluate('monthly().neto')==36
   assert page.evaluate('netAnimations.length')>0
   keyframes=page.evaluate('netAnimations[0].effect.getKeyframes().map(k=>k.transform)');assert keyframes[0].startswith('translateY(0') and '-' in keyframes[-1]
   page.screenshot(path=str(OUT/f'odometer-moving-{width}.png'),animations='allow')
   page.wait_for_function('netAnimations.length===0');expect(page.locator('#monthly-net')).to_contain_text('36,00')
   expect(page.locator('#net-announcement')).to_contain_text('36,00')
   expect(page.locator('#net-delta')).to_contain_text('+36,00')
   page.evaluate('state.draft.hours=2;saveDay()');assert page.evaluate('monthly().neto')==18
   keyframes=page.evaluate('netAnimations[0].effect.getKeyframes().map(k=>k.transform)');assert '-' in keyframes[0] and keyframes[-1].startswith('translateY(0')
   page.evaluate('state.draft.hours=3;saveDay();state.draft.hours=5;saveDay()');page.wait_for_function('netAnimations.length===0');expect(page.locator('#monthly-net')).to_contain_text('45,00')
   # Cancel while hidden: no amount survives in visible or accessible motion elements.
   page.evaluate('state.draft.hours=7;saveDay();toggleMoney()');assert page.evaluate('netAnimations.length')==0
   expect(page.locator('#monthly-net')).to_have_text('•••• €');expect(page.locator('#net-announcement')).to_have_text('');expect(page.locator('#net-delta')).to_have_text('')
   page.evaluate('toggleMoney();switchTab("historico");switchTab("mes")');assert page.evaluate('netAnimations.length')==0
   page.emulate_media(reduced_motion='reduce');page.evaluate('state.draft.hours=8;saveDay()');assert page.evaluate('netAnimations.length')==0;expect(page.locator('#monthly-net')).to_contain_text('72,00')
   page.emulate_media(reduced_motion='no-preference')
   # Length boundary uses controlled rates only in this fixture, never in production.
   page.evaluate('state.allData[monthKey(state.year,state.month)].rateConfig={...C.financial(state.config),rateNormal:1000,deductions:[]};state.draft.hours=.99999;saveDay()');page.wait_for_function('netAnimations.length===0')
   page.evaluate('state.draft.hours=1;saveDay()');page.wait_for_function('netAnimations.length===0');assert page.evaluate('monthly().neto')==1000
   actual=page.locator('#monthly-net').text_content().strip();expected=page.evaluate('eur(monthly().neto)');assert actual==expected,repr((actual,expected))
   page.evaluate('clearDay()');page.wait_for_function('netAnimations.length===0');assert page.evaluate('monthly().neto')==0
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.evaluate('selectDay(2)');assert page.locator('#btn-add-day').evaluate('e=>getComputedStyle(e).position') not in ['fixed','sticky','absolute']
   page.screenshot(path=str(OUT/f'relief-{width}.png'),full_page=True)
   assert not errors,errors;ctx.close()
  browser.close();print('PASS actual Chromium odometer: increase/decrease, fast updates, digit-length boundary, final live announcement, hidden amounts, reduced motion, navigation, normal-flow Add; fictional data only.',flush=True)
finally:server.shutdown()
