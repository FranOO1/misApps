# Plantómetro: estructura y comprobación

Aplicación estática, sin framework ni paso de compilación. GitHub Pages sirve los
archivos directamente desde `Plantometro/`; todas las rutas propias son relativas.

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura de la página y formularios; acciones declaradas con `data-action`. |
| `styles.css` | Diseño, temas claro y oscuro y adaptación a móvil/tablet. |
| `js/app.js` | Arranque y conexión de eventos con los módulos. |
| `js/utils.js` | Fechas, texto seguro y constantes compartidas. |
| `js/ui.js` | Tarjetas, calendario, ficha, modales y avisos. |
| `js/plants.js` | Formulario, revisiones de humedad, registro de riegos/abonos y copias. |
| `js/backup.js` | Validación completa de copias antes de restaurarlas. |
| `js/photos.js` | Compresión de imágenes y diario fotográfico. |
| `js/weather.js` | Ciudad/GPS, previsión y contexto para plantas de exterior. |
| `js/gemini.js` | Identificación, sugerencias editables y diagnóstico. |
| `js/settings.js` | Preferencias locales, apodo, tema y notificaciones. |
| `js/sync.js` | Configuración existente de Firebase, sesión Google y Firestore. |
| `sw.js`, `manifest.json` | Caché y configuración de instalación de la PWA. |

Los módulos usan importaciones ES nativas. Hay referencias entre interfaz y
operaciones de datos: el arranque solo se ejecuta en `app.js`, después de cargar
los módulos, para evitar ejecutar funciones antes de inicializar sus dependencias.

## Compatibilidad

- Se mantienen el proyecto Firebase, el login Google, la colección
  `users/{uid}/plants/{id}`, identificadores y campos de las plantas, fotos,
  historial y formato de copias. Editar conserva también campos adicionales.
- `waterFreq` sigue siendo el mismo campo, ahora presentado como intervalo
  orientativo para revisar humedad. La fecha no es una orden de regar.
- El modo verano conserva su preferencia pero aporta contexto: ya no reduce
  automáticamente el intervalo. Se puede modificar la frecuencia en cada ficha.
- Una planta nueva sin fecha de último riego usa `createdAt` como referencia
  para las revisiones y no inventa un riego. Los riegos existentes no se alteran.
- Gemini muestra las propuestas y la incertidumbre sin cambiar el formulario.
  Cada campo se selecciona y puede corregirse antes de usarlo; se guarda con el
  botón habitual. La revisión de fichas existentes usa el mismo flujo.
- La clave de Gemini sigue en las preferencias del dispositivo; no se guarda en
  Firebase ni en el repositorio, no se imprime y se envía como cabecera al servicio.
- La caché `plantometro-v10` incluye HTML, CSS, todos los módulos y los tres SDK
  Firebase de la versión ya utilizada. Solo elimina cachés `plantometro-*`;
  conserva las de las otras aplicaciones en el mismo origen. No cachea llamadas
  Gemini, autenticación, datos Firestore ni previsiones.

## Pruebas reproducibles

Desde la raíz del repositorio:

```sh
for file in Plantometro/js/*.js Plantometro/sw.js; do node --check "$file" || exit 1; done
node --experimental-vm-modules Plantometro/tests/modules.mjs
python Plantometro/tests/ui_smoke.py
```

La prueba de módulos utiliza Node, un adaptador DOM y servicios simulados. Comprueba
la carga conjunta y el arranque, añadir/editar, sugerencias explícitas y corregibles,
descartar, conservar historial y campos, rutas Firebase, clima solo para exterior,
frecuencia manual y ciclo de caché con todas las rutas propias existentes.

La prueba de navegador necesita Python Playwright y Chromium (`CHROMIUM_PATH`
permite elegir el ejecutable). Levanta un servidor HTTP local y comprueba 320×740,
390×844, 768×1024 y 820×1180, ambos temas, texto largo, fotos, riego/deshacer,
calendario, clima, sugerencias y caché/PWA. Las capturas quedan en
`/tmp/plantometro-tests` (configurable con `PLANTOMETRO_TEST_OUTPUT`).

