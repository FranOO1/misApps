# Matriz: Gemini y nombre por cuenta/dispositivo

Base: PR #3, commit `4d0adc6`; main inicial `a9c9382`. Jardines y cuentas de
prueba aislados. Ninguna lectura/escritura del jardín personal. Ningún despliegue,
activación de facturación ni consulta real a Gemini. Vista previa: todos los
servicios y datos son simulados; no equivale a producción.

| Caso | Método | Resultado / límite |
|---|---|---|
| Primer acceso: pregunta exacta, Continuar, nombre discreto | Probado en navegador Chromium, SDK simulado, 320/390/768 | Pasa; persiste por UID local, no pregunta al recargar |
| Migración de apodo existente, sesión inicial cerrada, cambio de cuenta | Probado con módulos reales/adaptador y navegador | Pasa; una sola cuenta hereda el apodo antiguo, otra no; preferencias y jardín intactos |
| Dos dispositivos mismo UID con Frank/Rosita; otra cuenta | Probado con Auth/Firestore oficiales locales y SDK real 12.10 | Pasa; autores locales y jardín aislado, sincronización en dos perfiles |
| Alta manual, foto, edición, riego/deshacer, reconexión, copia, borrado/logout | Probado con servicios locales Auth/Firestore y navegador | Pasa; datos de prueba, campos extra/fotos/historial conservados |
| Alta con nombre, foto, sugerencias aceptadas/corregidas/descartadas | Probado en navegador, proveedor simulado | Pasa; no sobrescribe ni guarda sin selección explícita; abono opcional |
| SDK oficial Firebase AI Logic y autenticación | Probado con SDK real, Auth local, respuesta HTTP de modelo y App Check adaptados | Pasa; ID token Firebase en petición, prompt y respuesta validados; NO consulta Gemini real |
| AI Logic: 429, JSON inválido, sin conexión | SDK oficial + respuestas HTTP simuladas + navegador offline | Pasa; mensajes legibles, formulario intacto; sin reintento automático |
| Callable alternativa: Auth, usuario Google nuevo sin custom claim, cuenta deshabilitada | Servicios locales Auth/Firestore, proveedor simulado | Pasa; Google vinculado válido sin lista manual; deshabilitado/otro proveedor rechazados |
| App Check ausente | Middleware callable real en local | Pasa: rechaza; atestación válida y configuración AI Logic producción pendientes |
| Cuotas diarias, concurrencia y lease alternativa | Firestore local real | Pasa; una reserva ganadora, cuotas atómicas y lectura propia, jardín sin cambios |
| Revisión contextual: nombre/especie/luz/ubicación/notas/historial | Unitarias + transporte SDK real con modelo simulado | Pasa: datos acotados, sin autores/identidad de cuenta; no escribe automáticamente |
| Fotografías anteriores y diagnóstico legible | Unitarias y navegador, modelo simulado | Pasa: dos fotos anteriores pequeñas como máximo, fechas/notas; secciones legibles; no JSON crudo |
| Clima contextual | Revisado en código y navegador simulado | Solo lectura actual aproximada reciente y localidad/coordenadas coincidentes; sin histórico, se informa; no usa previsión como pasado |
| Foto de teléfono: vista previa, cancelar, archivo inválido/grande | Probado en navegador 320/390/768 | Pasa; conserva selección anterior, rechaza >12 MB; foto real de fixture, no jardín |
| Cámara: permiso denegado, captura única y cierre de tracks | Probado en Chromium con MediaStream de canvas simulado | Pasa; cámara física Android/tablet y permisos del sistema pendientes |
| Guardar consejo/foto explícito, sugerir cambios de ficha | Navegador/adaptadores | Pasa; patch y arrayUnion, actividad persistente; no cambia frecuencia ni registra riego por analizar |
| IA ausente y migración antigua clave | Suite seguridad Chromium, 320 y 768 | Pasa; borra solo geminiKey, conserva preferencias/otros almacenes; cuidados manuales disponibles |
| Errores, consulta lenta/cierre/cambio de borrador | Suite seguridad, callable/proveedor simulado | Pasa; timeout, respuesta tardía ignorada; sin datos técnicos al usuario |
| Estrecho/tablet, texto 200%, teclado | Navegador 320/390/768 y altura reducida | Pasa: sin desbordamiento del formulario, botones propios y foto visible; teclado físico Android pendiente |
| PWA actualización v16→v18 y apertura offline | Worker/cache reales, Auth/Firestore locales y SDK real | Pasa; módulos coherentes, plantas/fotos/historial/preferencias conservados; cachés de otras apps intactas |
| Gemini de producción: nombre + foto/análisis | Pendiente | Falta administración Firebase para alta AI Logic, Auth obligatorio, App Check y cuotas; enabled:false |
| Cuotas/atestación producción, modelo Spark y precios de la cuenta | Pendiente | Verificar en consola antes de activar; no se conoce el plan real del proyecto por falta de acceso |
| Login Google producción, Android instalado, cámara física | Pendiente | Usar cuenta y plantas de prueba en HTTPS propio, tras configurar servicios; no declarar superado por emulación |

## Comandos

Desde raíz:

```sh
node --test Plantometro/server/tests/core.test.js
node --experimental-vm-modules Plantometro/tests/modules.mjs
python Plantometro/tests/gemini_onboarding_ui.py
python Plantometro/tests/security_ui.py
python Plantometro/scripts/build_preview.py
```

Desde `Plantometro/`:

```sh
npx firebase emulators:exec --project demo-plantometro --config firebase.test.json --only auth,firestore "node --test --test-concurrency=1 tests/emulators.test.mjs tests/social_pwa_emulators.test.mjs"
npx firebase emulators:exec --project demo-plantometro --config firebase.social-test.json --only auth,firestore "node --test tests/social_emulators.test.mjs"
```

Resultados: unitarias 11/11; módulos/worker/migración pasan; seguridad pasa en dos
anchuras; flujos nuevos pasan en tres anchuras. Las integraciones locales incluyen
una adaptación explícita de App Check/modelo. La comprobación de cuota AI Logic
reprodujo un error con `customErrorData.status` del SDK oficial: se corrigió y su
caso dirigido pasó. Se corrigieron también esperas asíncronas antiguas del arnés
para comprobar realmente el fin de Deshacer antes de exportar una copia.
No repetir suites de clima ya documentadas en PR #3; la regresión de actividad/PWA
se ejecuta porque el SDK Firebase cambia de versión.

## Capturas

Archivos `captures/gemini-photo-390.png`, `gemini-photo-768.png` y
`gemini-analysis-390.png`, `gemini-analysis-768.png`: Chromium real sobre datos y
modelo **simulados**, no teléfono físico ni diagnóstico real. Fotos fixture propias
de la vista previa. La portada sigue siendo la del PR #3.

[Activación exacta desde tablet, costes y revocación de clave antigua](SECURE_AI.md).
