"""Unedited screenshots of the labelled simulation; never production data."""
import functools,http.server,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'captures'
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/preview.html'
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844});p=ctx.new_page();p.goto(url);expect(p.locator('.card')).to_have_count(10)
  for img in p.locator('.card-photo img').all():img.scroll_into_view_if_needed()
  p.wait_for_function("[...document.querySelectorAll('.card-photo img')].every(i=>i.complete&&i.naturalWidth>0)")
  p.evaluate('window.previewTest.otherAction()');expect(p.locator('#activity-badge')).to_have_text('1');p.locator('.wrap').evaluate('e=>e.scrollTop=0')
  def shot(name):p.screenshot(path=str(OUT/(name+'-weather-activity.png')),animations='disabled')
  shot('mobile');p.set_viewport_size({'width':768,'height':1024});shot('tablet');p.evaluate('document.documentElement.classList.add("dark")');shot('tablet-dark');p.evaluate('document.documentElement.classList.remove("dark")');p.set_viewport_size({'width':390,'height':844});p.locator('#activity-btn').click();shot('mobile-activity');ctx.close()
  ctx=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');p=ctx.new_page();p.goto(url);p.evaluate('window.previewTest.setWeather("snow")');expect(p.locator('#weather-notice')).to_contain_text('Nieve');shot('mobile-reduced-motion');ctx.close();b.close()
  print('Captured mobile/tablet, dark theme, activity and reduced-motion forecast; all services/data explicitly simulated.')
finally:server.shutdown()
