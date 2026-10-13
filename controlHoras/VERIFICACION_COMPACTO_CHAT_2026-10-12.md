# Mis Horas: pantalla compacta y chat histórico

Base publicada y respaldada: `25cfb2445e23898bfad8624b25dfad7c888ef6e3`. Respaldo verificado antes de continuar con las instrucciones definitivas; borradores previos guardados aparte. Ver [procedimiento de restauración](RESPALDO_Y_RESTAURACION.md), que distingue código de registros y no restaura datos antiguos automáticamente.

## Cambios

Resumen económico más compacto sin eliminar neto, bruto, retenciones, horas realizadas ni festivas cuando existen. Menú con selector Mes/Año, accesos ligeros IA/Histórico y ajustes/privacidad por icono, nombres accesibles y objetivos táctiles de 44 px. Dos filas intencionadas solo en móviles estrechos. Mes, calendario, semana y registro reducen espacios; Añadir permanece después de controles en el flujo normal, sin fixed/sticky. Los detalles opcionales de jornada conservan sus campos.

Proyección de fin de mes fuera del desplegable. Cálculos, deducciones, explicaciones y análisis de documentos dentro de Más detalles, cerrado al abrir la aplicación y conservando su apertura durante ediciones. Exportación PDF sigue accesible. Descanso oscuro #222B38, texto #AAB5C5 y borde #394557; solo fecha, sin ZZ/Z ni horas cero en la celda. La leyenda comparte los tonos. Selección, hoy, festivos ámbar y escala de horas se conservan. Semana: horas y días, singular/plural correcto; festivas solo si hay, sin normales. Los informes mantienen el detalle.

El chat no depende del calendario ni requiere elegir mes. Gemini planifica únicamente el intervalo y las métricas a partir de la pregunta, catálogo y conversación reciente. El plan JSON se valida estrictamente y solo puede leer: no ejecuta código ni admite operaciones de escritura. JavaScript usa HorasCore y HorasReports para resumir periodos, sumar, comparar, ordenar meses, leer tarifas congeladas y distinguir nóminas introducidas/recibido/estimaciones. Los resultados indican intervalos y cobertura. null significa No registrado, diferente de cero; se preservan categorías solapadas. No se prorratean nóminas a días ni se extrapolan meses. Detalle diario y conceptos se recuperan solo cuando se piden, con límites de tamaño explícitos y sin notas libres ni identificadores conocidos.

La sincronización existente lee el documento completo users/{uid}. Una copia antigua sin confirmación no se considera historial completo. ensureHistory usa el listener autoritativo o una lectura source:server; rechazos, tiempo límite y caché incompleta no se convierten en meses vacíos. Una copia previamente confirmada sin conexión se identifica como caché y puede estar desactualizada. La consulta no crea ajustes ni operaciones nuevas de escritura; respeta el journal previo y evita ejecutar migraciones de tarifas desde su lectura. La metadata de carga queda por cuenta, fuera de los registros de la copia exportable.

Conversación y plan solo en memoria de la cuenta actual, con ventana reciente acotada. Se borran al cambiar usuario, cerrar sesión, ocultar importes o pulsar Nueva conversación. Resultados tardíos no se trasladan a otra cuenta. Nueva conversación conserva documentos revisados no enviados. Documentos nuevos mantienen extracción local, vista previa y autorización explícita existentes.

SDK, modelo, projectId, appId, claves públicas, proveedor, activación y tokens de uso limitado de Gemini se conservan. No se cambia Firebase administrativo, facturación ni Plantómetro. El worker v10 instala el grafo local completo, incluido ai-history, conservando datos y cachés de otras aplicaciones.

## Verificación

Pruebas locales: 132 pruebas Node correctas; incluyen lectura autoritativa/caché incompleta/cambio de cuenta/tiempo límite, sumas y comparaciones multimes, clasificación solapada, nóminas parciales y cero real, tarifas congeladas, privacidad, conversación, semana, informes y worker. Se ejecuta además el sincronizador exacto del respaldo sobre datos ficticios añadidos después del respaldo: conserva jornadas, bruto y neto cero, conceptos y journal. Python compilado y diff comprobado.

CI y capturas finales se enlazan en el PR. Comprobará teléfono 390x844 y pantallas estrechas, tablet, horizontal, texto ampliado, toque/teclado, Añadir en flujo visible tras seleccionar día, proyección, desplegable, PDFs descargados y leídos, worker anterior → v10, y dos navegadores con Firestore local. Auth/App Check y respuestas Gemini de CI son simulados; no representan una respuesta real de Google ni verifican reglas de Firestore de producción.

El usuario confirma que Gemini ya funciona en la versión base. La nueva prueba accesible `gemini-prueba/historial.html` autoriza con una pulsación cuatro consultas reales (plan y explicación) con meses ficticios, año y continuaciones. No lee registros reales ni conecta Firestore; reutiliza la sesión existente. La confirmación de esos resultados nuevos sigue pendiente hasta obtener respuestas reales. No se ha exportado ningún dato privado del usuario.
