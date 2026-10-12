# Mis Horas: histórico, nóminas reales e informes

Actualización del PR #8 sobre sus cambios existentes. Base main: e17a1e1, con PR #7 integrado. Las instrucciones del 2026-10-12 sustituyen el diseño anterior que mostraba normales/festivas juntas y una Z de descanso.

## Comportamiento y datos

- La tarjeta superior mantiene total de horas, bruto/neto/retenciones y ocultación económica. Solo añade horas festivas cuando son mayores que cero. No muestra una línea de horas normales.
- Calendario: día y horas en las jornadas trabajadas, día y ZZ en los descansos. Festivos ámbar y descansos rojo pálido, según la instrucción posterior a la publicación del PR #9. La escala de horas entre 9,5 y 12 h permanece intacta. Hoy y selección tienen señales independientes y estados accesibles.
- Histórico e informes: años y meses disponibles en orden descendente, selección de cualquier mes, PDF mensual y un único PDF anual. No hay ZIP en la aplicación. El menú posterior a la publicación del PR #9 usa una sola fila con Mes, Año, IA, Ajustes, Histórico y el icono de ocultar importes; áreas táctiles de al menos 44 px y texto sin recortar desde 320 px.
- Nóminas reales por mes: ingresos por concepto, deducciones con nombre/tipo/base/porcentaje/importe y totales de bruto/deducciones/neto/recibido. Guardado parcial, cero explícito, ajustes negativos y datos ausentes diferentes de cero. No se calcula automáticamente un importe ausente de una deducción.
- El bruto o las deducciones pueden sumarse desde líneas declaradas completas con todos sus importes, indicando esa procedencia. Un subtotal incompleto no se presenta como total. Neto y recibido siempre requieren registro explícito.
- Tarifas históricas conservadas por periodo; cambiar ajustes actuales no altera las nóminas reales ni los periodos ya guardados. Los parámetros históricos sin confirmar y los periodos sin tarifas guardadas se identifican.
- Tramos, pausas, turno, notas y horas extra/nocturnas son opcionales. Editar un borrador no modifica una jornada guardada antes de confirmar. No cambian silenciosamente el cálculo salarial existente. Extra/nocturnidad se tratan como subconjuntos, sin duplicarlos en las horas realizadas.
- Formulario de nómina con borradores por campo/concepto: al guardar se aplican solo las ediciones propias sobre el estado actual. Journal y mergeFields separados para cada total y cada concepto. Borrados duraderos, reinicio sin conexión, recuperación, aislamiento por cuenta y reversión de errores de almacenamiento conservados.
- Copias existentes siguen siendo restaurables; la recuperación explícita de datos de invitado incluye meses solo con nómina y conserva tombstones de la cuenta de destino.

## Informes

Mensual: mes/año/generación/EUR/origen, cobertura de jornadas, categorías y turnos, tablas diarias de horarios y notas, parámetros históricos y cálculo, datos reales de nómina por concepto, estimación y diferencias cuantificadas solo si ambos datos existen.

Anual: un PDF con resumen anual, deducciones por concepto, tabla mensual y detalle de los doce meses. Cada total identifica los meses que incluye. No extrapola los ausentes ni considera completo un año con datos faltantes. Los meses sin jornadas o nómina y los desgloses incompletos se identifican.

Leyendas: origen, bruto/neto/pago recibido, IRPF como pago a cuenta, cotizaciones y otras deducciones, categorías solapadas, cálculo Sintax, falta de tarifa de nocturnidad, fórmulas y redondeo, información ausente y conclusiones que no pueden obtenerse.

PDF con texto seleccionable, tablas que repiten encabezados, páginas numeradas y filas sin dividir cuando caben en una página. Las notas largas continúan con referencia a la fecha o concepto. Antes de descargar se elige si se incluye información económica. Sin ella se omiten nóminas, importes, tarifas, porcentajes y notas libres. Los archivos se identifican como con/sin importes.

Copiar contexto para IA: informe mensual o anual, explicación y pregunta del usuario; sin transferencia automática. El contexto excluye importes con la privacidad activa y omite identificadores conocidos mediante redacción local. Se muestra para revisar antes de compartir; la redacción automática puede ser incompleta.

