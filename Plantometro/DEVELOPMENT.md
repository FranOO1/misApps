# Plantómetro: estructura y comprobación

Cliente estático, sin framework ni compilación. GitHub Pages sirve rutas relativas;
`index.html` contiene la estructura. El servidor de IA se despliega aparte y está
desactivado en esta rama.

| Archivo | Responsabilidad |
| --- | --- |
| `styles.css` | Portada, temas, contraste y adaptación táctil. |
| `js/app.js` | Arranque y eventos. |
| `js/pwa.js` | Actualización segura al terminar formularios, guardados y deshacer. |
| `js/utils.js` | Fechas, texto seguro y dibujo vegetal sin foto. |
| `js/ui.js` | Portada, búsqueda discreta, ficha y ventanas. |
| `js/plants.js` | Formulario, recordatorios, riegos, abono y corrección de historial. |
| `js/backup.js` | Validación completa de copias y restauración atómica. |
| `js/photos.js` | Compresión, vista previa y diario fotográfico. |
| `js/weather.js` | Ciudad/GPS y contexto exterior; validación de respuestas. |
| `js/gemini.js` | Consejos y sugerencias editables; guardado explícito. |
| `js/ai-service.js` | Callable autenticado, App Check y errores seguros. |
| `js/ai-config.js` | Activación, región y clave pública de App Check; nunca secretos. |
| `shared/ai-response.js` | Contrato de respuesta validado en cliente y servidor. |
| `js/settings.js` | Preferencias y borrado exclusivo de la antigua clave de Gemini. |
| `js/sync.js` | Firebase existente, Google, Firestore y caché por cuenta. |
| `server/` | Función autenticada, autorización, cuotas privadas y Vertex por IAM. |
| `sw.js`, `manifest.json` | Caché e instalación PWA. |
| `scripts/build_preview.py`, `preview-assets/` | Demostración autónoma simulada. |
| `tests/`, `server/tests/` | Navegador, módulos, migración y servicios locales. |

## Interfaz y datos

Se mantiene la portada: cabecera pequeña, una frase y tarjetas con foto, nombre,
recordatorio y «Ya la he regado». Foto y nombre abren ficha. «+ Añadir planta»
terracota ocupa una fila fija propia; la lista termina antes. Se oculta con las
ventanas. `visualViewport`, texto en `rem` y margen seguro reservan espacio.
Fotos completas (`contain`), o dibujo vegetal si faltan; no se sustituye la especie.

Clima/cuenta/copias quedan en Ajustes. Búsqueda a petición, con acceso adicional
pequeño desde nueve plantas. La ficha recoge detalles en desplegables. Crear pide
nombre, foto opcional y frecuencia; lo demás en «Más detalles». Selector oculto
tras «Añadir foto»/«Cambiar foto», vista previa conservada al cancelar.
«Recordarme cada 7 días» tiene una sola aclaración: «Comprueba la tierra antes de
regar».

No cambia Firebase ni `users/{uid}/plants/{id}`. Editar conserva campos desconocidos,
fotos e historial. `waterFreq` orienta cuándo comprobar; sin `lastWater` la referencia
es la creación y no se inventa un riego. Inspeccionar no escribe ni pospone. La
corrección durable elimina solo el evento elegido y conserva operaciones posteriores.

La IA nunca escribe en el jardín desde servidor. Sugerencias sin seleccionar pasan
al formulario solo al aceptar los campos elegidos/corregidos; guardar la planta
sigue siendo separado. Consejo/foto se guardan explícitamente. Se descartan consultas
tardías de otra ficha/sesión o de formularios cambiados. JSON antiguo se presenta
como texto legible sin reescribirlo.

Se elimina campo de clave y opción de notificaciones: no había avisos con app cerrada.
La migración borra solo `geminiKey`; incluso con escritura bloqueada carga preferencias
y no usa la clave. Worker `plantometro-v16`: shell, módulos, contrato compartido y SDK
estático; sin caché de respuestas IA, autenticación ni documentos Firestore; conserva
cachés ajenas. Instala el conjunto completo con descargas frescas y sirve HTML/módulos
de la misma versión; no mezcla la caché HTTP anterior. Comprueba actualizaciones al
abrir/volver y espera si hay formularios, escrituras pendientes o un aviso Deshacer.
Rutas y manifest siguen bajo `/misApps/Plantometro/`.

## Pruebas reproducibles

Node 22, Python Playwright, Chromium y Java 21 para Firestore.
`CHROMIUM_PATH` selecciona el navegador; `PLANTOMETRO_TEST_OUTPUT` cambia capturas
(por defecto `/tmp/plantometro-tests`). Desde raíz:

```sh
node --experimental-vm-modules Plantometro/tests/modules.mjs
node --experimental-vm-modules --test Plantometro/tests/migration.test.mjs
python Plantometro/scripts/build_preview.py
python -u Plantometro/tests/ui_smoke.py
python -u Plantometro/tests/security_ui.py
node --experimental-vm-modules Plantometro/tests/auth_cancel.mjs
python -u Plantometro/tests/pwa_update.py
python -u Plantometro/tests/pwa_real_sdk.py
```

Desde `Plantometro/`, con Node 22:

```sh
npm ci
npm run test:server
npm run test:integration
npm audit --omit=dev
```

La integración exige `demo-plantometro` y variables de emuladores; nunca se ejecuta
contra el jardín personal. SDK web real, Auth/Firestore locales, dos navegadores de
una cuenta desechable y otra cuenta aislada: sincronización, transacciones,
reconexión, fotos, copia/restauración y salida. No verifica Google OAuth ni Gemini.

UI: Chromium real, servicios adaptados, 320×740, 390×844, 768×1024 y 820×1180,
ambos temas. También 1024×768 y 768×640 para botón fijo, texto 200%, nombres largos,
cero/una/muchas plantas y margen seguro simulado 34 px. Reducir viewport simula
espacio del teclado, no abre Android. Contraste de texto/paleta ≥4,5:1 y acciones
principales ≥44 px.

Las reglas de prueba no se despliegan. El emulador utilizado no aplica reglas a
bases con nombre: contadores en colección privada de su base desechable predeterminada
solo en pruebas. Producción usa `plantometro-ai`; su IAM/aislamiento deben comprobarse
en Google. App Check positivo también requiere Google; el rechazo sin App Check sí
se ejecuta con middleware Functions real.

[TEST_MATRIX.md](TEST_MATRIX.md) detalla resultados y bloqueos por caso. Capturas de
[captures/](captures/) proceden del navegador con demostración, no de tu jardín.
[SECURE_AI.md](SECURE_AI.md) contiene configuración exacta pendiente. IA desactivada
hasta verificarla, sin afirmar que funciona con Google por pasar las simulaciones.

`tests/published_update.py` comprueba una actualización real de GitHub Pages en un
perfil sin sesión, conservando preferencias y una ficha local desechable.
`js/pwa.js` arranca por separado desde HTML: los módulos antiguos recuperados
por la caché HTTP no pueden bloquear la instalación/recarga de la nueva versión. Espera
`/tmp/plantometro-pages-v16-ready` (o `PLANTOMETRO_RELEASE_SIGNAL`) antes de comprobar
la versión publicada. No usa adaptadores ni inicia sesión; prueba shell/SDK, clima
y caché offline, no CRUD de producción ni instalación física Android.
