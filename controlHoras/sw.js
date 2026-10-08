// UI release: keep all records/preferences in localStorage and other apps' caches.
const CACHE='horas-v2-ui-20261008';
const SHELL=['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
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
  const dependency=['www.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname)&&/firebasejs\/10\.14\.1\/|\/npm\/chart\.js|\/pdf\.js\/2\.16\.105\//.test(url.pathname);
  if(!local&&!dependency)return;
  event.respondWith(fetch(req).then(response=>{
    if(response.ok){const cloned=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,cloned)).catch(()=>{}));}
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(req);if(cached)return cached;
    if(req.mode==='navigate'&&local){const shell=await cache.match(new URL('./index.html',scope));if(shell)return shell;}
    return Response.error(); // Never return HTML for a missing script/resource.
  }));
});
