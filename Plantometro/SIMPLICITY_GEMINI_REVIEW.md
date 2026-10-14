# Plantómetro sencilla: preguntar y analizar fotos

14 octubre 2026. Trabajo sobre PR #4, cabeza inicial `f8cef9c`, que incorpora
PR #3 `4d0adc6`. Mis Horas se revisa en main `92bf4f8`; no se modifica esa app.
Los PR #3/#4 aún están abiertos. Pages sirve main, no esta implementación.

## Jerarquía conservada

Portada: plantas/fotos, recordatorio orientativo, «Ya la he regado», acción
terracota Añadir con espacio propio, clima compacto y campana. No se añade
un chat global, banner, estadísticas, filtros o nuevos ajustes de IA.

Ficha: «Ayuda con Gemini» reúne **Preguntar** y **Analizar foto**. Una consulta
muestra pregunta/respuesta breve y un campo para continuar. Guardar/copiar
quedan bajo una opción plegable. Las sugerencias de campos siguen requiriendo
selección, corrección y guardado explícitos. Ni consultar ni analizar registra
actividad o cambia frecuencia/riegos. Alta manual y abono opcional conservados.

## Qué se adopta de Mis Horas

Su SDK modular Firebase 12.14.0, AI Logic con tokens App Check de uso limitado,
preflight de atestación y diagnóstico seguro del primer rechazo. El mismo
appId/proyecto/clave pública se cotejan en código. Eso no demuestra cómo está
registrada administrativamente la aplicación ni que Gemini haya respondido.
Mis Horas documenta `appCheck/initial-throttle` HTTP 400, no éxito real del modelo.
Plantómetro ya usa Auth modular: no se copia el puente compat que esa app necesita.

La conversación solo dura mientras está abierta, se limita a seis mensajes y
no incluye apodos/correos/identificadores de cuenta. El contexto pertenece a la
planta elegida. Preguntar no adjunta su foto guardada sin una selección explícita.
Tras analizar una imagen se puede preguntar sobre esa misma foto. No se afirma
vídeo continuo, diagnóstico cierto o humedad medida. No se cambia facturación.

## Comprobación

| Flujo | Evidencia | Resultado |
|---|---|---|
| Token limitado, instancia única, preflight/cancel/cambio de cuenta/timeout | Módulo real con SDK determinista, 8 casos | Pasa; ninguna llamada de modelo tras atestación fallida |
| Diagnóstico HTTP seguro, origen/appId exacto, primer fallo, sin tokens | 4 pruebas puras | Pasa; nunca muestra texto libre del proveedor |
| Preguntas, continuidad y foto explícita, cero guardados automáticos | Chromium 320/390/768, ambos temas, servicios simulados | Pasa |
| Nombre largo, texto 200%, altura de teclado | Chromium | Pasa; teclado físico pendiente |
| Nueva pregunta mientras llega respuesta, cierre/cambio de cuenta | Chromium | Pasa; borrador no sobrescrito y conversación descartada |
| Alta/fotos/cámara/aceptar/corregir/descartar/guardar | Suite navegador con servicios/cámara simulados | Pasa en tres anchuras |
| Errores, riego/corrección, copia, GPS, borrado | Suite seguridad con SDK adaptado | Pasa en móvil/tablet |
| SDK oficial: Auth, peticiones JSON y fotografías; error 429/JSON/offline | Firebase Auth/Firestore locales + HTTP modelo/App Check adaptados | Pasa; NO consulta Gemini real |
| Sincronización de dos perfiles, otros UID, fotos y datos existentes | Firebase Auth/Firestore locales, fixture descartable | Pasa |
| PWA v16→v20, módulos coherentes, actualización/offline/preferencias | Worker/cache y SDK reales + Firebase local | Pasa; mantiene otras cachés |
| Preview descargable, pregunta y diez ejemplos sin servicios externos | Chromium 390/768 | Pasa; simulación explícita |
| Consulta Gemini y atestación válida de producción | Sin sesión del usuario accesible aquí | Pendiente; no se piden tokens, claves ni otra cuenta |
| Android físico: cámara, teclado, instalación y actualización | Requiere dispositivo del usuario | Pendiente |

Datos personales: ninguna lectura/escritura del jardín real. Solo fixtures de
prueba/adaptadores y documentos públicos de código. No se modifican reglas,
proyectos externos o recursos de Mis Horas.

## Probar

La [vista previa](https://htmlpreview.github.io/?https://raw.githubusercontent.com/FranOO1/misApps/improve/plantometro-gemini-onboarding/Plantometro/preview.html)
es una simulación y no requiere cuenta. Después de integrar/publicar #3/#4,
una consulta real sin guardar se realiza con la cuenta actual en Añadir planta:
«Epipremnum aureum» → Sugerir cuidados → cerrar sin Guardar. Si App Check falla,
el mensaje muestra la causa reconocida y HTTP, sin credenciales; comunicar ese
mensaje permite resolver el bloqueo. No repetir configuración ya confirmada
ni afirmar que la vista previa demuestra el servicio real.
