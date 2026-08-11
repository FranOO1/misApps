/* Parte del día — service worker
   ⚠️ Sube CACHE_VERSION en cada deploy, como siempre. */
const CACHE_VERSION = 'parte-v1';
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca interceptar: Firebase, Gemini, Google Auth ni nada que no sea GET
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('firebaseapp.com')) return;
  if (url.hostname.includes('gstatic.com')) return;
  if (url.hostname.includes('firestore')) return;

  // App shell (mismo origen): red primero, caché de respaldo.
  // Así los deploys se ven a la primera y sin conexión sigue abriendo.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copia));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./')))
    );
    return;
  }

  // Resto (fuentes, etc.): caché primero
  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(res => {
        const copia = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, copia));
        return res;
      })
    )
  );
});
