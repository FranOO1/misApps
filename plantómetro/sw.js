self.addEventListener('install', (e) => {
    console.log('[Plant Guardian] Service Worker instalado');
});

self.addEventListener('fetch', (e) => {
    // Esto es un trabajador pasivo solo para cumplir el requisito de instalación de Chrome
});
