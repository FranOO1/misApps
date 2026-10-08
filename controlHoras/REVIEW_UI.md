# Primera entrega: interfaz y privacidad visual

Rama: `fix/mis-horas-seguridad-gemini`. No fusionada ni publicada.

- [Versión original conservada](https://github.com/FranOO1/misApps/tree/backup/mis-horas-2026-10-08/controlHoras), commit `a9c9382468e6b0bbdf15cad01a6ec2e8627288a2`; coincidía con main y con la rama de trabajo al comenzar.
- [Trabajo amplio conservado para después](https://github.com/FranOO1/misApps/tree/wip/mis-horas-seguridad-gemini-2026-10-08/controlHoras). Es código parcial, no preparado para fusionar. Allí pasaron 12 pruebas de cálculo/seguridad y 7 de sincronización **simulada**, no pruebas de Firestore de producción.

## Cambios de esta primera entrega

Se conserva HTML/CSS/JavaScript sencillo, el diseño oscuro y el neto destacado. Texto secundario y números de días más claros; horas totales más visibles; bruto/retenciones legibles. Se distinguen registros, proyección y nómina real. Descanso neutro, símbolos N/F/D y guía para tocar un día. Controles de al menos 44 px, foco visible, zoom permitido, tablet vertical con una columna amplia. Animación de 180 ms solo al entrar/cambiar pestaña; sin volver a animar toda la pantalla al guardar o sincronizar; movimiento reducido también en gráficos.

La escala conserva exactamente 9,5 y 12 h: claro por debajo de 9,5, interpolación ámbar→rojo hasta 12, rojo desde 12. Se aclara el rojo final a `rgb(255,128,128)` para que el número alcance contraste AA también sobre el fondo festivo. No se cambia ninguna regla laboral.

El ojo oculta neto, bruto, retenciones, proyección/bruto proyectado, importe/tarifa diaria, resumen anual y datos monetarios de gráficos/tooltips. El gráfico oculto muestra **horas**. IA y nómina se ocultan/bloquean mientras está activo; se descartan resultados pendientes al cambiar la preferencia o la cuenta. La preferencia se guarda por dispositivo, no se envía a la nube y las descargas/remotos/importaciones no la revelan. Ajustes económicos siguen editables. PDF/copias conservan datos económicos con aviso explícito.

Los textos variables de los templates visibles se escapan en contexto HTML/atributo: mensajes, respuestas, nombre, etiquetas de retenciones, error y resumen de nómina. Esto no equivale a validar completamente los datos importados: esa revisión queda en la siguiente entrega.

El worker cambia de versión, precarga el HTML/manifest/iconos y elimina exclusivamente cachés propias de Horas. Conserva cachés de otras apps. Un fallo de JavaScript/recurso no recibe HTML como sustituto. Las dependencias externas de consulta se cachean cuando se descargan y un gráfico no disponible se comunica. No se cambia el contenido de los registros ni sus claves de almacenamiento.

## Pruebas y estado

`node controlHoras/tests/ui.test.cjs`: **11/11 PASS** sobre el código inline real con adaptador DOM/Chart/Firebase/red, sin cuentas ni llamadas externas reales. Comprueba importes/horas, persistencia/navegación/remotos/importación, privacidad IA y respuesta pendiente, escape HTML, umbrales, PDF con importes, animaciones/zoom y contraste. La muestra de contraste comprueba WCAG AA >=4,5 para texto pequeño y toda la interpolación en fondos oscuros y tintados.

`node --check` del script y worker, `python -m py_compile controlHoras/tests/browser_ui.py`, `git diff --check`: PASS.

`python controlHoras/tests/browser_ui.py`: preparado para Chromium 320, 390, 768 vertical y 1280, capturas visible/oculto, CRUD, decimales, gráficos reales Chart.js, privacidad/remotos, PDF, movimiento reducido, uso local/offline y SW reales. **No ejecutado localmente**: sandbox bloquea sockets de Chromium y servidor incluso en localhost (`EPERM`). Las solicitudes de permiso de red fueron canceladas. No se afirma revisión visual ni funcionamiento Android físico.

**Verificación real en navegador de GitHub Actions: PASS**, [ejecución del 8 de octubre](https://github.com/FranOO1/misApps/actions/runs/37840352505), commit `fec500df8bd698e638c0b2f6ab5377e81e23eeea`. Ejecutó Chromium 320/390/768 vertical/1280, CRUD/decimales/festivo/descanso, colores en editor y calendario, privacidad/persistencia/navegación, gráfico real Chart.js con dataset de horas, preferencia frente a remoto simulado, ajustes editables, PDF, texto IA escapado y movimiento reducido. Los cuatro tamaños pasaron las comprobaciones de desbordamiento.

También pasó **SW/CacheStorage reales**: instalación, apertura/registro/consulta offline, recarga y preferencia conservada, caché de Plantómetro conservada y fallo de JS sin HTML de sustitución. En el primer intento se detectó una respuesta 404 HTML del servidor para un recurso fallido; se corrigió el worker y la ejecución citada pasó. Es ejecución de navegador real con datos ficticios y Chart.js real; se bloquearon Auth/Firestore/IA externos. No es una prueba de sincronización, sesión o IA de producción.

[Ocho capturas visibles/ocultas](https://github.com/FranOO1/misApps/actions/runs/37840352505/artifacts/11577003671) y copias permanentes en este PR:

| Dispositivo | Importes visibles | Importes ocultos |
| --- | --- | --- |
| Móvil 390 × 844 | [Captura](captures/visible-390.png) | [Captura](captures/hidden-390.png) |
| Tablet vertical 768 × 1024 | [Captura](captures/visible-768.png) | [Captura](captures/hidden-768.png) |

Se han inspeccionado visualmente también 320 px y pantalla ancha 1280 px del artifact. Quedan el teclado/instalación/actualización físicos Android y la actualización desde todas las versiones PWA antiguas; no se afirma que se hayan verificado. El workflow solo prueba y genera artifacts: no despliega ni modifica Firebase.

## Pendiente para próximas tareas

Gemini **no integrado ni verificado en esta primera entrega**; el proveedor anterior Pollinations sigue presente y se indica en la interfaz. No se ha usado una nómina real. Su sustitución, consentimiento/minimización/validación completa de nóminas, cuotas y consulta real ficticia pertenecen a la siguiente tarea. Firebase AI Logic/App Check y modelo del PR #4 están conservados en la rama WIP; no se activó facturación ni se cambiaron permisos.

Sincronización conserva su algoritmo anterior de documento completo, salvo excluir la preferencia local del ojo. Concurrencia, borrados, reconexión y aislamiento de cuentas de registros **siguen pendientes de completar/verificar**. No se han podido leer las reglas de Firestore de producción; no se afirma que protejan cada cuenta.

También quedan la migración histórica, coherencia completa de Sintax/PDF y validación/restauración de importaciones del alcance original. No usar la rama WIP como una versión lista ni mezclar sus pruebas con esta primera entrega.
