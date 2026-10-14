> Matriz histórica de la preparación anterior. La arquitectura y resultados actuales de Gemini están en [TEST_MATRIX_GEMINI_ONBOARDING.md](TEST_MATRIX_GEMINI_ONBOARDING.md).

# Matriz de cobertura — seguridad y flujos

Ejecutada en esta rama con datos desechables. Ninguna prueba accede al jardín personal.
Los intentos de crear cuentas desechables en Auth de producción fueron rechazados;
no crearon usuarios ni plantas. Las etiquetas describen alcance, no sustituyen pruebas
pendientes en Google o dispositivos físicos.

- **Probado en navegador:** Chromium real; servicios adaptados salvo indicación local.
- **Probado con servicio real:** Auth/Firestore locales oficiales, middleware Functions
  o HTTP público Open-Meteo. No significa Firebase/Gemini de producción.
- **Revisado en código:** inspección y, donde se indica, pruebas Node; no Google.
- **Pendiente:** bloqueo concreto o cuenta/dispositivo necesarios.

Evidencias: `tests/ui_smoke.py` (UI), `tests/security_ui.py` (SEG), `tests/modules.mjs`
(MOD), `tests/migration.test.mjs` (MIG), `server/tests/core.test.js` (SRV),
`tests/emulators.test.mjs` (INT) y `tests/browser_emulator.py` (BINT, lanzada por INT).

## Flujos cotidianos y datos

| Caso/error | Alcance | Resultado, evidencia o bloqueo |
| --- | --- | --- |
| Acceso y carga inicial | Probado en navegador; probado con servicio real local | UI/SEG; BINT con SDK web real, Auth local y tokens de prueba. PASS. |
| Google OAuth/popup/redirect en Android | Pendiente | Cuenta Google y origen autorizado. Token local no verifica OAuth. |
| Acceso: dominio no autorizado | Probado en navegador | SEG: error inyectado, mensaje útil y recuperación posterior. PASS. |
| Logout, limpiar caché y cambiar cuenta | Probado en navegador; probado con servicio real local | UI/SEG/BINT: memoria/caché UID limpias; tercera cuenta aislada. PASS. |
| Fallo al cerrar sesión | Probado en navegador | SEG: error explícito, sesión/jardín actual conservados. PASS. |
| Sincronización móvil/tablet | Probado con servicio real local | BINT: dos navegadores 390×844 y 768×1024, misma cuenta local; cambios reflejados. PASS. |
| Sincronización personal en dispositivos reales | Pendiente | Sin sesión Google del usuario; no se utiliza tu jardín. |
| Lectura Firestore: permiso vs caída temporal | Probado en navegador | SEG distingue mensajes; reglas de producción intactas. PASS. |
| Cero, una y muchas plantas | Probado en navegador | UI: singular/plural, alta visible, orden y búsqueda. PASS. |
| Recordatorio pasado/hoy/futuro | Probado en navegador; revisado en código | UI/MOD: calendario local y orden; no afirma que necesite agua. PASS. |
| Bob: 77 días | Probado en navegador; pendiente dato real | Ejemplo preview calculado; fecha/frecuencia de Bob real no consultadas. |
| Inspeccionar sin regar | Probado en navegador | UI: abrir/cerrar no escribe, pospone ni crea evento. PASS. |
| Alta y nueva planta sin último riego | Probado en navegador; probado con servicio real local | UI/BINT: nombre/frecuencia/foto opcional, último riego e historial vacíos. PASS. |
| Formulario inválido/cancelar alta o edición | Probado en navegador | UI/MOD/SEG: requerido, cancelar sin cambios y conservar borrador/foto. PASS. |
| Edición y compatibilidad de campos | Probado en navegador; probado con servicio real local | UI/BINT: fotos/historial/campo desconocido conservados y sincronizados. PASS. |
| Borrar/cancelar | Probado en navegador; probado con servicio real local | UI/SEG/BINT: confirmar elimina, cancelar no escribe; cambios en otro navegador. PASS. |
| Escritura/borrado sin permiso | Probado en navegador | UI/SEG: revierte estado optimista, error de permiso, sin prometer conexión. PASS. |
| Buscar, jardín pequeño/grande/sin resultados | Probado en navegador | UI: acceso discreto, campo solo a petición, nombres largos. PASS. |
| Riego con fecha/autor | Probado en navegador; probado con servicio real local | UI/BINT: historial anterior, apodo y próxima fecha conservados. PASS. |
| Riego sin permiso | Probado en navegador | UI/SEG: fecha/historial no cambian, error útil. PASS. |
| Deshacer desde aviso | Probado en navegador; probado con servicio real local | UI/BINT: transacción para ese evento. PASS. |
| Corregir tras 5 s, dos riegos y abono posterior | Probado en navegador | UI: solo elimina evento elegido y conserva posteriores. PASS. |
| Corrección fallida/sin conexión | Probado en navegador | SEG: historial conservado ante transacción fallida. PASS. |
| Abono | Probado en navegador | UI: fecha/autor, compatible con corrección de riego. PASS. |
| Añadir/cambiar foto | Probado en navegador | UI: botón español ≥44 px, selector Chromium, compresión/vista previa. PASS. |
| Cancelar selección / imagen ilegible | Probado en navegador | UI/SEG: cancelación simulada y decodificación fallida conservan foto anterior. PASS. |
| Selector/cámara Android/tablet | Pendiente | Requiere hardware; selector Chromium no prueba interfaz del sistema. |
| Diario con más de seis fotos, notas y vista | Probado en navegador | UI/SEG: fotos antiguas, notas/fechas y texto escapado. PASS. |
| Eliminar foto con error y reintento | Probado en navegador | SEG: conserva foto/modal si falla, sin falso éxito; borra la elegida al reintentar. PASS. |
| Exportar fotos/historial | Probado en navegador; probado con servicio real local | UI/BINT: descarga y contenido comparado con datos de prueba. PASS. |
| Restaurar copia v3 y array legado | Probado en navegador; revisado en código | UI/MOD validan formas; BINT restaura copia válida con batch real local. PASS. |
| Copia incompleta/datos/fechas/fotos/historial/IA inválidos | Probado en navegador; revisado en código | UI/SEG/MOD: valida todo antes de escribir. PASS. |
| JSON roto/archivo grande/cancelar restauración | Probado en navegador | SEG: error o ningún cambio; sin restauración parcial. PASS. |
| Batch rechazado | Probado en navegador | UI: todas las fichas revertidas, mensaje explícito. PASS. |
| Escritura offline y reconexión | Probado con servicio real local | BINT: SDK real, cola y confirmación al reconectar observada en otro navegador. PASS. |

