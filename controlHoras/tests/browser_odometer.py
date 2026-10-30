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
   # A real sync.receive callback used to cancel motion on every cloud echo.
   page.evaluate('window.runningNet=netAnimations[0];window.runningNode=document.getElementById("monthly-net")')
   page.wait_for_timeout(150)
   page.evaluate('sync.receive(payload(),{fromCache:false,historyRead:true})')
   assert page.evaluate('netAnimations[0]===window.runningNet && window.runningNet.playState==="running"'), 'Cloud confirmation interrupted the counter'
   assert page.evaluate('document.getElementById("monthly-net")===window.runningNode'), 'Animated node was replaced'
   page.wait_for_timeout(300)
   page.evaluate('sync.receive(payload(),{fromCache:false,historyRead:true});render()')
   assert page.evaluate('netAnimations[0]===window.runningNet && window.runningNet.currentTime>=400'), 'Cloud echo restarted the timeline'
   # Movement must be distributed through the duration, not almost over at 450 ms.
   assert page.evaluate('window.runningNet.effect.getComputedTiming().progress<.75')
   assert page.evaluate('netAnimations.every(a=>a.effect.getComputedTiming().endTime<=1800)')
   page.screenshot(path=str(OUT/f'odometer-moving-{width}.png'),animations='allow')
   page.wait_for_function('netAnimations.length===0');expect(page.locator('#monthly-net')).to_contain_text('36,00')
   expect(page.locator('#net-announcement')).to_contain_text('36,00')
   expect(page.locator('#net-delta')).to_contain_text('+36,00')
   page.evaluate('state.draft.hours=2;saveDay()');assert page.evaluate('monthly().neto')==18
   keyframes=page.evaluate('netAnimations[0].effect.getKeyframes().map(k=>k.transform)');assert '-' in keyframes[0] and keyframes[-1].startswith('translateY(0')
   page.evaluate('window.runningNet=netAnimations[0]')
   page.wait_for_timeout(150)
   page.evaluate('sync.receive(payload(),{fromCache:false,historyRead:true})')
   assert page.evaluate('netAnimations[0]===window.runningNet && window.runningNet.playState==="running"'), 'Descending motion interrupted'
   page.wait_for_function('netAnimations.length===0');expect(page.locator('#monthly-net')).to_contain_text('18,00')
   expect(page.locator('#net-announcement')).to_contain_text('18,00')
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
   # Period changes cancel even when the destination has the same net value.
   page.evaluate('state.draft.hours=2;saveDay();navMonth(-1)');assert page.evaluate('netAnimations.length')==0
   page.evaluate('navMonth(1);selectDay(1)');assert page.evaluate('netAnimations.length')==0
   page.evaluate('clearDay()');page.wait_for_function('netAnimations.length===0');assert page.evaluate('monthly().neto')==0
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.evaluate('selectDay(2)');assert page.locator('#btn-add-day').evaluate('e=>getComputedStyle(e).position') not in ['fixed','sticky','absolute']
   page.screenshot(path=str(OUT/f'relief-{width}.png'),full_page=True)
   if width==390:
    # Exercise saved amounts through the shared calculation, not a replacement
    # animation. Expected places are euro powers; -1/-2 are tenths/cents.
    page.evaluate('state.allData={};state.selectedDay=1;ensurePeriod().rateConfig={...C.financial(state.config),rateNormal:1000,deductions:[]}')
    for previous,next_amount,places in [(1000,1080,[1]),(1080,1085,[0]),(1099,1100,[2,1,0]),(1080,1000,[1]),(1085,1080,[0]),(1100,1099,[2,1,0]),(999,1000,[3,2,1,0]),(1000,999,[3,2,1,0]),(9999,10000,[4,3,2,1,0]),(10000,9999,[4,3,2,1,0]),(1085.05,1085.06,[-2]),(1085.09,1085.10,[-1,-2]),(1085.10,1085.09,[-1,-2])]:
     page.emulate_media(reduced_motion='reduce')
     page.evaluate('(amount)=>{state.draft={type:"normal",hours:amount/1000};saveDay()}',previous)
     page.emulate_media(reduced_motion='no-preference')
     page.evaluate('(amount)=>{state.draft.hours=amount/1000;saveDay()}',next_amount)
     actual=page.evaluate('netAnimations.map(a=>Number(a.effect.target.parentElement.dataset.place))')
     assert actual==places,(previous,next_amount,actual,places)
     assert page.evaluate('netAnimations.every(a=>a.effect.getTiming().duration===1600 && a.effect.getComputedTiming().endTime<=1720)')
     # Static digits and separators must keep both their text and coordinates.
     page.evaluate('window.stillNet=[...getEl("monthly-net").children].filter(e=>!e.querySelector(".odo-track")).map(e=>({node:e,text:e.textContent,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y}));window.netBox=getEl("monthly-net").getBoundingClientRect()')
     page.evaluate('for(const a of netAnimations){a.pause();a.currentTime=800;}')
     if previous==1099:
      page.screenshot(path=str(OUT/'odometer-selective-390.png'),animations='allow')
     assert page.evaluate('window.stillNet.every(({node,text,x,y})=>node.textContent===text && Math.abs(node.getBoundingClientRect().x-x)<.1 && Math.abs(node.getBoundingClientRect().y-y)<.1)')
     page.evaluate('for(const a of netAnimations)a.finish()');page.wait_for_function('netAnimations.length===0')
     assert page.evaluate('window.stillNet.every(({node,text,x,y})=>node.textContent===text && Math.abs(node.getBoundingClientRect().x-x)<.1 && Math.abs(node.getBoundingClientRect().y-y)<.1)')
     assert page.evaluate('Math.abs(getEl("monthly-net").getBoundingClientRect().width-window.netBox.width)<.1')
     assert page.locator('#monthly-net').text_content()==page.evaluate('eur(monthly().neto)')
     assert round(page.evaluate('monthly().neto'),2)==next_amount
   # A different account must never retain the previous account's animated node.
   page.evaluate('state.draft.hours=1;saveDay();cloud.db={collection:()=>({doc:()=>({onSnapshot:()=>()=>{}})})};sync.switchAccount({uid:"odometer-fixture-other"});render()')
   assert page.evaluate('netAnimations.length')==0
   expect(page.locator('#net-announcement')).to_have_text('');expect(page.locator('#net-delta')).to_have_text('')
   assert not errors,errors;ctx.close()
  browser.close();print('PASS actual Chromium odometer: selective numeric places and static separators, increase/decrease, fast updates, digit-length boundary, final live announcement, hidden amounts, reduced motion, navigation, normal-flow Add; fictional data only.',flush=True)
finally:server.shutdown()
