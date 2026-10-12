"""Two real browsers + official Firebase SDK + local Firestore. Auth HTTP simulated."""
import base64,functools,http.server,json,os,threading,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
assert os.environ.get('FIRESTORE_EMULATOR_HOST')=='127.0.0.1:8080','Only local Firestore allowed'
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/controlHoras/'
cache={}
def jwt(uid):
 def part(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
 return part({'alg':'none','typ':'JWT'})+'.'+part({'sub':uid,'user_id':uid,'aud':'mishoras-bb0cc','iss':'https://securetoken.google.com/mishoras-bb0cc','iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.fixture'
def external(route):
 url=route.request.url;headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, OPTIONS'}
 if route.request.method=='OPTIONS':route.fulfill(status=204,headers=headers);return
 if url.startswith('https://www.gstatic.com/firebasejs/'):
  if url not in cache:cache[url]=urllib.request.urlopen(url,timeout=30).read()
  route.fulfill(body=cache[url],content_type='application/javascript',headers=headers)
 elif 'identitytoolkit.googleapis.com' in url:
  payload=json.loads(route.request.post_data or '{}');uid=payload.get('token','one')
  if 'accounts:lookup' in url:
   uid=json.loads(base64.urlsafe_b64decode(payload['idToken'].split('.')[1]+'=='))['sub'];route.fulfill(json={'users':[{'localId':uid,'providerUserInfo':[]}]},headers=headers)
  else:route.fulfill(json={'idToken':jwt(uid),'refreshToken':'fixture-refresh','expiresIn':'3600','localId':uid},headers=headers)
 else:route.abort() # Production Firestore, App Check and Gemini are always blocked.
def wait(page,condition):
 try:page.wait_for_function(condition,timeout=30000)
 except Exception:
  # Only this emulator's fictional records; no Auth or App Check values.
  print('LOCAL_SYNC_TIMEOUT '+json.dumps(page.evaluate("()=>({online:navigator.onLine,status:cloud.status,selectedDay:state.selectedDay,pendingPaths:sync.pending().map(o=>o.path),days:state.allData[monthKey(state.year,state.month)]?.days})")),flush=True)
  raise
try:
 with sync_playwright() as p:
  browser=p.chromium.launch();contexts=[];pages=[]
  for width,height in [(390,844),(768,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='block');contexts.append(ctx);ctx.route('https://**/*',external);page=ctx.new_page();page.on('dialog',lambda d:d.accept());page.goto(URL);page.evaluate('cloud.db.useEmulator("127.0.0.1",8080)');page.evaluate('firebase.auth().signInWithCustomToken("one")');wait(page,'cloud.user?.uid==="one"&&cloud.status==="ok"');pages.append(page)
  a,b=pages;a.evaluate('selectDay(1);stepHours(0,8.25);saveDay()');b.evaluate('selectDay(2);stepHours(0,9.5);saveDay()');
  for page in pages:wait(page,'sync.pending().length===0&&state.allData[monthKey(state.year,state.month)]?.days[1]?.hours===8.25&&state.allData[monthKey(state.year,state.month)]?.days[2]?.hours===9.5')
  contexts[1].set_offline(True);b.evaluate('selectDay(3);stepHours(0,7.5);saveDay()');a.evaluate('if(state.selectedDay!==1)selectDay(1);clearDay()');assert a.evaluate('state.allData[monthKey(state.year,state.month)].days[1]===null');wait(a,'sync.pending().length===0');contexts[1].set_offline(False)
  for page in pages:wait(page,'sync.pending().length===0&&state.allData[monthKey(state.year,state.month)]?.days[1]===null&&state.allData[monthKey(state.year,state.month)]?.days[3]?.hours===7.5')
  # Same-day conflict is explicitly last server commit; unrelated offline work never restores deletion.
  a.evaluate('selectDay(4);stepHours(0,6);saveDay()');wait(b,'state.allData[monthKey(state.year,state.month)]?.days[4]?.hours===6');b.evaluate('selectDay(4);clearDay()');wait(a,'state.allData[monthKey(state.year,state.month)]?.days[4]===null')
  # Real payroll uses per-scalar/per-concept mergeFields, separately from days.
  for page in pages:page.evaluate('openHistory()')
  a.evaluate('editRealPayroll("gross","125");saveRealPayroll()')
  b.evaluate('editRealPayroll("net","110");addRealLine("deductions");window.fixtureLine=Object.keys(payrollDraft().deductions)[0];editRealLine("deductions",fixtureLine,"name","IRPF");editRealLine("deductions",fixtureLine,"kind","irpf");editRealLine("deductions",fixtureLine,"amount","15");saveRealPayroll()')
  for page in pages:wait(page,'sync.pending().length===0&&state.allData[monthKey(state.year,state.month)].payroll?.gross===125&&state.allData[monthKey(state.year,state.month)].payroll?.net===110&&Object.values(state.allData[monthKey(state.year,state.month)].payroll.deductions).some(l=>l?.amount===15)')
  line=b.evaluate('fixtureLine');contexts[1].set_offline(True);b.evaluate('editRealPayroll("received","109");saveRealPayroll()')
  a.evaluate('id=>{removeRealLine("deductions",id);saveRealPayroll()}',line);wait(a,'sync.pending().length===0')
  contexts[1].set_offline(False)
  for page in pages:wait(page,'sync.pending().length===0&&state.allData[monthKey(state.year,state.month)].payroll?.received===109&&Object.values(state.allData[monthKey(state.year,state.month)].payroll.deductions).every(l=>l===null)')
  for page in pages:page.evaluate('switchTab("mes")')
  b.evaluate('toggleMoney()');a.evaluate('updateConfig("userName","Nombre ficticio")');wait(b,'state.config.userName==="Nombre ficticio"');assert b.evaluate('state.config.hideMoney') is True
  a.evaluate('firebase.auth().signOut()');wait(a,'cloud.user===null&&Object.keys(state.allData).length===0');a.evaluate('firebase.auth().signInWithCustomToken("two")');wait(a,'cloud.user?.uid==="two"&&cloud.status==="ok"');assert a.evaluate('Object.keys(state.allData).length')==0
  a.evaluate('selectDay(5);saveDay()');wait(a,'sync.pending().length===0');assert b.evaluate('state.allData[monthKey(state.year,state.month)].days[5]||null') is None
  a.evaluate('firebase.auth().signOut()');wait(a,'cloud.user===null');a.evaluate('firebase.auth().signInWithCustomToken("one")');wait(a,'cloud.user?.uid==="one"&&state.allData[monthKey(state.year,state.month)]?.days[3]?.hours===7.5');assert a.evaluate('state.allData[monthKey(state.year,state.month)].days[5]||null') is None
  for ctx in contexts:ctx.close()
  browser.close();print('PASS two real Chromium contexts + official Firebase/Firestore LOCAL emulator: independent writes and real payroll fields/concepts, offline/reconnect, durable deletions, defined conflict, account isolation and device privacy. Auth simulated; production rules NOT verified.',flush=True)
finally:server.shutdown()