## Clima, ajustes e IA

| Caso/error | Alcance | Resultado, evidencia o bloqueo |
| --- | --- | --- |
| Clima/actualizar y lluvia interior/exterior | Probado en navegador | UI: desde Ajustes, contexto exterior, sin cambiar fechas/riegos. PASS. |
| Clima/geocodificación HTTP real | Probado con servicio real | Open-Meteo HTTP 200, Granada pública y datos numéricos válidos. PASS; no GPS personal. |
| Clima inválido/indisponible | Probado en navegador; revisado en código | SEG: fallback sin NaN/fechas intactas; validación HTTP/forma. PASS. |
| Buscar ciudad y sin coincidencias | Probado en navegador | UI/SEG: resultado elegible o mensaje, conserva ajustes. PASS. |
| GPS concedido/denegado | Probado en navegador | Geolocation/geocodificación adaptadas. UI/SEG PASS. |
| GPS real y geocodificación inversa | Pendiente | Hardware/permiso de usuario y BigDataCloud no probados con posición real. |
| Apodo, claro/oscuro/sistema, verano | Probado en navegador | UI/MOD: persistencia y contexto sin alterar pautas. PASS. |
| Borrar únicamente antigua clave | Probado en navegador; revisado en código | SEG/MIG: solo geminiKey, jardín/preferencias/otros almacenamientos intactos. MIG 2/2. |
| Almacenamiento bloqueado | Revisado en código | MIG: carga preferencias y no usa clave; borrado físico pendiente hasta permitir escritura. PASS. |
| Sin campo/peticiones de clave ni llamada directa | Probado en navegador; revisado en código | SEG: sin campo ni instrucciones; transporte seguro sin x-goog-api-key en cliente. PASS. |
| IA no disponible, alta manual | Probado en navegador | SEG: estado claro, botones desactivados sin bloquear crear/cuidar. PASS. |
| Identificar por nombre/foto, duda | Probado en navegador | UI/SEG: respuesta controlada, duda y campos individuales. PASS; no Gemini real. |
| Aceptar/corregir/descartar | Probado en navegador | UI/SEG: nada seleccionado por defecto, corrige campos elegidos, descarta sin escritura. PASS. |
| Cuidados y revisión antigua JSON | Probado en navegador | SEG/preview: resumen/consejo legibles, sin autosave ni JSON crudo. PASS. |
| Foto/consejo: cancelar, fallo y guardar | Probado en navegador | SEG: consulta no guarda; acción explícita añade una entrada y conserva anteriores. PASS. |
| IA vacía/inválida/cuota/permiso/caída | Probado en navegador; revisado en código | SEG/SRV: errores seguros y cero cambios silenciosos. PASS. |
| IA lenta, respuesta tardía/cierre/nombre cambiado | Probado en navegador | SEG: reloj de prueba ejecuta deadline cliente 45 s, descarta resultados tardíos. PASS. |
| Servidor autenticación/autorización/revocación | Probado con servicio real local | INT: Auth/callable reales, 401/403, revocación rechaza JWT antiguo. PASS. |
| Ficha de otra cuenta / contadores privados | Probado con servicio real local | INT: reglas locales deniegan lectura ajena y escritura/lectura de contadores. PASS; no reglas cloud actuales. |
| Cuota/concurrencia/liberación | Probado con servicio real local | INT: transacciones Firestore, rechazo sin modelo, un ganador y lease preciso. PASS. |
| App Check ausente | Probado con servicio real local | INT: middleware real enforceAppCheck rechaza 401. PASS. |
| App Check válido y token reutilizado | Pendiente | Requiere Enterprise/Google; caso positivo local tiene adaptador explícito. |
| Vertex IAM/modelo fijo/contrato/errores | Revisado en código | SRV 7/7 con transporte controlado: identidad runtime, sin API key, cuota/timeout/JSON. PASS. |
| Gemini real por nombre/foto/cuidados | Pendiente | Sin credenciales cloud, servidor desplegado, cuenta aprobada ni App Check. IA desactivada. |
| Base cloud plantometro-ai y permisos IAM | Pendiente | Regla deny-all preparada aparte; emulador no aplica reglas a bases con nombre. Verificar en Google. |
| Notificaciones con app cerrada | Probado en navegador; revisado en código | SEG: opción/promesa eliminadas; cero peticiones/envíos con permiso concedido. Recordatorios al abrir. PASS. |
| Compartir/invitaciones | Probado en navegador; revisado en código | Texto honesto: jardín por cuenta, misma cuenta en sus dispositivos. Sin invitaciones; BINT aislamiento. |

