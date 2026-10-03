# Plantómetro

Tu jardín: fotografías, recordatorios orientativos y «Ya la he regado». La fecha
recuerda cuándo comprobar la tierra, no mide su humedad. Si no hace falta agua,
puedes salir sin registrar nada. Una planta nueva no tiene un riego inventado.

https://franoo1.github.io/misApps/Plantometro/ publica `main`. Los cambios de una
rama se revisan antes de fusionar; la [demostración](PREVIEW.md) permite probarlos
sin usar tu jardín.

## Cuenta y datos

Firebase ya está configurado para este proyecto. Entra con Google: cada cuenta
tiene su propio jardín. Usar tu cuenta en tus otros dispositivos permite ver ese
mismo jardín. No hay invitaciones ni acceso compartido entre cuentas diferentes.
El apodo de Ajustes identifica quién registra los cuidados en cada dispositivo.

Se conservan proyecto, rutas `users/{uid}/plants/{id}`, fotos, historial y copias.
Cerrar sesión limpia memoria y copia local de esa cuenta. Sin conexión se utiliza
la última copia disponible; los cambios pueden sincronizarse al recuperarla. Un
error de permisos se indica como tal, sin presentarlo como pérdida de cobertura.

Las copias se exportan desde Ajustes. Restaurar comprueba el archivo completo
antes de escribir y confirma cuántas plantas incorpora, sin descartar fotos o
historial silenciosamente. Guarda una copia antes de una restauración importante.

## Ayuda con IA y recordatorios

No tienes que crear ni pegar una clave. La antigua clave de Gemini se elimina
exclusivamente de las preferencias del dispositivo al abrir esta versión. La
configuración pública de Firebase identifica el proyecto: no es una clave secreta
de Gemini.

La IA está preparada mediante servidor autenticado, pero **desactivada hasta
completar su configuración**. La app indica «Ayuda con IA no disponible» y permite
seguir creando/cuidando plantas. Las sugerencias se revisan y eligen individualmente;
consejo y foto solo se guardan al pulsar el botón correspondiente.
[Configuración segura](SECURE_AI.md).

Los recordatorios se muestran al abrir la app. No se prometen notificaciones con
la app cerrada. El clima da contexto sin cambiar fechas ni registrar riegos.

## Mantenimiento

Publicar la carpeta completa: HTML, estilos, `js/`, `shared/`, manifest y worker.
Las rutas relativas funcionan en GitHub Pages y como PWA. El servidor se despliega
por separado; Pages no lo ejecuta. No reemplazar configuración Firebase ni reglas
de otras aplicaciones.

Consultar [estructura y pruebas](DEVELOPMENT.md), [matriz](TEST_MATRIX.md) y
[configuración del servidor](SECURE_AI.md). Node se utiliza solo para desarrollar
y desplegar el servidor, no para abrir la aplicación.
