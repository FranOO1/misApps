# Cobertura: clima y actividad compartida

Fecha: 3 de octubre de 2026. Solo datos desechables; ninguna lectura/escritura del
jardín de Frank y Rosita. Los resultados anteriores de IA quedan en
[TEST_MATRIX.md](TEST_MATRIX.md); IA/servidor/configuración permanecen intactos.

**Categorías:** navegador = Chromium real; simulación = adaptadores explícitos de
`preview.html`/SDK; emulador = SDK Firebase oficial con Auth/Firestore locales
`demo-plantometro`; servicio real = proveedor público por internet. Una simulación
no acredita Firebase de producción, Google OAuth, push ni Android físico.

| Caso | Método | Resultado y límites |
| --- | --- | --- |
| 320/390/768/820 px; 0/4/5/10 plantas | Navegador + simulación | PASS; 64 combinaciones de cantidad/tema/texto, sin desbordamiento. |
| Temas claro/oscuro, texto 200 %, nombres largos | Navegador + simulación | PASS; nombres/botones completos; texto de tarjeta ≥4,5:1. |
| Fotos completas / sin foto | Navegador + simulación | PASS `contain`, dibujo vegetal sin atribuir especie. |
| ≥5 plantas, búsqueda nombre/especie, sin resultados/limpiar | Navegador + simulación | PASS; 390 px dos columnas, 320 px una, tablet 768 px tres; con texto ampliado se adaptan. |
| Orden pendientes/hoy/próximas; sin riego inicial | Navegador + simulación / módulos | PASS; no se registra un riego ni se escribe al inspeccionar. |
| Botón Añadir, desplazamiento/ventanas/espacio de teclado | Navegador + simulación | PASS; área de lista separada; también tablet 1024×768/768×640 y margen seguro simulado 34 px. Teclado real Android pendiente. |
| Ciudad ya guardada, Armilla sin GPS | Navegador + simulación | PASS; elegir ciudad no invoca geolocalización ni cambia plantas. |
| Geocodificación y lectura de Armilla | **Servicio real Open-Meteo** | HTTP 200 en ambos, localidad España/Andalucía, coordenadas válidas y normalizador real PASS. No GPS. |
| Clima normal, lluvia/nieve/tormenta/granizo/viento | Navegador + simulación y 7 pruebas de modelo | PASS; umbrales y código WMO explícito. |
| Proveedor offline, lectura incompleta/antigua, localidad equivocada | Navegador + simulación | PASS; conserva última lectura y hora marcada antigua; sin lectura «Clima no disponible». |
| Datos opcionales ausentes, cambio de día/huso horario | Pruebas de modelo | PASS; desconocidos no se presentan como cero ni activan efectos. |
| Refresh deduplicado, cerrar franja/recargar | Navegador + simulación | PASS; no aparece de nuevo en la sesión, no consulta excesivamente. |
| Reduced motion / efectos no bloquean toques | Navegador + simulación | PASS; franja estática sin partículas/animación; `pointer-events:none`. |
| Clima no escribe riegos ni frecuencias | Navegador + simulación | PASS; jardín idéntico antes/después de todos los modos adversos/errores. |
| Campana vacía, nuevos/leídos, contador accesible | Navegador + simulación / emulador | PASS; texto/contador y etiquetas además del color. |
| Primera apertura con 100 eventos previos | **Emulador** | PASS; cero novedades históricas y recorte a 80. |
| Frank/Rosita mismo UID, distinto dispositivo/apodo | **Emulador**, dos perfiles Chromium | PASS; apodos locales conservados, datos compartidos, lectura independiente. |
| Riegos simultáneos, abono y corrección del ID exacto | **Emulador** | PASS; ambas acciones conservadas, repetir corrección no produce otro evento. |
| Escritura offline/reconexión/recarga | **Emulador** | PASS; un evento confirmado, no anuncios pendientes/duplicados. |
| Alta/edición significativa/no cambios | **Emulador** | PASS; alta y edición un evento; guardar sin cambios ninguno; campos desconocidos conservados. |
| Foto de diario añadir/quitar | **Emulador** | PASS; un evento por acción, fotos anteriores intactas. |
| Borrar/cancelar y ficha eliminada | **Emulador** | PASS; cancelar no escribe; evento de borrado permanece sin resucitar ficha. |
| Dos borrados encolados desde ambos dispositivos | **Emulador** | PASS; primero confirma; segundo «ya no existe», un solo evento y ninguna resurrección. |
| Permiso denegado de actividad al regar | **Emulador**, reglas específicas | PASS; batch íntegro rechazado, planta e historial idénticos, ningún evento ni confirmación; el botón vuelve a estar disponible para reintentar. |
| Volumen limitado / IDs únicos | **Emulador** | PASS; ≤80 al terminar, ningún duplicado ni estado leído/tokens compartidos. |
| Historial antiguo sin apodo | Modelo / emulador | PASS; muestra «sin apodo», no asigna a Frank ni Rosita. |
| Otra cuenta / cerrar sesión | **Emulador** | PASS; jardín/actividad vacíos para otra cuenta; memoria y caché de jardín limpias, preferencias intactas. |
| Copias v3 anteriores y campos nuevos/desconocidos | Modelo / emulador | PASS; validación conserva extras; exportación/restauración conserva fotos e historial. |
| Riego y Deshacer visible; copia válida/inválida/cancelada | **Emulador** | PASS; corrección precisa; restauración atómica, un evento; inválida/cancelada cero escrituras. |
| Gráfico de módulos, formularios y caché | Suite existente con adaptador actualizado | PASS; se añaden exports/snapshots de SDK al adaptador; casos IA anteriores sin alterar. |
| Worker **v16→v17**, ruta `/Plantometro/` y reapertura offline | **Navegador + emulador**, SDK/worker reales | PASS; nuevas rutas, sesión local, fotos/historial/preferencias y caché `horas-v1` conservados; clima marcado antiguo. |
| Actualización durante formulario, guardado y «Deshacer» | Navegador + SDK simulado, worker real | PASS `pwa_update.py`: formulario sin perder, guardado pendiente y cinco segundos de Deshacer antes de recargar; fotos e historial preservados. |
| Google login / Firebase producción y reglas nuevas | Pendiente | Sin cuenta/proyecto de prueba de producción ni acceso administrativo. Requisito previo a fusionar en WEATHER_ACTIVITY.md. |
| Instalación/actualización Android, GPS/teclado/permisos físicos | Pendiente teléfonos | La emulación y el worker de Chromium no acreditan Android real. |
| Avisos oficiales AEMET | Revisado / no incluido | Endpoint anónimo HTTP 200 con cuerpo vacío, sin CAP verificable; no hay alertas oficiales. |
| Push recibido y abierto en dos teléfonos | **Pendiente / desactivado** | Falta acceso FCM, emisor y dispositivos. Sin permisos/token/UI de activación ni costes nuevos. PUSH.md. |

