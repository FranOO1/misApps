// Plantómetro v2 — caché real para funcionar sin conexión
const CACHE = "plantometro-v7";
const CORE = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // El clima siempre por red; lo demás: red y si falla, caché
  if (url.hostname.includes("open-meteo") || url.hostname.includes("googleapis") || url.hostname.includes("firebase") || url.hostname.includes("bigdatacloud")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch:true}))
  );
});