## Gemini: hechos y límite pendiente

El usuario comunica que ha registrado misHoras con Enterprise y proporciona el appId `1:282064047722:web:24a04aabeecb4a67394413`. Es exactamente el ID usado por el código y la prueba aislada.

Ambas comparten proyecto `mishoras-bb0cc`, authDomain `mishoras-bb0cc.firebaseapp.com`, proveedor ReCaptchaEnterpriseProvider, clave pública `6LfyIN8tAAAAAB_h1DYMAhDZnB2wTYt8nTsOWWS4` y SDK 12.14.0. El dominio de Pages es `franoo1.github.io`. No se ha accedido a la consola administrativa para leer el registro de la clave, dominios o enforcement de replay protection; el cliente mantiene tokens de uso limitado con useLimitedUseAppCheckTokens: true.

Se ha solicitado una sola consulta accesible de 8,25 horas ficticias tras el cambio de registro. La respuesta recibida del usuario es «Sesión disponible. Pulsa el botón para autorizar la consulta ficticia». Eso demuestra que la página detecta una sesión local, no una atestación aceptada ni una respuesta del modelo. En la publicación del PR #8 la IA permanecía pausada. Después, el usuario pidió expresamente «Puedes publicarla ya definitivamente y activar gemini». Se activa aiConfig.enabled por esa nueva indicación, sin afirmar que se ha recibido una respuesta real. Si App Check rechaza una consulta, la interfaz vuelve a bloquear los envíos y muestra el mensaje breve en español; el diagnóstico conserva el error seguro. La comprobación real continúa pendiente.

La prueba aislada no lee jornadas ni nóminas. Conserva etapa, código, HTTP y causa segura del primer intercambio rechazado, sin cuerpos libres, claves, credenciales, tokens ni metadatos. App Check sigue activo; no se cambian facturación, otras apps ni configuración externa.

## Verificación

109 pruebas Node locales correctas: interfaz/privacidad, cálculos anteriores, nóminas reales parciales y negativas, categorías solapadas, informes/coverage, contexto, validación, sincronización y worker. Sintaxis Python y diff comprobados.

[CI de la implementación c8a6435](https://github.com/FranOO1/misApps/actions/runs/38226903232): completo y correcto. La ejecución del commit final se enlaza en la descripción del PR. Incluye Chromium 320/390/768/1280, toque y teclado, colores y ZZ solo en descansos, guardar/borrar, descargas reales, lectura de PDFs con pypdf, encabezados/paginación, cobertura anual, clipboard local, nóminas parciales/ceros/privacidad, SDK oficial con respuestas ficticias, copia/migración/restauración, v5 publicado → worker v9 con módulos locales versionados para evitar mezcla con caché antigua, funcionamiento sin conexión y dos navegadores con Firestore local incluyendo nóminas y borrados por concepto.

Capturas de móvil/tablet y PDF ficticio revisadas visualmente. Auth, reCAPTCHA, App Check y Gemini de CI son simulados; el servidor Firestore usado es local. Estas pruebas no verifican Gemini real ni las reglas de seguridad de producción. No se ha usado ningún registro personal en las pruebas.

Plantómetro permanece idéntico al main de partida. No se desactiva App Check ni se activa facturación. PR, fusión y despliegue se realizan con la autorización expresa del usuario tras completar las comprobaciones.

Activación posterior al PR #8: caché y módulos locales v8 para actualizar también aiConfig en la PWA. La prueba de interfaz sin servicios externos fuerza la pausa únicamente en su servidor local; la prueba separada de AI verifica la ruta habilitada con SDK oficial y respuestas simuladas.

Retoque de diseño solicitado después de publicar: descansos rojo pálido con texto oscuro de contraste AA y ZZ en lugar de 0 h; datos de descanso conservados con cero horas. Menú en una sola fila y etiqueta Histórico. El worker v9 actualiza el HTML; los módulos sin cambios mantienen sus URLs v8. Gemini conserva la activación del PR #9, App Check y tokens de uso limitado.
