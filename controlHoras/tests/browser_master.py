"""Actual Chromium/IndexedDB + fictional originals. No production Auth, Firestore or Gemini."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'controlHoras/captures';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch();ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.route('https://**/*',lambda r:r.abort());page=ctx.new_page();page.on('dialog',lambda d:d.accept());page.goto(URL);page.add_script_tag(url=URL+'../gemini-prueba/economia-fixture.js')
  page.evaluate('window.fixture=HorasEconomiaFixture.create();replaceFromBackup({config:fixture.config,data:fixture.data});')
  master=page.evaluate('masterHistory.ensure()');assert master['index']['knownMonths'][0]=='2026-04';assert len(master['months'])==7;assert master['total']['groups'][0]['estimate']['net']==441
  page.evaluate('state.year=2026;state.month=5;switchTab("mes");selectDay(1);stepHours(0,8);saveDay()')
  assert page.evaluate('masterHistory.ensure().then(m=>m.months.find(x=>x.period==="2026-06").calc.neto)')==72
  assert page.evaluate('monthly(2026,5).neto')==72;assert page.evaluate('R.month(state.allData,state.config,"2026-06").calc.neto')==72
  page.evaluate('selectReportMonth("2026-07");editRealPayroll("net","110");saveRealPayroll()');assert page.evaluate('masterHistory.ensure().then(m=>m.originals.data["2026-07"].payroll.net)')==110
  page.evaluate('if(state.selectedDay!==1)selectDay(1);clearDay()');assert page.evaluate('masterHistory.ensure().then(m=>m.total.groups[0].totals.hours)')==43
  page.evaluate('replaceFromBackup({config:fixture.config,data:fixture.data});switchTab("ajustes")')
  with page.expect_download() as event:page.get_by_role('button',name='Exportar historial maestro JSON',exact=True).click()
  download=event.value;download.save_as(OUT/'master-ficticio.json');file=json.loads((OUT/'master-ficticio.json').read_text());assert file['kind']=='mis-horas-master';assert file['total']['groups'][0]['estimate']['net']==441;assert len(file['months'])==7
  version=page.evaluate('masterHistory.ensure().then(m=>m.sourceVersion)');page.reload();assert page.evaluate('masterHistory.ensure().then(m=>m.sourceVersion)')==version
  page.evaluate('state.chatMsgs=[{role:"user",text:"Conversación anterior"}];newConversation()');assert page.evaluate('state.chatMsgs.length')==0;assert page.evaluate('masterHistory.ensure().then(m=>m.sourceVersion)')==version
  # Inspect the actual persistent account object, not a VM storage adapter.
  persisted=page.evaluate('''()=>new Promise((resolve,reject)=>{const r=indexedDB.open("mis-horas-historial-maestro",1);r.onsuccess=()=>{const t=r.result.transaction("cuentas");const q=t.objectStore("cuentas").get("guest");q.onsuccess=()=>resolve(q.result.sourceVersion);q.onerror=reject;};r.onerror=reject;})''');assert persisted==version
  page.get_by_role('button',name='Ajustes',exact=True).click();page.screenshot(path=str(OUT/'master-export-390.png'),full_page=True)
  ctx.close();browser.close();print('PASS master actual IndexedDB: all legacy periods, common screen/PDF figures, edits/deletion/payroll/import, JSON export, persistence/reload and new conversation. All records fictional; no production Google.',flush=True)
finally:server.shutdown()
