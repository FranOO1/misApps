"""Real GitHub Pages + real browser/worker. Never signs into a personal account.
Run before publishing; signal readiness after Pages serves the new build by
creating the file in PLANTOMETRO_RELEASE_SIGNAL. No SDK or HTTP adapters.
"""
import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

URL='https://franoo1.github.io/misApps/Plantometro/'
signal=Path(os.environ.get('PLANTOMETRO_RELEASE_SIGNAL','/tmp/plantometro-pages-v16-ready'))
prefs={'name':'Prueba de caché','theme':'dark','city':'Granada','lat':37.1773,'lon':-3.5986,'geminiKey':'migration-test-only','unknownPreference':'keep'}
garden=[{'id':'local-only-fixture','name':'Dato local de prueba','waterFreq':7,'photo':'data:image/jpeg;base64,AAAA','gallery':[{'date':'2026-01-01','img':'data:image/jpeg;base64,AAAA'}],'history':[{'t':'agua','date':'2026-01-01'}]}]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':768,'height':1024})
    page=ctx.new_page();errors=[];ai_calls=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:ai_calls.append(True) if 'generativelanguage.googleapis.com' in r.url else None)
    page.goto(URL,wait_until='domcontentloaded',timeout=60000)
    expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=45000)
    assert page.evaluate("import('./js/sync.js').then(s=>s.auth.currentUser===null)")
    page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller',timeout=60000)
    assert 'plantometro-v15' in page.evaluate('caches.keys()'),'Start with the actual published previous cache'
    page.evaluate('''([prefs,garden])=>{localStorage.setItem('pg3b_settings',JSON.stringify(prefs));localStorage.setItem('pg3_cache_qa_only',JSON.stringify(garden));return caches.open('horas-v1');}''',[prefs,garden])
    print('READY real GitHub Pages PWA v15 installed; isolated browser, no authenticated garden',flush=True)
    deadline=time.monotonic()+1800
    while not signal.exists():
        if time.monotonic()>deadline:raise RuntimeError('Publication signal timeout')
        page.wait_for_timeout(500)
    page.reload(wait_until='domcontentloaded');expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=60000)
    page.wait_for_function("caches.keys().then(k=>k.includes('plantometro-v16')&&!k.includes('plantometro-v15'))",timeout=90000)
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>r.active===navigator.serviceWorker.controller)",timeout=30000)
    expect(page.locator('h1.brand')).to_have_text('Plantómetro')
    assert page.locator('#s-gkey').count()==0 and page.locator('#s-notif').count()==0
    assert 'Clave de Gemini' not in page.locator('body').inner_text()
    expected={k:v for k,v in prefs.items() if k!='geminiKey'}
    assert page.evaluate('JSON.parse(localStorage.getItem("pg3b_settings"))')==expected
    assert page.evaluate('JSON.parse(localStorage.getItem("pg3_cache_qa_only"))')==garden
    assert page.evaluate("import('./js/sync.js').then(s=>s.auth.currentUser===null)")
    assert 'horas-v1' in page.evaluate('caches.keys()')
    assert page.evaluate("import('./js/ai-config.js').then(s=>s.aiConfig.enabled===false)")
    expect(page.locator('#w-temp')).not_to_have_text('--°',timeout=45000)
    print('PASS published real app: v15→v16 worker, no Gemini key UI/calls, secret-only migration, local photo/history/preferences retained, unrelated cache retained, live weather',flush=True)
    ctx.set_offline(True);page.reload(wait_until='domcontentloaded');expect(page.get_by_role('button',name='Continuar con Google')).to_be_visible(timeout=45000)
    assert page.locator('#s-gkey').count()==0
    assert page.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r.active)")
    assert not ai_calls and not errors,'Unexpected browser errors: '+str(len(errors))
    print('PASS published shell offline with real cached Firebase SDK; no personal session, Android physical install not tested',flush=True)
    ctx.close();browser.close()
