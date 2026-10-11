# App Check y diseño de Mis Horas

Base: `main` e17a1e1bed8f96bb275689c353de577664dd47d9, con PR #7 fusionado. Esta entrega se propone en un PR; no se fusiona ni se publica en Pages.

## Error real y límites de la investigación

La evidencia aportada por el usuario es `appCheck/initial-throttle`, HTTP 400, tanto en Mis Horas como en la prueba ficticia. Ambas fallan en la atestación, antes de enviar la consulta al modelo. No hay una respuesta real de Gemini verificada.

El código oficial de Firebase App Check 12.14.0 convierte el primer `fetch-status-error` en `initial-throttle` dentro de ReCaptchaEnterpriseProvider.getToken, conservando solo httpStatus y el plazo del bloqueo. Su cliente de intercambio no lee el cuerpo del error HTTP. Por tanto, `initial-throttle` también puede representar el primer rechazo: no demuestra por sí solo que la causa sean los reintentos ni identifica el motivo del 400.

Fuentes primarias:
- https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.14.0/packages/app-check/src/providers.ts
- https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.14.0/packages/app-check/src/client.ts
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/recaptcha-keys
- https://firebase.google.com/docs/ai-logic/app-check

## Configuración efectiva cotejada en código

| Campo | Mis Horas y prueba ficticia |
| --- | --- |
| projectId | mishoras-bb0cc |
| appId | 1:282064047722:web:24a04aabeecb4a67394413 |
| authDomain | mishoras-bb0cc.firebaseapp.com |
| sender / número del proyecto | 282064047722 |
| proveedor App Check | ReCaptchaEnterpriseProvider |
| clave pública de sitio | 6LfyIN8tAAAAAB_h1DYMAhDZnB2wTYt8nTsOWWS4 |
| dominio de Pages | franoo1.github.io |
| rutas publicadas | /misApps/controlHoras/ y /misApps/gemini-prueba/ |
| SDK de cliente | Firebase 12.14.0 en todos los módulos de producción |
| AI Logic | GoogleAIBackend, useLimitedUseAppCheckTokens: true |

La clave de API pública procede de la misma configuración Firebase que Auth/Firestore; la prueba lee ese bloque sin ejecutar Mis Horas. La prueba importa el mismo servicio y la misma configuración de App Check. No hay un desajuste demostrado entre las dos páginas. No se han identificado los appId administrativos por el nombre visible «misHoras» o «Plantómetro».

Sin acceso administrativo no puede verificarse si ese appId está registrado con esta clave, si su clave Enterprise es de tipo web basado en puntuación, si autoriza franoo1.github.io ni si AI Logic impone replay protection. El cliente mantiene App Check y los tokens de uso limitado en cualquier caso. No se cambia la facturación.

**Único paso desde la tablet:** abre [Firebase Console → proyecto mishoras-bb0cc → App Check → Aplicaciones](https://console.firebase.google.com/project/mishoras-bb0cc/appcheck/apps), entra en el registro cuyo ID sea exactamente `1:282064047722:web:24a04aabeecb4a67394413` y comprueba que está registrado con **reCAPTCHA Enterprise** y la clave pública de sitio de la tabla. Si aparece sin registrar, registra únicamente ese ID con esa clave existente; si ya está registrado, conserva los ajustes y anota el proveedor y la clave asociados. No elijas el registro por su nombre. No se prescribe cambiar el dominio ni otra app sin evidencia del rechazo original.

## Correcciones del repositorio

- El asistente respeta `aiConfig.enabled`, que antes no se comprobaba. Queda en false mientras la atestación real siga bloqueada. La pantalla IA muestra «La IA no está disponible ahora. Tus horas siguen guardándose con normalidad», sin entrada ni Enviar. El envío de nóminas queda deshabilitado; preparación local, registros, cálculos, PDF y comparación local se conservan.
- Reactivación: después de verificar App Check y recibir una respuesta real desde la prueba ficticia, cambiar solo `enabled` a true en ai-config.js. Ante otro rechazo de App Check/configuración, el asistente vuelve a bloquear el envío durante esa sesión.
- App Check se activa antes de Auth/AI. Se evita el refresco automático de fondo; cada consulta conserva el getToken existente y AI Logic obtiene un token de uso limitado. No se añade otro diagnóstico getToken ni se desactiva App Check.
- El observador de rechazos se limita al endpoint del proyecto/appId exactos. No lee cuerpos ni cabeceras de peticiones, ni respuestas exitosas de atestación. De una copia del primer fallo retiene únicamente HTTP, estado backend permitido y una causa traducida de una lista cerrada. Lectura limitada a 16 KiB / 500 ms. No guarda ni registra el cuerpo original, claves, tokens ni metadatos. Los reintentos no sobrescriben ese primer rechazo.
- La prueba aislada sigue disponible con autorización explícita y admite exclusivamente la pregunta fija y 8,25 horas ficticias. No acepta documentos, preguntas libres ni registros. Un rechazo de atestación deshabilita el botón hasta recargar o cambiar de sesión. Su diagnóstico muestra el primer rechazo seguro, separado del bloqueo temporal; causas no reconocidas se describen como desconocidas.
- El resumen mensual muestra siempre las horas registradas totales. Solo hay desglose normal/festivo cuando hay horas festivas, incluyendo cero horas normales si todas son festivas. No cambia el cálculo salarial ni se confunden horas registradas con extras pagadas.
- Descansos: símbolo Z, fondo rosa rojizo suave sobre el tema oscuro y fecha/indicador contrastados. Se conserva la etiqueta accesible Descanso y los estados seleccionado/hoy.
- Menú Mes/Año/IA/Ajustes: botones con fondo, borde, estado seleccionado y área táctil mínima de 44 px; foco estable tras renderizar. Se conserva navegación nativa por Tab, Enter y Espacio.
- Service worker v6 añade el módulo diagnóstico al shell y renueva la caché. No toca localStorage, IndexedDB ni cachés de otras aplicaciones. Se prueba la transición desde el archivo exacto del worker v5 publicado.

## Verificación

Local: 91 pruebas Node de interfaz, cálculo, sincronización, AI/nóminas, diagnóstico y worker; compilación de pruebas Python y git diff --check, correctos.

Navegador/CI: pendiente de completar en la rama del PR. Incluye 320/390/768/1280 px, toque y teclado, meses sin jornadas/sin festivos/todo festivo, Z/colores, guardar/borrar, privacidad, PDF/nóminas, SDK oficial con respuestas HTTP ficticias, primer 400 sin enviar al modelo, actualización v5→v6 y dos navegadores contra Firestore local.

Consultas reales a Gemini: ninguna respuesta real recibida en esta sesión. Las pruebas de CI simulan Auth, reCAPTCHA, App Check y Gemini; no cuentan como validación del servicio publicado. La configuración administrativa y la primera causa real del 400 quedan pendientes. No se pide otra cuenta, otra clave ni repetir una prueba sin desplegar el diagnóstico cambiado.
