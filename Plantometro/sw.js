// Plantómetro v2 — caché real para funcionar sin conexión
const CACHE = "plantometro-v14";
const CORE = ["./", "./index.html", "./manifest.json", "./styles.css",
  "./js/backup.js", "./js/app.js", "./js/utils.js", "./js/settings.js", "./js/sync.js", "./js/weather.js", "./js/plants.js", "./js/photos.js", "./js/gemini.js", "./js/ui.js",
  "./js/ai-config.js", "./js/ai-service.js", "./shared/ai-response.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith("plantometro-") && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // El clima siempre por red; lo demás: red y si falla, caché
  if (url.hostname.includes("open-meteo") || url.hostname.includes("googleapis") || url.hostname.includes("firebase") || url.hostname.includes("bigdatacloud")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      // Solo app y SDK estático; nunca datos, autenticación ni llamadas Gemini.
      if(r.ok && (url.origin === self.location.origin || (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")))){
        const copy = r.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{}));
      }
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch:true}))
  );
});