## Ejecutar las pruebas de esta entrega

Desde `Plantometro/`, con Chromium/Playwright, Node y Java:

```sh
node --test tests/weather_activity.test.mjs
node --experimental-vm-modules tests/modules.mjs
node --experimental-vm-modules tests/auth_cancel.mjs
python -u tests/pwa_update.py
python scripts/build_preview.py
python -u tests/weather_activity_ui.py
python scripts/capture_preview.py
npx firebase emulators:exec --project demo-plantometro --config firebase.social-test.json --only auth,firestore "node --test tests/social_emulators.test.mjs"
npx firebase emulators:exec --project demo-plantometro --config firebase.social-test.json --only auth,firestore "node --test tests/social_pwa_emulators.test.mjs"
```

Los emuladores validan proyecto/variables antes de ejecutar y bloquean peticiones
Firebase de producción en navegador. Tokens de prueba por stdin, nunca logs.
`PLANTOMETRO_SKIP_LAYOUT=1` reintenta solo clima/campana sin repetir las combinaciones
visuales que no hayan cambiado. Las capturas de `captures/*weather-activity*` son
Chromium sobre la **simulación etiquetada**, no fotos de móviles físicos.

La suite previa `ui_smoke.py` reutiliza su proveedor simulado de IA sin modificar
sus casos; se ha ajustado el adaptador Firestore por los nuevos exports/transforms
y expectativas de búsqueda/preview/caché por esta tarea. Eso no es una prueba de
Gemini real ni implica cambiar su configuración o disponibilidad.
