# Clima y actividad compartida de Plantómetro

Cambio limitado a `Plantometro/`, desde `main` `a9c9382`. No modifica vuestro jardín,
la configuración pública de Firebase, los módulos/configuración/servidor de IA,
las preferencias anteriores ni las reglas de otras aplicaciones. No se ha desplegado
ni fusionado. [Matriz de pruebas](TEST_MATRIX_WEATHER_ACTIVITY.md).

## Portada

Cabecera con clima compacto y campana; al tocar el clima aparecen humedad, lluvia,
viento y hora. Se mantiene una frase, fotos completas, nombres y una acción de riego.
Hasta cuatro plantas conserva las tarjetas grandes. Desde cinco muestra búsqueda
por nombre/especie y una cuadrícula que se adapta al espacio: dos columnas a 390 px,
una a 320 px o con texto al 200 %, y tres en una tablet vertical de 768 px con texto
normal. El tamaño mínimo está en `rem`, no fuerza columnas si dejan de caber.
«+ Añadir planta» ocupa una fila fija propia, separada del área de desplazamiento;
se oculta al abrir ventanas y al reducir el espacio del teclado.

Pendientes antes que próximas. «Recordatorio del…» indica cuándo mirar la tierra,
no una necesidad medida de agua. Una planta sin riegos se calcula desde su creación;
no se inventa un riego. Abono opcional: frecuencia cero no produce avisos.

## Clima

Open-Meteo por las coordenadas ya guardadas: ninguna localidad se cambia al abrir.
Buscar «Armilla» en Ajustes permite elegir «Armilla · Andalucía · España» sin GPS;
los resultados incluyen región y país para distinguir localidades homónimas. GPS
solo se consulta al pulsar su botón. Una selección manual posterior invalida una
respuesta GPS tardía.

Lecturas actuales se reutilizan 45 minutos; se comprueban al abrir, volver a la app
y cada minuto mientras esté visible. Un fallo se reintenta como máximo cada cinco
minutos; el refresco explícito tiene diez segundos de separación. Las peticiones
se deduplican, caducan a los doce segundos y una respuesta de la localidad anterior
no reemplaza la nueva. Caché local de las tres últimas localidades: conserva la
última lectura válida, hora y marca «Antigua» sin conexión, tras un fallo o cuando
vence. Sin lectura: «Clima no disponible». Nunca guarda riegos ni cambia pautas.

Se rechazan temperatura/humedad incoherentes, hora ausente, observación de hace más
de tres horas/futura, coordenadas inválidas o una cuadrícula a más de 35 km de la
localidad solicitada. Campos opcionales ausentes dicen «No disponible»; una previsión
sin fecha de hoy no dispara señales. Viento en km/h, lluvia en mm, nieve en cm.

Umbrales conservadores de previsión de hoy:

| Fenómeno | Datos exigidos |
| --- | --- |
| Lluvia | Código WMO de lluvia, probabilidad ≥60 % y ≥1 mm. |
| Tormenta | WMO 95/96/99 y los mismos umbrales de precipitación. |
| Granizo | Solo WMO 96/99; no se infiere por lluvia ni tormenta genérica. |
| Nieve | WMO de nieve, probabilidad ≥60 % y acumulación ≥0,5 cm. |
| Viento | Rachas ≥60 km/h o viento máximo ≥40 km/h. |

Si concurren fenómenos se prioriza granizo/tormenta, nieve, viento y lluvia. Señal
translúcida durante 4,5 segundos, sin capturar toques ni producir destellos. Franja
cerrable una vez por fenómeno/localidad/día en la sesión, incluso al recargar.
Con `prefers-reduced-motion`, solo franja estática. Sin señal con tiempo normal o
lectura antigua. La fuente se presenta como **previsión Open-Meteo**, nunca como
alerta oficial. La consulta anónima de avisos CAP de AEMET no devolvió contenido
validable en este entorno; no hay integración ni avisos oficiales inventados.

## Actividad y conservación de datos

Se reutiliza `whoAmI()` y el apodo local. Sin apodo, «Alguien»; el apodo no verifica
identidad. Frank y Rosita comparten datos por UID, pero conservan preferencias y
lecturas independientes por almacenamiento del navegador/dispositivo.

Eventos `{id, occurredAt, type, author, deviceId, plantId, plantName, summary}` en
**`users/{uid}/plantometroActivity/recent`**, un único documento. Riego, corrección,
abono, alta, edición significativa, eliminación y fotos de diario producen un
solo evento. Restaurar una copia produce un evento del jardín, sin recrear cientos
de novedades históricas. Abrir fichas, sincronizar y refrescar clima no escriben.

