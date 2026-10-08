# Mis Horas: Gemini, entrega separada

Base: PR #5, commit `c347dd57fbcebf3f1a56ee200526bc1287fbad73`. Rama `feat/mis-horas-gemini`; PR apilado sobre `fix/mis-horas-seguridad-gemini`. No fusionar ni desplegar automáticamente.

El calendario, colores, escala de horas y CSS del diseño cerrado se conservan. Solo se añaden controles funcionales en IA y preparación de nóminas. Plantómetro no cambia. Se reutilizan partes AI del [WIP protegido](https://github.com/FranOO1/misApps/tree/wip/mis-horas-seguridad-gemini-2026-10-08/controlHoras), sin su sincronización, migración ni motor de histórico. La [copia original](https://github.com/FranOO1/misApps/tree/backup/mis-horas-2026-10-08/controlHoras) sigue intacta.

## Integración y datos

- Pollinations eliminado del código de esta versión, sin alternativa automática. Firebase AI Logic, Gemini Developer API y `gemini-3.1-flash-lite`; SDK modular 12.10.0 y App Check Enterprise con la configuración pública existente del [PR #4](https://github.com/FranOO1/misApps/pull/4). Modelo sigue disponible en la [lista oficial](https://firebase.google.com/docs/ai-logic/models), sin necesidad de cambiarlo. Ninguna clave secreta Gemini, facturación, permiso ni regla de Firebase modificados.
- Se conserva Auth/Firestore compat 10.14.1 del PR #5. Para IA se usa una app modular separada y Auth **solo en memoria**, con `updateCurrentUser` del SDK oficial a partir de la sesión ya abierta. No se inicia otra cuenta, no se pide token al usuario y no se persiste una segunda sesión. App Check normal; no hay debug token o proveedor de prueba en producción.
- Asistente específico de Mis Horas, sin instrucciones de plantas, sin modificación de registros/ajustes. Una consulta y el contexto necesario del periodo seleccionado; sin conversaciones anteriores, historial completo, nombre, UID o etiquetas personales de retenciones en el prompt. Por defecto, solo horas/días; importes/tarifas únicamente si la pregunta lo necesita. Identificadores conocidos/detectados se retiran en lo posible. No sustituye la revisión de texto libre.
- Los cálculos son los mismos `calcMonth`/`calcExtraInfo` del PR #5 y se ejecutan localmente. No se cambia Sintax ni histórico. Las tarifas actuales pueden ser inadecuadas para meses antiguos: se explica y se exige confirmación explícita de tarifas y registros completos antes de declarar coincidencia. La comparación no verifica convenio ni conceptos ajenos al modelo porcentual.
- Estados de consulta, desconexión, sesión, cuota, error, respuesta inválida y tiempo límite. Sin reintentos de app ni envíos duplicados; se mantiene el bloqueo hasta que el SDK termina incluso tras un timeout. Respuestas pendientes se descartan al cambiar cuenta/salir/ocultar importes. Modo oculto bloquea consultas y quita texto de nóminas/conversaciones del DOM.

## Nóminas

Lectura local con PDF.js 4.10.38, evaluación deshabilitada, todas las páginas dentro de 10 MB/40 páginas/120.000 caracteres. No hay recorte a 3.000 caracteres. Documento escaneado, sin texto fiable, parcialmente ilegible, protegido o demasiado grande se rechaza con explicación, sin envío ni comprobación inventada.

Se prepara texto con intento de retirar DNI/NIE, IBAN, afiliación, correos y líneas identificativas. Se muestra el **texto completo exacto** editable; no se envía el PDF original, su nombre ni registros de la app. Un botón solicita autorización específica antes de enviar ese texto a Google. Cancelar borra la preparación de memoria. Si se detectan identificadores nuevos en una edición, se muestra el texto corregido y se pide volver a revisarlo.

La explicación enlaza las [condiciones de Google](https://ai.google.dev/gemini-api/terms) y [gobierno de datos Firebase](https://firebase.google.com/docs/ai-logic/data-governance), incluyendo diferencias entre servicios gratuitos/de pago y condiciones regionales; Google exige Paid Services para clientes en EEE, Suiza y Reino Unido; la aplicabilidad y el plan del proyecto requieren revisión antes de uso real. No se activa facturación. No se promete confidencialidad ni se supone que una suscripción personal incluya API.

Gemini devuelve solo datos explícitos estructurados; tipos, campos, fechas, rangos y propiedades se validan localmente. La comparación usa el periodo extraído y los cálculos locales de ese periodo; presenta datos extraídos, estimaciones, diferencias y límites, con tres estados: cuadra con datos disponibles, hay diferencias, no se puede comprobar. La IA no decide el estado. Texto del usuario/servicio/documento se escapa, sin HTML/Markdown ejecutable.

## Pruebas (actualizar con resultados de CI)

- Local: `ui.test.cjs` 14/14 PASS y `ai.test.cjs` 9/9 PASS. Adaptadores/simulación, no consulta real. Cubre privacidad/contexto, consentimiento/cancelación/escape, validación, tres estados, extracción completa/límites, cuota/offline/sesión, timeout, lock y descarte. Sintaxis y diff: PASS.
- Preparado: Chromium 320/390/768/1280 del PR #5 y nuevo Chromium 390/768 con SDKs oficiales 10/12/PDF, sesión, atestación y modelo simulados. Verifica compatibilidad del puente Auth, petición/schema/headers reales, PDF local, consentimiento, cálculos, respuestas inválidas/cuota/offline y privacidad. **Aún pendiente de ejecución.**
- Intento contra endpoint real con datos ficticios sin sesión/atestación: pendiente. Un rechazo HTTP no demuestra que Gemini funciona. No hay acceso a la sesión de la tablet ni administración Firebase desde este entorno; no se cambiarán configuración, dominios o facturación para eludir un bloqueo.

El service worker versiona y conserva los módulos AI/PDF descargados; uso local sin conexión sigue disponible. Gemini requiere conexión. La documentación del PR #5 conserva su alcance y resultados anteriores; este informe describe la segunda entrega. La sincronización y las limitaciones históricas anteriores siguen pendientes, expresamente fuera de este PR.
