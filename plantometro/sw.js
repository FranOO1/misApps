self.addEventListener('install', (e) => {
    console.log('[Plant Guardian] Service Worker instalado');
});

self.addEventListener('fetch', (e) => {
    // Escucha pasiva para cumplir los requisitos PWA de Chrome
});