**Validación realizada en este cambio:** sintaxis de todos los módulos y worker,
prueba de módulos completa y contraste de los colores de texto sobre las tres
superficies: mínimo 5,58:1 en claro y 7,20:1 en oscuro (referencia AA: 4,5:1).

**Validación de navegador realizada:** la suite Chromium pasa en 320×740,
390×844, 768×1024 y 820×1180: abrir, añadir/editar, fotos, sugerencias por
nombre/foto, corrección y descarte, riego/deshacer, historial, clima, calendario,
ambos temas y contraste. También pasa registro del worker v10, caché de la app,
apertura sin conexión, manifest standalone y conservación de cachés de otras apps.
Se revisaron las capturas generadas; la prueba usa datos y servicios simulados.

**Pendiente en dispositivos reales:** verificar el login Google, una respuesta
real de Gemini y la instalación en vuestros móviles. Las pruebas no escriben en
el jardín de producción ni utilizan una clave real de Gemini.

## Correcciones del PR #1

- Búsqueda y filtros comparten resultados en tarjetas y Semana. «Hoy y pendientes»
  incluye revisiones de hoy y anteriores; «Días anteriores» muestra solo atrasadas.
  Los filtros se distribuyen en varias filas en móvil. Contadores y avisos distinguen
  singular y plural; el aviso abre la ficha o el conjunto de revisiones pendientes.
- Las fechas se calculan por días de calendario UTC, sin errores de horario de
  verano. El ejemplo sintético de 84 días desde el riego con frecuencia de 7 días
  produce 77 días de revisión pendiente; no demuestra falta de agua. No se ha
  consultado ni modificado la ficha real de Bob.
- La memoria y la copia local de la cuenta se limpian al cerrar sesión. Las copias
  locales llevan UID y las respuestas asíncronas verifican la sesión original.
- Guardar/eliminar diferencia permisos, sesión caducada, límites y servicio no
  disponible. Un rechazo revierte el cambio optimista; estar sin conexión muestra
  un estado pendiente, no una confirmación de escritura.
- Restaurar valida toda la copia, sus fechas, fotos, historial, tamaños e IDs antes
  de escribir. Una copia inválida se rechaza íntegra. Las fichas seleccionadas se
  envían en un único batch atómico (máximo 400); se informa de las fichas conservadas.
- Los riegos nuevos añaden un identificador y referencias a su estado anterior en
  el historial existente. «Corregir este riego» sigue disponible en la ficha después
  del aviso; una transacción elimina únicamente ese registro y conserva abonos y
  riegos posteriores. Las fichas antiguas siguen abriendo sin migración.
- No se recortan automáticamente fotos ni historial. Una ficha demasiado grande
  se rechaza con un aviso para conservar una copia antes de reducir su contenido.

Las regresiones adicionales del navegador se ejecutan en 390×844 y 768×1024:
permisos de escritura/eliminación, restauración inválida y batch fallido, cambio de
cuenta, filtros en ambas vistas, corrección precisa de dos riegos con abono, diario
con siete fotos, GPS, exportación y reapertura de una revisión Gemini guardada.
Firebase, autenticación, clima, geocodificación y Gemini se simulan. El navegador,
DOM, almacenamiento, service worker, manifest y apertura sin conexión son reales
en Chromium local; la instalación y los servicios en dispositivos reales quedan
pendientes.

## Demostración sin fusionar

Ver [PREVIEW.md](PREVIEW.md). `scripts/build_preview.py` genera `preview.html`
con los módulos y estilos actuales y adaptadores simulados. No contiene la
configuración Firebase ni una clave real; no usa datos del jardín ni permite
probar autenticación, servicios o instalación reales. Regenerar tras cambiar los
módulos: `python Plantometro/scripts/build_preview.py`.
