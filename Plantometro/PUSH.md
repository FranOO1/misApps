# Push: no activado en esta entrega

La campana y la actividad compartida funcionan al abrir la aplicación. No hay
promesa de avisos con la app cerrada ni solicitud de permiso de notificaciones.
No se ha recibido ni abierto una notificación real de prueba.

## Investigación y bloqueo concreto

El Firebase existente declara `messagingSenderId`, pero eso no configura un
emisor de notificaciones. El entorno no tiene identidad/credenciales autorizadas
de Google Cloud, conexión administrativa a Firebase, claves VAPID configuradas,
backend de envío ni dos dispositivos Android de prueba. Las conexiones disponibles
no ofrecen administración o despliegue de Firebase/Cloud. La conexión de GitHub
permite cambiar el repositorio; no otorga estos permisos.

FCM Web requiere HTTPS, permiso explícito del navegador, un registro por dispositivo
y un servidor de confianza para enviar mediante FCM HTTP v1. Un frontend estático
no puede contener una cuenta de servicio o una clave privada de envío. No se ha
modificado el servidor, la configuración ni la disponibilidad de Gemini para usarlo
como emisor. No se ha activado facturación ni aceptado costes.

## Qué falta para una entrega push completa

1. Acceso administrativo autorizado al proyecto **mishoras-bb0cc**, acotado a
   Plantómetro. En tablet: [Firebase → Configuración → Cloud Messaging](https://console.firebase.google.com/project/mishoras-bb0cc/settings/cloudmessaging),
   comprobar FCM y «Certificados push web»/par VAPID. La parte pública se puede
   publicar; ninguna clave privada o credencial de envío puede ir al cliente.
2. Infraestructura de envío aprobada, independiente de Gemini: servicio de confianza
   con identidad IAM de mínimo privilegio para FCM HTTP v1 y lectura de actividad/
   registros de dispositivos de Plantómetro. Un trigger único con ID estable,
   deduplicación, límite de frecuencia y exclusión del `deviceId` autor. Si desplegar
   una Function/Cloud Run exige Blaze o costes nuevos, explicar el coste y obtener
   una decisión explícita **antes** de activar facturación/desplegar.
3. Reglas específicas de dispositivos por UID, autenticación y protección de acceso
   (App Check cuando corresponda), validación, caducidad/limpieza de tokens. Leer/no
   leído debe seguir local; tokens, permisos y suscripción por dispositivo. Una
   acción clara habilita push, otra lo desactiva. Retirar registro al cerrar sesión,
   revocar permiso y recibir respuestas de token inválido.
4. Integración con el worker relativo actual, sin sustituir su caché ni romper Pages.
   Un mensaje por cambio relevante: «Rosita regó a Bob», sin enviarlo al dispositivo
   que lo hizo. Al tocarlo, abrir actividad/ficha y solicitar login si hace falta.
5. **Dos perfiles/dispositivos reales autorizados**: recibir y abrir mensajes con
   app abierta/cerrada/instalada; no recibir el propio; reconexión, duplicados,
   logout, cambio de cuenta, revocación y token renovado. No activar la función hasta
   pasar esta prueba. Emulación visual o snapshots no demuestran entrega push.

Los recordatorios programados de fechas no se incluyen. Si se añaden posteriormente,
deben tener horario tranquilo, deduplicación y «Toca revisar la tierra de Bob», sin
urgencias inferidas ni insistencia. Notificaciones y avisos oficiales de AEMET son
funciones distintas.

Referencias:
[FCM Web](https://firebase.google.com/docs/cloud-messaging/js/client),
[recepción y service worker](https://firebase.google.com/docs/cloud-messaging/js/receive),
[envío HTTP v1 desde servidor](https://firebase.google.com/docs/cloud-messaging/send/v1-api).
