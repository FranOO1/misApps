"""Real web SDKs with local Auth/Firestore; no production account or garden."""
import functools,http.server,json,re,sys,threading,datetime,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];tokens=json.load(sys.stdin)
sync=(ROOT/'js/sync.js').read_text();sync=re.sub(r'const fbConfig = \{[\s\S]*?\};',"const fbConfig={apiKey:'local-emulator-only',projectId:'demo-plantometro',authDomain:'localhost'};",sync,count=1)
sync=sync.replace('onAuthStateChanged, signOut }','onAuthStateChanged, signOut, connectAuthEmulator, signInWithCustomToken }').replace('writeBatch, runTransaction }','writeBatch, runTransaction, connectFirestoreEmulator }')
sync=sync.replace('auth = getAuth(app);',"auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});")
sync=sync.replace('  getRedirectResult(auth)',"  connectFirestoreEmulator(fs,'127.0.0.1',8080);signInWithCustomToken(auth,window.localTestToken).catch(()=>{});\n  getRedirectResult(auth)")
assert 'connectFirestoreEmulator' in sync
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);errors=[];forbidden=[]
  def context(uid,name,width):
   ctx=browser.new_context(viewport={'width':width,'height':1024 if width>700 else 844},has_touch=True,service_workers='block');prefs={'name':name,'city':'Armilla','lat':37.14386,'lon':-3.62534,'theme':'light','customPreference':'keep'}
   ctx.add_init_script('window.localTestToken='+json.dumps(tokens[uid])+';if(!localStorage.getItem("pg3b_settings"))localStorage.setItem("pg3b_settings",'+json.dumps(json.dumps(prefs))+');')
   ctx.route('**/js/sync.js',lambda r:r.fulfill(body=sync,content_type='application/javascript'))
   ctx.route('https://api.open-meteo.com/**',lambda r:r.fulfill(json={'utc_offset_seconds':0,'current':{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'temperature_2m':24,'relative_humidity_2m':55,'weather_code':2},'daily':{}}))
   for host in ['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com']:
    def reject(r,host=host):forbidden.append(host);r.abort()
    ctx.route('https://'+host+'/**',reject)
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(URL,wait_until='domcontentloaded');expect(p.locator('#gate')).to_be_hidden(timeout=45000);assert p.evaluate("import('./js/sync.js').then(m=>m.auth.app.options.projectId)")=='demo-plantometro';p.evaluate("async()=>{window.socialActivity=await import('./js/activity.js');}");return ctx,p,prefs
  ac,a,aprefs=context('social-owner','Frank',390);bc,b,bprefs=context('social-owner','Rosita',768);cc,c,_=context('social-other','Otra cuenta',390)
  expect(a.locator('.card')).to_have_count(1);expect(b.locator('.card')).to_have_count(1);expect(c.locator('.card')).to_have_count(0)
  expect(a.locator('#activity-status')).to_contain_text('Cambios recientes',timeout=30000);expect(b.locator('#activity-status')).to_contain_text('Cambios recientes',timeout=30000)
  expect(a.locator('#activity-badge')).to_be_hidden();expect(b.locator('#activity-badge')).to_be_hidden();assert a.evaluate('localStorage.getItem("pg3_device_id")')!=b.evaluate('localStorage.getItem("pg3_device_id")');assert 'sin apodo' in a.locator('.last-change').inner_text()
  print('PASS baseline: 100 historical fixtures, no unread; separate device ids, legacy author honest',flush=True)
  def events(p):return p.evaluate("import('./js/activity.js').then(m=>m.activities.filter(e=>!e.id.startsWith('fixture-')))")
  def wait_events(p,n):p.evaluate("async()=>{window.socialActivity=await import('./js/activity.js');}");p.wait_for_function("n=>window.socialActivity.activities.filter(e=>!e.id.startsWith('fixture-')).length===n",arg=n,timeout=30000)
  def confirmed(p):expect(p.locator('#sync-status')).to_contain_text('confirmados en la nube',timeout=30000)
  if not os.environ.get('PLANTOMETRO_SOCIAL_BACKUP_ONLY'):
   a.locator('[data-water=bob]').click();confirmed(a);wait_events(b,1);expect(b.locator('#activity-badge')).to_have_text('1');expect(a.locator('#activity-badge')).to_be_hidden();expect(b.locator('.last-change')).to_contain_text('Frank la regó')
   b.locator('#activity-btn').click();expect(b.locator('#activity-list')).to_contain_text('Nueva');b.locator('#activity-read-all').click();expect(b.locator('#activity-badge')).to_be_hidden();b.locator('#activity-modal .xbtn').click()
   a.evaluate("import('./js/plants.js').then(m=>{void m.water('bob')})");b.evaluate("import('./js/plants.js').then(m=>{void m.water('bob')})");wait_events(a,3);wait_events(b,3);confirmed(a);confirmed(b)
   history=b.evaluate("import('./js/sync.js').then(m=>m.plants[0].history)");assert len(history)==4;rosita_id=next(h['eventId'] for h in history if h.get('by')=='Rosita');frank_id=next(h['eventId'] for h in history if h.get('by')=='Frank')
   expect(a.locator('#activity-badge')).to_have_text('1');expect(b.locator('#activity-badge')).to_have_text('1');a.locator('#activity-btn').click();a.locator('#activity-read-all').click();a.locator('#activity-modal .xbtn').click();expect(b.locator('#activity-badge')).to_have_text('1')
   b.evaluate("import('./js/plants.js').then(m=>{void m.fertilize('bob')})");wait_events(a,4);assert a.evaluate("import('./js/plants.js').then(m=>m.correctWater('bob',"+json.dumps(frank_id)+"))");wait_events(b,5)
   after=b.evaluate("import('./js/sync.js').then(m=>m.plants[0])");assert any(h.get('eventId')==rosita_id for h in after['history']) and any(h['t']=='abono' for h in after['history']);assert after['fertFreq']==0
   assert not a.evaluate("import('./js/plants.js').then(m=>m.correctWater('bob',"+json.dumps(frank_id)+"))");wait_events(b,5)
   print('PASS concurrent water/abono/correction: other actions retained, repeated correction no duplicate, read state per device',flush=True)
   ac.set_offline(True);a.locator('[data-water=bob]').click();expect(a.locator('#sync-status')).to_contain_text('pendientes en este dispositivo');a.wait_for_timeout(600);assert len(events(b))==5
   ac.set_offline(False);confirmed(a);wait_events(b,6);wait_events(a,6);a.reload();expect(a.locator('#gate')).to_be_hidden(timeout=30000);wait_events(a,6);assert len({e['id'] for e in events(a)})==6
   print('PASS offline queue/reconnect/reload: one confirmed event, no duplicate or premature announcement',flush=True)
   a.locator('.fab').click();a.locator('#f-name').fill('Nueva de prueba');a.locator('#f-save').click();confirmed(a);wait_events(b,7);created=a.locator('.card').filter(has_text='Nueva de prueba').get_attribute('data-plant')
   a.locator('[data-open="'+created+'"]').click();a.locator('#d-manage-section > summary').click();a.locator('#d-edit').click();a.locator('#f-save').click();wait_events(b,7)
   a.locator('[data-open="'+created+'"]').click();a.locator('#d-manage-section > summary').click();a.locator('#d-edit').click();a.locator('#f-name').fill('Nombre cambiado');a.locator('#f-save').click();confirmed(a);wait_events(b,8)
   a.locator('[data-open="'+created+'"]').click();a.locator('#d-photo-section > summary').click();a.locator('.gadd').click();a.locator('#g-file').set_input_files(str(ROOT/'preview-assets/ficus.jpg'));confirmed(a);wait_events(b,9);expect(a.locator('#d-gal .gph')).to_have_count(1)
   a.locator('#d-gal .gph').click();a.locator('#pm-del').click();confirmed(a);wait_events(b,10);expect(a.locator('#photo-modal')).to_be_hidden()
   a.locator('#d-manage-section > summary').click();a.once('dialog',lambda d:d.dismiss());a.locator('#d-del').click();wait_events(b,10);a.once('dialog',lambda d:d.accept());a.locator('#d-del').click();confirmed(a);wait_events(b,11);expect(b.locator('.card')).to_have_count(1);assert any(e['type']=='deleted' and e['plantId']==created for e in events(b))
   # Both devices queue deletion before receiving the other's snapshot.
   a.locator('.fab').click();a.locator('#f-name').fill('Borrado concurrente');a.locator('#f-save').click();confirmed(a);wait_events(b,12);concurrent=a.locator('.card').filter(has_text='Borrado concurrente').get_attribute('data-plant')
   ac.set_offline(True);bc.set_offline(True)
   for page in [a,b]:page.evaluate("id=>import('./js/sync.js').then(m=>{void m.removePlant(id)})",concurrent);expect(page.locator('#sync-status')).to_contain_text('pendientes en este dispositivo')
   ac.set_offline(False);confirmed(a);wait_events(a,13);bc.set_offline(False);expect(b.locator('#sync-status')).to_contain_text('ya no existe',timeout=30000);wait_events(b,13);expect(a.locator('.card')).to_have_count(1);expect(b.locator('.card')).to_have_count(1)
   assert len([e for e in events(b) if e['type']=='deleted' and e['plantId']==concurrent])==1
   print('PASS concurrent queued deletions: one winner/event; second rejected without resurrection or false confirmation',flush=True)
  baseline=len(events(b))
  # Backup validation precedes every write; a restore is one shared event.
  a.locator('#settings-btn').click();a.locator('#acc-btn').click()
  with a.expect_download() as download:a.get_by_role('button',name='Descargar copia de seguridad').click()
  backup=json.loads(Path(download.value.path()).read_text());original_copy=backup['plants'][0];assert original_copy['futureField']=='preserved' and len(original_copy['gallery'])==1 and original_copy['photo'].startswith('data:image/')
  restored={**original_copy,'id':'restored-social','name':'Copia restaurada de prueba'}
  invalid=[restored,{'id':'incomplete','name':'No incorporar'}]
  a.locator('#backup-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()});expect(a.locator('#toast')).to_contain_text('No se restauró ninguna ficha');wait_events(b,baseline+0);expect(b.locator('.card')).to_have_count(1)
  def copy_file():a.locator('#backup-file').set_input_files({'name':'copy.json','mimeType':'application/json','buffer':json.dumps([restored]).encode()})
  a.once('dialog',lambda d:d.dismiss());copy_file();wait_events(b,baseline+0);a.once('dialog',lambda d:d.accept());copy_file();confirmed(a);wait_events(b,baseline+1);expect(b.locator('.card')).to_have_count(2)
  saved=b.evaluate("import('./js/sync.js').then(m=>m.plants.find(p=>p.id==='restored-social'))");assert saved==restored;assert events(b)[0]['type']=='restored'
  a.evaluate("import('./js/sync.js').then(m=>m.removePlant('restored-social'))");wait_events(b,baseline+2);expect(b.locator('.card')).to_have_count(1)
  a.locator('[data-water=bob]').click();confirmed(a);wait_events(b,baseline+3);expect(a.locator('#toast button')).to_have_text('Deshacer');a.locator('#toast button').click();wait_events(b,baseline+4);assert events(b)[0]['type']=='corrected',[(e['type'],e['plantId']) for e in events(b)]
  print('PASS backup export/photos/history/extras, invalid and cancelled restore no writes, valid atomic restore with one event; visible Undo corrects exactly its watering',flush=True)
  assert a.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==aprefs;assert b.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==bprefs;assert b.evaluate("import('./js/sync.js').then(m=>m.plants[0].futureField)")=='preserved';assert b.evaluate("import('./js/sync.js').then(m=>m.plants[0].gallery.length)")==1
  print('PASS create/edit/no-op, diary add/remove, delete/cancel; photos/history/preferences and optional fertilizer retained',flush=True)
  dc,d,_=context('no-activity','Sin permiso',390);expect(d.locator('.card')).to_have_count(1);d.locator('[data-water=bob]').click();expect(d.locator('#sync-status')).to_contain_text('rechazó el permiso',timeout=30000);expect(d.locator('.last-change')).to_contain_text('sin apodo');assert d.evaluate("import('./js/sync.js').then(m=>m.plants[0].history.length)")==1;assert not events(d);expect(d.locator('[data-water=bob]')).to_be_enabled();d.locator('[data-water=bob]').click();expect(d.locator('#sync-status')).to_contain_text('rechazó el permiso');expect(d.locator('[data-water=bob]')).to_be_enabled();assert d.evaluate("import('./js/sync.js').then(m=>m.plants[0].history.length)")==1
  a.locator('#settings-btn').click();a.locator('#acc-btn').click();a.get_by_role('button',name='Cerrar sesión').click();expect(a.locator('#gate')).to_be_visible();expect(a.locator('#activity-list')).not_to_contain_text('Bob');expect(a.locator('#activity-badge')).to_be_hidden();expect(c.locator('.card')).to_have_count(0);assert a.evaluate('localStorage.getItem("pg3_cache_social-owner")') is None
  assert not forbidden;assert not errors,'Browser errors: '+str(errors);print('PASS atomic permission rejection, account isolation, logout; no production Firebase requests or JS errors',flush=True)
  ac.close();bc.close();cc.close();dc.close();browser.close()
finally:server.shutdown()
