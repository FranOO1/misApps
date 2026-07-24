self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// cloudSave, primera línea:
if (!cloud.ready || !cloud.user || cloud.applyingRemote || !cloud.synced) return;

// startSync, tras cloud.status = "ok";
cloud.synced = true;

// logoutGoogle:
cloud.synced = false;
