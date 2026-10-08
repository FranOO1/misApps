# Publicación mínima pendiente de autorización

URL prevista: **https://franoo1.github.io/misApps/gemini-prueba/**. No se ha publicado.

La última ejecución correcta de GitHub Pages publica `main` en `https://franoo1.github.io/misApps/`: [ejecución 37140514786](https://github.com/FranOO1/misApps/actions/runs/37140514786), commit `a9c9382468e6b0bbdf15cad01a6ec2e8627288a2`. Esta propuesta no cambia el origen de publicación ni la configuración de Pages/Firebase.

## Cambio exacto que se autorizaría

Añadir a `main` únicamente estos **tres archivos nuevos**:

- `gemini-prueba/index.html`: página aislada, consulta fija y autorización explícita.
- `gemini-prueba/ai-service.js`: copia idéntica del cliente del PR #6.
- `gemini-prueba/ai-config.js`: copia idéntica de la configuración pública del PR #6, reutilizada de Plantómetro PR #4.

No se fusionan los PR #5 y #6. No se publica el resto de su código. La incorporación de estos tres archivos dispararía el despliegue de Pages existente; los archivos de Mis Horas y Plantómetro conservan sus contenidos. La carpeta queda fuera del ámbito `/misApps/controlHoras/` del service worker de Mis Horas. No se registra ningún service worker, manifiesto o caché de PWA para la prueba.

Antes de aplicar, comprobar de nuevo el estado de `main`; no sobrescribir cambios posteriores. La rama preparada parte de la versión publicada y su comparación contra `main` contiene únicamente los tres archivos enumerados.

## Visibilidad y datos

La página y sus tres archivos **serán públicos**, como el repositorio y GitHub Pages. `noindex` pide no indexar la página, pero no la hace privada. No se añade un enlace desde la app. Consultar Gemini requiere una sesión Firebase ya existente y atestación App Check válida; la página no inicia sesión, no cierra la sesión de la app y no amplía permisos ni reglas. No se afirma que el acceso esté restringido a una única cuenta.

Lee como texto el HTML público de la app actual para obtener sus seis campos de configuración Firebase. No ejecuta ese HTML. Firebase Auth reutiliza su propia sesión persistida en este navegador. No inicializa Firestore ni accede a los registros, tarifas, retenciones, preferencias o nóminas de Mis Horas.

Solo tras pulsar **«Autorizar consulta ficticia a Google»**, envía:

```json
{"fictitious":true,"calculated":{"recordedHours":8.25}}
```

Consulta fija: «Explica únicamente las 8,25 horas ficticias aportadas, sin calcular importes». El total se obtiene en JavaScript sumando 4 y 4,25, ambos ficticios. Se utiliza la misma instrucción del asistente de Mis Horas del PR #6. No hay campos editables, carga de documentos ni lectura de jornadas. Los tokens de autenticación y App Check se envían al servicio de Google como exige el SDK; los identificadores de cuenta no se añaden al prompt.

No se envía una consulta al abrir la página, no se reintenta automáticamente y no se guardan respuestas. La respuesta se inserta con `textContent` y se limpia al cambiar o cerrar sesión. No hay proveedor simulado ni debug token en los archivos publicables. No se activa facturación: la petición utilizará las condiciones y cuotas existentes del proyecto.

## Ejecución tras autorización

1. Publicar exclusivamente los tres archivos enumerados y esperar el despliegue de Pages.
2. Abrir la URL prevista en el mismo navegador donde ya exista la sesión de Mis Horas. Si no se encuentra esa sesión, el botón permanece deshabilitado; no se solicitan claves ni tokens.
3. Revisar la consulta ficticia y pulsar el botón de autorización una vez.
4. Conservar el texto de la respuesta o la referencia de error visible, que incluye código/estado HTTP cuando el SDK lo facilita. No copiar credenciales de las herramientas del navegador.

Una respuesta obtenida de esa página con sesión y atestación reales completaría la verificación pendiente. El HTTP 401 anterior, «Firebase App Check token is invalid», provenía de una petición sin token disponible: no demuestra por sí solo un fallo de la configuración actual. No se cambia la configuración sin una nueva evidencia concreta.

## Comprobación preparada

Los dos módulos copiados se comparan byte a byte con los del PR #6. Se mantienen las 24 pruebas previas. `tests/browser_probe.py` añade Chromium pequeño/tablet y SDKs oficiales reales: reutilización de sesión persistida del SDK 10 mediante SDK 12, ningún acceso a las claves locales de Mis Horas ni a Firestore, ausencia de envío antes del consentimiento, payload ficticio, texto seguro, error de App Check 401, cuota, desconexión y limpieza al cerrar sesión. **Autenticación, atestación y respuesta de modelo simuladas** en esta prueba automatizada; no constituye una consulta real a Gemini.

La publicación, la atestación en el dominio autorizado y la respuesta real siguen pendientes. No se ha ejecutado en un dispositivo Android físico. Para retirar la prueba posteriormente bastará eliminar sus tres archivos, conservando la app actual.
