const CACHE='horas-v3-20261008';
const CORE=['./','./index.html','./app.js','./core.js','./sync.js','./ai-config.js','./ai-service.js','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('horas-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET')return;
  const local=url.origin===scope.origin && url.pathname.startsWith(scope.pathname);
  const dependency=['www.gstatic.com','cdnjs.cloudflare.com'].includes(url.hostname) && /firebasejs\/12\.10\.0\/|pdf\.js\/3\.11\.174\//.test(url.pathname);
  if(!local&&!dependency)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request);
    if(cached)return cached;
    try{const result=await fetch(request);if(result.ok && result.type!=='opaque')await cache.put(request,result.clone());return result;}
    catch{if(request.mode==='navigate'&&local){const shell=await cache.match(new URL('./index.html',scope));if(shell)return shell;}return Response.error();}
  })());
});