## Accesibilidad, demostración y PWA

| Caso/error | Alcance | Resultado, evidencia o bloqueo |
| --- | --- | --- |
| Móvil 320/390, tablet vertical 768/820 | Probado en navegador | UI/SEG: sin desbordamiento, temas/formularios/nombres largos. PASS. |
| Botón fijo sin tapar contenido | Probado en navegador | UI: terracota/verde, todo el scroll, temas, cero/una/muchas. PASS. |
| Tablet horizontal y viewport bajo | Probado en navegador | UI: 1024×768 y 768×640, se oculta con ventanas. PASS. |
| Texto 200% y margen seguro 34 px | Probado en navegador | UI: no superposición/recorte, margen simulado. PASS. |
| Teclado y tamaño táctil | Probado en navegador | UI/SEG: viewport reducido, acciones principales ≥44 px. PASS. |
| Teclado/barras/zoom por gesto físicos | Pendiente | Emulación no abre teclado ni barras reales; Android/tablet física. |
| Contraste claro/oscuro y sin foto | Probado en navegador | UI: parejas paleta/texto ≥4,5:1, foto completa/dibujo. PASS. |
| Preview autónoma offline | Probado en navegador | UI: fotos embebidas/servicios rotulados, sin SDK Firebase ni worker. PASS. |
| Worker v14, rutas/caché ajena | Probado en navegador; revisado en código | UI/MOD: worker real Chromium, shell cacheado, alcance relativo y caché ajena intacta. PASS. |
| Abrir shell sin conexión | Probado en navegador | UI: navegación offline con worker real, servicios externos adaptados. PASS. |
| Manifest standalone/instalación/rutas | Probado en navegador; revisado en código | UI/MOD: manifiesto/subdirectorio válidos, nuevos archivos cacheados. PASS. |
| PWA física y sesión personal offline | Pendiente | Requiere Android/tablet y cuenta Google; una prueba de Chromium no verifica instalación física. |
| Sintaxis/paquetes | Revisado en código | 19 módulos/worker node --check, MOD, SRV 7/7; audit ejecución 0 vulnerabilidades. PASS. |

## Resultados

