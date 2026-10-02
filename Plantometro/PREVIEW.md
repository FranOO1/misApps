# Probar el PR #1 desde móvil o tablet

La dirección publicada https://franoo1.github.io/misApps/Plantometro/ sirve
`main`, no esta rama. El punto rojo y «debía regarse» corresponden a la versión
antigua. Recargar una PWA instalada no publica el contenido del PR.

## Demostración de esta rama

Abrir en Chrome de Android o en el navegador de la tablet:

https://htmlpreview.github.io/?https://github.com/FranOO1/misApps/blob/improve/plantometro-humidity-design/Plantometro/preview.html

La franja superior identifica la demostración; «Sobre esta prueba» explica qué se simula. Permite probar la portada mínima,
formularios, sugerencias, diario y correcciones con datos simulados. Bob
es un ejemplo calculado para mostrar 77 días de revisión pendiente en su ficha; no es vuestra
ficha. No escribir claves reales ni esperar sincronización con vuestro jardín.
La página no registra el service worker ni prueba la instalación PWA.

Si el visor externo no carga, descargar `preview.html` desde esta rama y abrirlo
como archivo HTML en el navegador. La demostración es autocontenida.

## Servicios reales y PWA

La aplicación del PR es `index.html` y sus módulos; la demostración no sustituye
su validación real. Para una prueba con Google/Firebase hace falta servir esta
rama en un origen HTTPS controlado y autorizado en Firebase. No se debe autorizar
el dominio compartido del visor para iniciar sesión. La publicación GitHub Pages
actual permanece en `main` y el PR no se fusiona.

Pendientes: login real, reglas/escritura y sincronización entre vuestros móviles,
Gemini con vuestra clave, clima/GPS real, instalación/actualización y uso sin
conexión en Android/tablet, y fecha/frecuencia reales de Bob. Las suites locales
usan servicios simulados y no alteran datos de producción.

## Lo habitual, en uno o dos toques

- Registrar un riego: «Ya la he regado», desde la tarjeta. Deshacer desde el aviso.
- Abrir una ficha: tocar la foto o el nombre. Cerrar si no hace falta agua, sin
  registrar una revisión ni posponer.
- Añadir: botón «+ Añadir planta», escribir nombre/frecuencia y guardar; la foto
  es opcional. Más detalles y Gemini se usan solo si hacen falta.
- Clima o cuenta/copias: Ajustes y la opción correspondiente.

Se han retirado la vista semanal, filtros, contadores, grandes avisos y botones
secundarios de la portada. El campo de búsqueda permanece cerrado; con nueve
plantas o más aparece un acceso discreto en la cabecera, además de Ajustes.
