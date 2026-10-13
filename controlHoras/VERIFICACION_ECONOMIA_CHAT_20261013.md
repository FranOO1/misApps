# Neto e historial en el chat

Base publicada: ab19dc64ec23732affb551e78a46bc8e00db5dab. Respaldo completo y referencias de móvil/tablet verificados antes de editar; ver [restauración](RESPALDO_20261013.md). No se han leído ni exportado registros privados.

## Causa y corrección

Las estimaciones ya existían en HorasReports/HorasCore, pero solo se recuperaban si el plan de Gemini pedía estimates. El plan podía pedir exclusivamente nóminas reales y devolver datos ausentes, o heredar un intervalo corto para una petición de todos los meses.

preparePlan incorpora nóminas, estimaciones y tarifas para consultas económicas. Mes a mes sin un periodo explícito utiliza desde el primer hasta el último mes disponible, aunque el modelo proponga un tramo menor. Las consultas de horas siguen omitiendo cifras económicas. Las sumas y diferencias conservan las funciones comunes; no hay fórmulas económicas nuevas.

La tabla local de neto muestra todos los meses recuperados y totales reales/estimados separados. Una nómina registrada tiene prioridad; si falta, el neto estimado sigue disponible sin confirmarlo como cobrado. Los parámetros usados y la falta de tarifas históricas se explican; ausencia no equivale a cero. Se conserva la recuperación autoritativa del documento completo y el rechazo explícito de caché incompleta.

Formato seguro: HTML escapado, listas/negritas generadas por un formateador limitado, sin enlaces ejecutables. Un encabezado de periodo legible por respuesta, sin concatenaciones de fechas ISO; campos técnicos y valores ausentes se presentan con nombres comprensibles. Chat en flujo natural en teléfono, con espacio completo de conversación; diagnóstico y pruebas ficticias en Ajustes. Documentos nuevos conservan revisión y autorización.

Calendario: descanso #331F26, borde #60313C, ZZ #CE8D9A; sin ayuda ni leyenda encima. Festivos, escala de horas, datos y controles de tipo se conservan. Menú Mes/Año y ajustes conservados; IA/Histórico solo iconos con nombres y descripciones al enfocarlos/pulsarlos. Histórico con cuatro matices oscuros, mes destacado y selección azul; descargas con acento verde petróleo.

## Comprobaciones

141 pruebas Node: cálculo común, informes, historial, ausencia/cero real, privacidad, sincronización, restauración, calendario, formato y actualización del worker. Caso ficticio abril–octubre: junio sin nómina devuelve 54 EUR estimados; julio contiene 100 EUR de neto real y 63 EUR estimados; siete meses suman 441 EUR estimados y 100 EUR de nóminas registradas, sin mezclar totales. Una petición posterior de junio sustituye todo el intervalo.

CI enlazado en el PR: Chromium móvil/tablet/horizontal/texto ampliado, teclado/toque, capturas, PDF mensual/anual seleccionable, cambio del worker conservando datos y Firestore local con dos navegadores. Las respuestas de Auth, App Check y Gemini del CI son simuladas; no prueban Google ni las reglas de producción.

La prueba publicada gemini-prueba/historial.html realiza cuatro consultas económicas reales con la misma integración y exclusivamente datos ficticios. No conecta Firestore ni lee jornadas/nóminas reales. Su resultado real queda pendiente hasta recibirlo desde una sesión accesible. Gemini permanece activo con SDK, modelo, proyecto, App Check y configuración existentes. No se altera Firebase administrativo, facturación ni Plantómetro.