Sin fallos: MOD, MIG 2/2, SRV 7/7, INT 7/7 (incluye BINT), UI y SEG. Capturas reales
de navegador sobre simulación en [captures/](captures/).
No se declaran probados Gemini, Google OAuth, App Check positivo, Firebase producción
ni PWA física. [SECURE_AI.md](SECURE_AI.md) contiene los pasos pendientes concretos.
La revisión inicial conservó main. La continuación autorizada publica el cliente
al fusionar el mismo PR, sin cambiar datos ni reglas del proyecto.


## Continuación del PR #2 (3 de octubre de 2026)

Se conservan los resultados anteriores; se ejecutan regresiones para los riesgos
nuevos de publicación, sin repetir las suites completas.

| Caso concreto | Alcance | Resultado o bloqueo |
| --- | --- | --- |
| Cancelar popup Google / popup bloqueado | Revisado en código | `tests/auth_cancel.mjs`: cerrar/cancelar no redirige; popup bloqueado permite redirect. PASS. No sustituye Google OAuth real. |
| Modelo cercano a retirada / endpoint fijo | Revisado en código | 2/2 casos Vertex controlados: Gemini 3.1 Flash Lite global, MINIMAL, límite de salida y rechazo de otro modelo. PASS; sin consulta Google. |
| Actualizar v13 → v15 con caché HTTP anterior | Probado en navegador | `tests/pwa_update.py`, Chromium/worker reales y SDK adaptado: shell completo fresco, solo borra clave antigua; preferencias/ficha/fotos/historial/caché ajena conservados. PASS. |
| Actualización durante formulario y guardado | Probado en navegador | PWA: espera al cerrar formulario y al confirmar escritura; mantiene borrador y deshacer, recarga una vez. PASS. |
| Nueva versión offline | Probado en navegador | PWA: shell nuevo coherente, fotos/historial locales conservados. PASS, SDK adaptado. |
| Foto eliminada mientras desaparece ficha remota | Probado en navegador | PWA: sin excepción ni resurrección de ficha. PASS, servicio adaptado. |
| Firebase producción, alta de cuenta de prueba | Probado con servicio real | SDK real desde origen Pages: anónimo `auth/admin-restricted-operation`; correo `auth/operation-not-allowed`. Sin cuenta creada ni datos personales consultados. No se cambiaron proveedores. |
| CRUD/sesión de producción | Pendiente | Solo proveedor Google disponible; falta una cuenta Google de prueba. Emuladores anteriores no verifican reglas/OAuth de producción. |
| Pages publicada, actualización real y offline | Pendiente al publicar | `tests/published_update.py`: perfil real v13 preparado, sin sesión ni adaptadores; v15 se verifica después de la publicación. Resultado final en PR #2. |
| Conexión administradora Google Cloud | Pendiente | Entorno sin identidades cloud y búsqueda sin conexión Firebase administradora. Acción mínima: abrir consola del proyecto y pulsar >_ Activar Cloud Shell. Sin facturación activada. |

La IA permanece desactivada y muestra «Ayuda con IA no disponible». No se publican
secretos ni se afirma que Gemini/Google OAuth/Android físico estén probados.


### Riesgo detectado al publicar y corrección v16

La publicación v15 abre con perfil limpio, pero la prueba real de actualización
v13 detectó un arranque incompleto. Con SDK Firebase real se reprodujo: caché HTTP
con scripts antiguos y HTML nuevo (`renderSettingsUI` sobre un campo retirado).
Las pruebas anteriores con SDK adaptado no reprodujeron ese orden de descargas.

La v16 inicia `js/pwa.js` por separado antes de `app.js`, sin dependencias Firebase,
para instalar la versión completa y recuperarse aunque falle un módulo antiguo.
La recarga sigue esperando formularios, escrituras y Deshacer; no borra datos.
`tests/pwa_real_sdk.py` reproduce v13→v16 con SDK público real y ficheros locales,
cacheados una hora: no adapta Firebase/clima ni inicia sesión; verifica recuperación,
preferencias/ficha/fotos/historial locales y shell offline. No verifica CRUD cloud.
`tests/pwa_update.py` conserva los casos de formulario/guardado/Deshacer con adaptadores.
`tests/published_update.py` comprueba Pages v15→v16 sin adaptadores después de publicar.
Los resultados finales, incluida la corrección tras fusionar, se añaden al mismo PR #2.

Resultados de la corrección v16 antes de publicar: grafo de módulos PASS;
PWA adaptada 5/5 PASS; actualización antigua con SDK real PASS; preview reconstruida
en móvil/tablet sin worker ni errores PASS. Pages v15→v16 se comprueba al publicar;
resultado final en PR #2. La función Gemini continúa sin desplegar.
