"""Chromium layout and weather faults with explicit preview adapters.
These results do not test production Firebase, push, official warnings or Android.
"""
import functools,http.server,json,math,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('PLANTOMETRO_TEST_OUTPUT','/tmp/plantometro-weather-activity'));OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/preview.html'
def ratio(a,b):
 def luminance(rgb):
  rgb=[v/255 for v in rgb[:3]];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb];return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]
 x,y=sorted([luminance(a),luminance(b)]);return (y+.05)/(x+.05)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);errors=[]
  sizes=[] if os.environ.get('PLANTOMETRO_SKIP_LAYOUT')=='1' else [(320,740),(390,844),(768,1024),(820,1180)]
  for width,height in sizes:
   ctx=browser.new_context(viewport={'width':width,'height':height});p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(URL);expect(p.locator('.card')).to_have_count(10);base=p.evaluate('window.previewTest.state().plants')
   for count in [0,4,5,10]:
    plants=base[:count]
    if count:plants[-1]={**plants[-1],'name':'La planta de hojas grandes junto a la ventana que cuidamos entre Frank y Rosita','photo':None}
    p.evaluate('plants=>window.previewTest.setPlants(plants)',plants);expect(p.locator('.card')).to_have_count(count)
    if count>=5:expect(p.locator('#search-panel')).to_be_visible()
    else:expect(p.locator('#search-panel')).to_be_hidden()
    for dark in [False,True]:
     for size in ['16px','32px']:
      p.evaluate('([dark,size])=>{document.documentElement.classList.toggle("dark",dark);document.documentElement.style.fontSize=size;}',[dark,size])
      assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,count,size,'overflow')
      assert p.evaluate('()=>{const a=document.querySelector(".wrap").getBoundingClientRect(),b=document.getElementById("add-dock").getBoundingClientRect();return a.bottom<=b.top+1&&b.bottom<=innerHeight+1;}'),(width,count,size,'dock')
      if count:
       columns=p.evaluate('getComputedStyle(document.getElementById("grid")).gridTemplateColumns.split(" ").length')
       if count>=5 and width==390 and size=='16px':assert columns==2,columns
       if count>=5 and width==320:assert columns==1,columns
       if count>=5 and size=='32px' and width in [390,768]:assert columns==1,columns
       assert p.evaluate('()=>[...document.querySelectorAll(".waterbtn")].every(b=>b.getBoundingClientRect().height>=44&&b.scrollWidth<=b.clientWidth+1)')
       assert p.evaluate('()=>[...document.querySelectorAll(".card .name")].every(n=>n.scrollWidth<=n.clientWidth+1)')
       values=p.evaluate('()=>{const rgb=x=>x.match(/[\\d.]+/g).map(Number);const card=document.querySelector(".card");return [".next",".last-change",".name"].map(s=>[rgb(getComputedStyle(card.querySelector(s)).color),rgb(getComputedStyle(card).backgroundColor)]);}');assert all(ratio(*pair)>=4.5 for pair in values),values
      p.evaluate('document.querySelector(".wrap").scrollTop=document.querySelector(".wrap").scrollHeight')
      if count:assert p.evaluate('()=>{const cards=[...document.querySelectorAll(".waterbtn")],dock=document.getElementById("add-dock").getBoundingClientRect();return cards.at(-1).getBoundingClientRect().bottom<=dock.top+1;}')
   p.evaluate('document.documentElement.style.fontSize="16px"');p.evaluate('plants=>window.previewTest.setPlants(plants)',base)
   p.locator('#q').fill('FICUS');assert 0<p.locator('.card').count()<10;p.locator('#q').fill('no existe nada');expect(p.locator('.card')).to_have_count(0);p.locator('#search-clear').click();expect(p.locator('.card')).to_have_count(10)
   p.locator('.fab').click();p.set_viewport_size({'width':width,'height':480});expect(p.locator('#add-dock')).to_be_hidden();p.locator('#f-name').fill('Teclado simulado');p.locator('#form-modal .xbtn').click();p.set_viewport_size({'width':width,'height':height})
   assert p.evaluate('navigator.serviceWorker.controller===null');ctx.close()
  if sizes:print('PASS layout: 320/390/768/820, 0/4/5/10 plants, long names/no photo, both themes/text 200%, search, dock, simulated keyboard, contrast >=4.5',flush=True)
  else:print('SKIP unchanged layout cases; retrying weather/reading faults only',flush=True)
  ctx=browser.new_context(viewport={'width':390,'height':844});p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(URL);expect(p.locator('.card')).to_have_count(10);before=p.evaluate('window.previewTest.state().plants');calls=p.evaluate('window.previewWeatherCalls');p.evaluate('window.previewTest.checkWeather()');p.evaluate('window.previewTest.checkWeather()');assert p.evaluate('window.previewWeatherCalls')==calls
  for mode,kind,word in [('rain','rain','Lluvia'),('snow','snow','Nieve'),('storm','storm','Tormenta'),('hail','storm','granizo'),('wind','wind','Rachas')]:
   # Each relevant signal is shown once per kind/locality/day in the session.
   p.evaluate('mode=>window.previewTest.setWeather(mode)',mode)
   expect(p.locator('#weather-notice')).to_be_visible();expect(p.locator('#weather-notice')).to_contain_text(word)
   assert p.locator('#weather-scene').evaluate('(e)=>getComputedStyle(e).pointerEvents')=='none'
   p.locator('#weather-notice button').click();p.evaluate('mode=>window.previewTest.setWeather(mode)',mode);expect(p.locator('#weather-notice')).to_be_hidden()
  for mode in ['offline','incomplete','wrong-location','old-observation']:
   p.evaluate('window.previewTest.setWeather("normal")');temp=p.locator('#weather-peek-temp').inner_text();p.evaluate('mode=>window.previewTest.setWeather(mode)',mode);expect(p.locator('#weather-peek-age')).to_be_visible();expect(p.locator('#w-updated')).to_contain_text('Lectura antigua');assert p.locator('#weather-peek-temp').inner_text()==temp
  assert p.evaluate('window.previewTest.state().plants')==before
  # The same dismissal survives a reload; a fresh valid cached reading can open offline.
  p.evaluate('window.previewTest.setWeather("rain")');p.reload();expect(p.locator('#weather-notice')).to_be_hidden()
  p.evaluate('()=>{window.usedGPS=false;navigator.geolocation.getCurrentPosition=()=>{window.usedGPS=true}}');p.locator('#settings-btn').click();p.locator('#s-city').fill('Armilla');p.get_by_role('button',name='Buscar ciudad').click();expect(p.locator('#georesults button').first).to_contain_text('Armilla');p.locator('#georesults button').first.click();assert not p.evaluate('!!window.usedGPS');p.locator('#settings-modal .xbtn').click()
  p.evaluate('window.previewTest.otherAction()');expect(p.locator('#activity-badge')).to_have_text('1');p.locator('#activity-btn').click();expect(p.locator('#activity-list')).to_contain_text('Rosita');expect(p.locator('#activity-list')).to_contain_text('Nueva');p.locator('#activity-read-all').click();expect(p.locator('#activity-badge')).to_be_hidden();expect(p.locator('#activity-list')).to_contain_text('Leída');p.locator('#activity-modal .xbtn').click()
  print('PASS simulated weather: all phenomena/faults, last reading/time/stale, dismissal persistence, dedup refresh, Armilla without GPS; unread/read bell',flush=True)
  p.evaluate('window.previewTest.setWeather("normal")');p.evaluate('document.documentElement.classList.remove("dark")');p.locator('.wrap').evaluate('(e)=>e.scrollTop=0');p.wait_for_function("!document.getElementById('toast').classList.contains('show')");p.screenshot(animations='disabled',path=str(OUT/'mobile-home.png'));p.set_viewport_size({'width':768,'height':1024});p.screenshot(animations='disabled',path=str(OUT/'tablet-home.png'));p.evaluate('document.documentElement.classList.add("dark")');p.screenshot(animations='disabled',path=str(OUT/'tablet-dark.png'));p.evaluate('document.documentElement.classList.remove("dark")');p.set_viewport_size({'width':390,'height':844});p.evaluate('window.previewTest.otherAction()');expect(p.locator('#activity-badge')).to_have_text('1');p.locator('#activity-btn').click();p.screenshot(animations='disabled',path=str(OUT/'mobile-activity.png'));ctx.close()
  reduced=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');r=reduced.new_page();r.on('pageerror',lambda e:errors.append(str(e)));r.goto(URL);r.evaluate('window.previewTest.setWeather("snow")');expect(r.locator('#weather-notice')).to_contain_text('Nieve');assert r.locator('#weather-scene i').count()==0;assert r.locator('#weather-scene').evaluate('(e)=>getComputedStyle(e).animationName')=='none';r.screenshot(animations='disabled',path=str(OUT/'mobile-reduced-motion.png'));reduced.close()
  empty=browser.new_context(viewport={'width':320,'height':740});e=empty.new_page();e.on('pageerror',lambda x:errors.append(str(x)));e.add_init_script("window.previewInitialWeatherMode='offline'");e.goto(URL);expect(e.locator('#weather-peek-temp')).to_have_text('Clima no disponible');expect(e.locator('#w-updated')).to_have_text('Sin lecturas guardadas');empty.close()
  assert not errors,errors;print('PASS reduced motion static signal; screenshots are real Chromium over a labelled simulation, not phone or push tests',flush=True);browser.close()
finally:server.shutdown()
