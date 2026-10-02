# Plantómetro: estructura y comprobación

Aplicación estática, sin framework ni compilación. GitHub Pages sirve los archivos
con rutas relativas desde `Plantometro/`; `index.html` contiene la estructura.

| Archivo | Responsabilidad |
| --- | --- |
| `styles.css` | Jerarquía visual, temas y adaptación a móvil/tablet. |
| `js/app.js` | Arranque y conexión de eventos. |
| `js/utils.js` | Fechas por días de calendario, texto seguro y placeholder vegetal. |
| `js/ui.js` | Portada, fechas cotidianas, búsqueda opcional, ficha y modales. |
| `js/plants.js` | Formulario, pauta orientativa, riegos/abonos y copias. |
| `js/backup.js` | Validación completa de una copia antes de escribir. |
| `js/photos.js` | Compresión y diario fotográfico. |
| `js/weather.js` | Ciudad/GPS y contexto para exterior. |
| `js/gemini.js` | Propuestas editables, identificación y consulta de cuidados. |
| `js/settings.js` | Preferencias del dispositivo, apodo, tema y avisos opcionales. |
| `js/sync.js` | Proyecto Firebase existente, login Google y Firestore. |
| `sw.js`, `manifest.json` | Caché e instalación PWA. |
| `scripts/build_preview.py` | Genera una demostración autónoma con servicios simulados. |
| `preview-assets/` | Fotografías ilustrativas para la demostración. |

## Jerarquía actual

La portada muestra una cabecera pequeña, una frase y tarjetas: foto, nombre,
fecha y «Ya la he regado». Se ordenan por fecha de revisión, primero las pendientes,
luego hoy y finalmente próximas. Tocar la foto o el nombre abre la ficha.

Se retiran Semana, filas de filtros, estadísticas, anillos, avisos grandes, etiquetas
secundarias y el segundo botón por tarjeta. La búsqueda se abre desde Ajustes;
con nueve plantas o más aparece además un icono discreto en la cabecera. Nunca
se muestra el campo de búsqueda por defecto. Clima, cuenta y copias se abren desde
Ajustes. En la ficha hay una acción principal; fotos, cuidados, historial, Gemini y
edición se ordenan en desplegables nativos. Crear pide nombre, foto opcional y
frecuencia; los demás datos están en «Más detalles».

## Datos y comportamiento conservados

- Mismo proyecto Firebase, Google y `users/{uid}/plants/{id}`. Sin migración ni
  cambio de identificadores. Editar conserva campos adicionales, historial y fotos.
- `waterFreq` orienta cuándo mirar la tierra. No es una medida de humedad. Abrir
  una ficha y salir no escribe ni pospone nada; si no se riega, sigue pendiente.
- Una planta sin `lastWater` usa su fecha de creación como referencia. No se
  inventa un riego. Registrar actualiza fecha, apodo e historial y permite deshacer.
- La corrección durable de un riego nuevo sigue disponible en Historial después
  del aviso: una transacción elimina ese evento y conserva operaciones posteriores.
- Gemini no bloquea la creación: se revisan y seleccionan los campos antes de
  aplicarlos al formulario. La clave permanece en el dispositivo, fuera de Firebase
  y del repositorio; no se imprime ni se envía en URLs.
- El clima y el modo verano aportan contexto, sin modificar pautas ni registrar
  agua. La lluvia se contextualiza solo en fichas de exterior.
- Logout limpia memoria/copia local por UID. Respuestas tardías de otra sesión se
  descartan. Permisos, sesión y disponibilidad de Firestore tienen errores distintos.
- Restaurar valida íntegramente IDs, fechas, fotos, historial y tamaño; usa un batch
  atómico (máximo 400 plantas), con recuento de fichas conservadas. Se mantienen las
  copias v3 y los arrays legados válidos. No se recortan fotos/historial automáticamente.
- Worker `plantometro-v11`: cachea estructura, estilos, módulos y SDK estático;
  solo limpia cachés `plantometro-*`. No cachea servicios, login ni datos Firestore.

## Pruebas reproducibles

Desde la raíz del repositorio:

```sh
for file in Plantometro/js/*.js Plantometro/sw.js; do node --check "$file" || exit 1; done
node --experimental-vm-modules Plantometro/tests/modules.mjs
python Plantometro/scripts/build_preview.py
python Plantometro/tests/ui_smoke.py
```

La prueba Node carga el grafo real de módulos con un DOM mínimo y adaptadores
simulados. Verifica añadir/editar, propuestas Gemini seleccionadas/corregidas y
descarte, preservación de datos, fechas, validación de copias, rutas y worker.

La suite de navegador usa Python Playwright y Chromium (`CHROMIUM_PATH` permite
seleccionar ejecutable). Ejecuta 320×740, 390×844, 768×1024 y 820×1180, temas
claro/oscuro, nombres largos, contraste de textos, abrir/añadir/editar, fotos,
Gemini por nombre/foto, riego/deshacer y clima desde Ajustes. Las capturas se guardan
en `/tmp/plantometro-tests` o `PLANTOMETRO_TEST_OUTPUT`.

Regresiones en 390×844 y 768×1024: corrección específica tras cinco segundos con
dos riegos y abono, permisos de escritura/eliminación, restauración inválida y
batch fallido, exportación, siete fotos conservadas, GPS, revisión guardada, logout,
cambio de cuenta y respuestas tardías. La suite también comprueba el orden de las
plantas, búsqueda pequeña/grande, que inspeccionar no escriba ni posponga, y que
una planta nueva no tenga riego inventado. La demostración autónoma se prueba sin
red, con fotos embebidas, en los cuatro tamaños y ambos temas.

El navegador, DOM, almacenamiento y ciclo del worker son reales en Chromium local.
La suite comprueba shell sin conexión, manifest standalone y caché de otras apps.
Autenticación, Firebase, Gemini, clima y GPS se simulan: no se escribe en producción.

**Pendiente real:** Google y reglas/escrituras Firestore con vuestra cuenta,
sincronización entre móviles, Gemini con clave real, clima/GPS y la instalación,
actualización y uso offline en Android/tablet. Los 77 días de Bob se comprueban
con un ejemplo; falta verificar fecha/frecuencia reales y fecha de la captura.

## Demostración sin fusionar

Ver [PREVIEW.md](PREVIEW.md). Regenerar `preview.html` tras modificar código o
estilos. No contiene configuración Firebase ni una clave real; todos sus servicios
se simulan. Sus fotografías ilustrativas están documentadas en
[preview-assets/README.md](preview-assets/README.md) y se embeben en el HTML. No
sustituyen las fotos de los usuarios. La página no instala un service worker.
