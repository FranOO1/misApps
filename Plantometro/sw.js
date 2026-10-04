// App files and static SDKs only; account data remains in Firebase's own cache.
const CACHE = "plantometro-v19";
const CORE = ["./", "./index.html", "./manifest.json", "./styles.css",
  "./js/backup.js", "./js/app.js", "./js/utils.js", "./js/settings.js", "./js/sync.js", "./js/weather.js", "./js/plants.js", "./js/photos.js", "./js/gemini.js", "./js/camera.js", "./js/ui.js",
  "./js/ai-config.js", "./js/ai-service.js", "./js/pwa.js", "./js/activity.js", "./js/activity-model.js", "./js/weather-model.js", "./js/weather-effects.js", "./shared/ai-response.js", "./shared/ai-input.js",
  "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js", "https://www.gstatic.com/firebasejs/12.10.0/firebase-ai.js",
  "https://www.gstatic.com/firebasejs/12.10.0/firebase-functions.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith("plantometro-") && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const app=url.origin===self.location.origin&&url.pathname.startsWith(new URL('./',self.location.href).pathname);
  const sdk=url.hostname==='www.gstatic.com'&&url.pathname.startsWith('/firebasejs/');
  if(!app&&!sdk)return; // Weather, Auth, AI and garden data always use their own network/storage.
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(e.request,{ignoreSearch:true});
    if(saved)return saved; // Keep HTML/modules from the same atomically installed version.
    const response=await fetch(e.request);
    if(response.ok)e.waitUntil(cache.put(e.request,response.clone()).catch(()=>{}));
    return response;
  })());
});
