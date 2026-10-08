// UI release: keep all records/preferences in localStorage and other apps' caches.
const CACHE='horas-v3-gemini-20261008';
const SHELL=['./index.html','./manifest.json','./icon-192.png','./icon-512.png','./ai-data.js','./ai-config.js','./ai-service.js'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('horas-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url),scope=new URL(self.registration.scope);
  if(req.method!=='GET')return;
  const local=url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);
  const dependency=['www.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname)&&/firebasejs\/(?:10\.14\.1|12\.10\.0)\/|\/npm\/chart\.js|\/pdf\.js\/4\.10\.38\//.test(url.pathname);
  if(!local&&!dependency)return;
  event.respondWith(fetch(req).then(response=>{
    const codeResource=['script','worker','style'].includes(req.destination)||/\.(?:js|mjs|css|json)$/.test(url.pathname);
    if(response.type!=='opaque'&&req.mode!=='navigate'&&(!response.ok||(codeResource&&/text\/html/i.test(response.headers.get('content-type')||''))))return Response.error();
    if(response.ok||response.type==='opaque'){const cloned=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,cloned)).catch(()=>{}));}
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(req);if(cached)return cached;
    if(req.mode==='navigate'&&local){const shell=await cache.match(new URL('./index.html',scope));if(shell)return shell;}
    return Response.error(); // Never return HTML for a missing script/resource.
  }));
});
