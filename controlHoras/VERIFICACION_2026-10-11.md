# Mis Horas: revisión del PR #7, 11 de octubre de 2026

La autorización del propietario incluye integrar y publicar la aplicación completa. Se conserva la integración recuperada del PR #7 y todo su diseño, privacidad, histórico, cálculos, sincronización y consentimiento de nóminas. Plantómetro no se modifica; no se cambian reglas, permisos ni facturación.

## App Check y HTTP 401

El error observado fue HTTP 401 UNAUTHENTICATED, «Firebase App Check token is invalid». Por sí solo no demuestra que replay protection esté impuesta. No hay identidad administrativa Google Cloud ni sesión Firebase del propietario en este entorno para comprobar el ajuste o ejecutar una inferencia autenticada real.

La documentación oficial indica que replay protection rechaza tokens de sesión y exige tokens de uso limitado recién emitidos; la versión web mínima es 12.14.0. Las notas de esa versión corrigen el envío de limited_use en App Check. Se actualizan todos los módulos Firebase de producción de Mis Horas a 12.14.0 y getAI recibe useLimitedUseAppCheckTokens: true. Esto permite funcionar tanto con protección básica como con replay protection, conservando App Check. El getToken previo existente no se duplica ni se sustituye: el SDK AI obtiene el token de uso limitado de cada petición. La página aislada reutiliza el servicio de la app completa.

No se imprimen ni persisten tokens reales, cabeceras o respuestas de atestación. Las pruebas de transporte usan únicamente valores ficticios en memoria y exigen limited_use: true y una atestación distinta por envío. No equivalen a Gemini real.

Configuración pública del código: proyecto mishoras-bb0cc, emisor 282064047722, appId 1:282064047722:web:24a04aabeecb4a67394413, authDomain mishoras-bb0cc.firebaseapp.com, proveedor reCAPTCHA Enterprise, clave de sitio 6LfyIN8tAAAAAB_h1DYMAhDZnB2wTYt8nTsOWWS4, origen previsto https://franoo1.github.io. Coincide con la configuración pública anterior de Mis Horas; el registro administrativo de app y clave/dominio todavía requiere consulta de consola.

Pantallas exactas para el propietario:
1. Firebase Console, proyecto mishoras-bb0cc → Seguridad → App Check → APIs → Firebase AI Logic → configuración/métricas: consultar Replay protection y mantener Baseline protection Enforced.
2. Configuración del proyecto → General → Tus apps: comparar el appId anterior. Seguridad → App Check → Apps → esa app: comparar proveedor y clave de sitio.
3. Google Cloud Console, mismo proyecto → Seguridad → reCAPTCHA → esa clave → dominios: comprobar franoo1.github.io.

Fuentes: https://firebase.google.com/docs/ai-logic/app-check y https://firebase.google.com/support/release-notes/js (12.14.0). El código oficial de providers.ts de firebase@12.14.0 envía limited_use: true.

## Fallo del CI investigado

Run 38119225474, job 114410311652: las seis suites Node y browser_ui.py, browser_gemini.py, browser_probe.py y browser_data.py pasaron. Firestore local arrancó y browser_sync.py agotó 30 segundos en la línea 35 esperando el día 1 borrado y el día 3 sincronizado.

La secuencia de la prueba guardaba el día 1, mantenía ese día seleccionado y volvía a llamar selectDay(1) antes de clearDay(). selectDay alterna la selección: esa segunda llamada la quitaba. clearDay intentaba usar una selección vacía y la validación rechazaba el dato, conservando la jornada. Se corrige la selección en la prueba y se afirma que el tombstone existe antes de esperar. No se cambia el algoritmo de sincronización ni se atribuye el timeout a concurrencia. Si falla, el diagnóstico muestra solo estado y jornadas ficticias del emulador, sin valores Auth/App Check.

## Comprobación de esta revisión

83/83 pruebas locales PASS: UI 24, core 14, sync 16, AI 9, diagnóstico 14, worker 6. Python compila y git diff --check pasa. La ejecución local del navegador falla antes de cargar la app: PermissionError [Errno 1] al crear el socket HTTP. La validación de navegador/emulador se realizará en CI sobre el nuevo commit.

Pendiente: comprobar el CI de esta revisión, fusionar/publicar con la autorización vigente, verificar el commit desplegado y obtener una respuesta real de Gemini con las 8,25 horas ficticias de /gemini-prueba/. No se certifica la inferencia hasta recibir esa respuesta con Auth y App Check reales. Firestore y los dispositivos de producción mantienen los límites de verificación ya documentados.