Acción y evento se confirman en un mismo batch o transacción. `arrayUnion` con ID
y contenido estables evita duplicados al reintentar; el historial/fotos usan
transformaciones de campos para conservar acciones simultáneas. Editar envía solo
campos cambiados respecto al formulario original. `update` impide resucitar una
planta borrada; al eliminar se exige que exista también si se encoló sin conexión.
Una corrección lee el documento actual y elimina solo el ID de riego elegido,
conservando riegos posteriores, abonos, fotos y campos desconocidos.

Una escritura sin conexión aparece pendiente; no se anuncia en la campana hasta
confirmarse. Si faltan permisos, se revierte la vista y se explica el rechazo,
sin confirmar ni guardar media operación. Escribir/leer la actividad exige las
reglas descritas abajo, incluso para las acciones habituales.

La tarjeta muestra el último cambio confirmado; si solo existe historial antiguo,
muestra su autor real o «Riego/Abono sin apodo», sin atribuirlo. Ficha con historial
completo anterior y los doce cambios recientes de esa planta. Campana con los 80
últimos eventos, nuevos/leídos y marcado individual o conjunto. IDs leídos en
`pg3_activity_read_{uid}` local; no se guardan bajo el UID compartido en Firestore.
Primera conexión confirmada establece la base sin marcar sucesos antiguos como nuevos.
Cerrar sesión limpia memoria y caché del jardín de esa cuenta, conserva preferencias
y no expone su actividad a otra cuenta.

El diario reciente se recorta transaccionalmente a 80 eventos; límite de seguridad
120 para absorber concurrencia. Una sola escucha de documento por sesión, sin
consultas de colecciones crecientes ni índices nuevos. El historial de riegos,
las fotos y las copias no se recortan. Formato de copia v3 y campos desconocidos
se conservan; el documento de actividad reciente y su estado local leído no se
incluyen en las antiguas copias de plantas.

## Requisito de producción antes de fusionar

No hay acceso administrativo a Google Cloud/Firebase en esta tarea. No se han
consultado documentos del jardín personal ni se conocen sus reglas actuales.
El SDK usa el Firebase público existente `mishoras-bb0cc`; eso no concede permisos
administrativos. Los emuladores utilizan exclusivamente `demo-plantometro`.

En la tablet, abrir
[Firebase → Firestore → Reglas](https://console.firebase.google.com/project/mishoras-bb0cc/firestore/databases/-default-/rules):

1. Guardar una copia de las reglas actuales.
2. Añadir únicamente el bloque de [activity.rules.snippet](activity.rules.snippet)
   dentro de `/databases/{database}/documents`, sin sustituir las reglas existentes.
3. En el simulador de reglas, comprobar: el UID propietario puede leer/escribir
   ese documento; otro UID no puede; más de 120 eventos se rechazan. Comprobar
   también si existe un `allow` más amplio que anule la restricción.
4. Si las plantas tienen una lista cerrada de campos, admitir los nuevos campos
   `lastActivity` y `lastWaterEventId`, y `at` en registros de `history`/`gallery`,
   sin debilitar su restricción al propietario.
5. Publicar solo tras comprobar esos casos y volver a abrir la app para reiniciar
   sus escuchas si antes habían recibido un rechazo. El permiso concreto necesario es
   administrar las reglas de Firestore de este proyecto; no requiere activar costes.

Esto debe comprobarse con una cuenta/jardín de prueba antes de fusionar. Si ese
nuevo permiso falta, la operación atómica se rechaza sin tocar plantas ni anunciar
actividad: probado con reglas locales de denegación. No se afirma compatibilidad
comprobada con unas reglas de producción a las que no hay acceso.

## PWA, vista previa y push

Worker `plantometro-v17`, módulos nuevos incluidos, rutas relativas para
`/misApps/Plantometro/`. Actualización v16→v17 y apertura offline probadas con SDK
real y emuladores; no equivalen a instalar/actualizar en Android físico. La lógica
de actualización espera formularios, escrituras y el aviso «Deshacer». La señal
de fin de guardado se difiere un turno para que primero aparezca Deshacer tras la
confirmación y la actualización no lo interrumpa.
No elimina cachés de otras apps.

[Vista previa de esta rama](https://htmlpreview.github.io/?https://raw.githubusercontent.com/FranOO1/misApps/improve/plantometro-weather-activity/Plantometro/preview.html).
Usa diez plantas de ejemplo, apodos/clima/login/datos/IA simulados y almacenamiento
separado de la app real. «Sobre esta prueba» permite simular un riego de Rosita y
lluvia. No registra servicio worker ni consulta vuestro jardín. GitHub Pages sigue
sirviendo `main`; este PR no publica ni cambia la instalación existente.

**Push desactivado**: no se pide permiso ni se registra un token. La campana sí
funciona dentro de la app. [PUSH.md](PUSH.md) concreta el acceso, infraestructura y
pruebas necesarios para poder activarlo con honestidad. No cambia nada de Gemini.
