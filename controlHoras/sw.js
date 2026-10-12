// UI release: keep all records/preferences in localStorage and other apps' caches.
const CACHE='horas-v8-gemini-20261012';
const BASE_SHELL=['./index.html','./manifest.json','./icon-192.png','./icon-512.png','./core.js','./reports.js','./sync.js','./ai-data.js','./ai-config.js','./ai-service.js','./app-check-diagnostic.js'];
const SHELL=[...BASE_SHELL,...BASE_SHELL.filter(path=>path.endsWith('.js')).map(path=>path+'?v=8')];
const WARM=['firebase-app-compat','firebase-auth-compat','firebase-firestore-compat'].map(name=>`https://www.gstatic.com/firebasejs/12.14.0/${name}.js`);
const isDependency=url=>['www.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname)&&/firebasejs\/12\.14\.0\/|\/npm\/chart\.js|\/pdf\.js\/4\.10\.38\//.test(url.pathname);
const usable=response=>response.type==='opaque'||response.ok&&!/text\/html/i.test(response.headers.get('content-type')||'');
async function warmDependencies(cache) {
  // Public SDK code only: no Auth, Firestore or AI request. Failure cannot
  // prevent installation of the local app or wait indefinitely for a CDN.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{await Promise.allSettled(WARM.map(async url=>{const req=new Request(url,{cache:'reload',credentials:'omit',signal:controller.signal}),response=await fetch(req);if(usable(response))await cache.put(req,response);}));}
  finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{await cache.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));await warmDependencies(cache);}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),old=(await caches.keys()).filter(key=>key.startsWith('horas-v')&&key!==CACHE);
    for(const key of old){
      // Keep previously cached matching SDKs if the upgrade happened offline.
      // Never carry over an old app shell or private API responses.
      try{const previous=await caches.open(key);for(const req of await previous.keys())if(isDependency(new URL(req.url))&&!await cache.match(req)){const response=await previous.match(req);if(response&&usable(response))await cache.put(req,response);}}catch{}
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url),scope=new URL(self.registration.scope);
  if(req.method!=='GET')return;
  const local=url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);
  const dependency=isDependency(url);
  if(!local&&!dependency)return;
  event.respondWith(fetch(req).then(response=>{
    const codeResource=['script','worker','style'].includes(req.destination)||/\.(?:js|mjs|css|json)$/.test(url.pathname);
    if(response.type!=='opaque'&&req.mode!=='navigate'&&(!response.ok||(codeResource&&/text\/html/i.test(response.headers.get('content-type')||''))))throw new Error('Resource unavailable');
    if(response.ok||response.type==='opaque'){const cloned=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,cloned)).catch(()=>{}));}
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(req);if(cached)return cached;
    if(req.mode==='navigate'&&local){const shell=await cache.match(new URL('./index.html',scope));if(shell)return shell;}
    return Response.error(); // Never return HTML for a missing script/resource.
  }));
});

