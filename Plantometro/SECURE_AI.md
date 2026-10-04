# Gemini: configuración de cliente activada; consulta real pendiente

Esta rama parte del PR #3 (`4d0adc61f6da33d7bff3cf49b7e29b9fdee35cc0`),
que conserva clima, actividad y tarjetas compactas. `main` al iniciar era `a9c9382`.
Este PR se revisa sobre la rama del PR #3; no fusionar en main antes de integrar
el PR #3 o cambiar su base tras su publicación. No se ha leído el jardín personal.

## Opción principal: Firebase AI Logic, sin clave personal

`js/ai-config.js` tiene `enabled:true`, `provider:'firebase-ai'` y la clave
**pública** de sitio App Check proporcionada por el propietario, para
`franoo1.github.io`. El propietario confirma Spark, Gemini Developer API,
modo de usuarios autenticados y App Check aplicado a Firebase AI Logic.
Estas confirmaciones no equivalen a una consulta real verificada desde este
entorno. Manual, fotos, riegos, abono opcional e historial funcionan sin IA.

Se prepara Firebase AI Logic con Gemini Developer API, modelo fijo
`gemini-3.1-flash-lite`, Firebase Auth y App Check Enterprise. SDK web coherente
12.10.0 para Auth, Firestore, App Check, Functions y AI; worker v19. Firebase
administra la credencial Gemini en su proxy, nunca se copia al navegador.
El SDK envía la **clave pública Firebase** existente al proxy Firebase: esto no es
una clave secreta de Gemini. No confundir `x-goog-api-key` de ese SDK con enviar
una clave personal a `generativelanguage.googleapis.com` (ya no existe ese flujo).

Fuentes oficiales de modelo/precios revalidadas el 4 de octubre de 2026:

- [Precios y planes](https://firebase.google.com/docs/ai-logic/pricing): Gemini
  Developer API admite Spark sin medio de pago; Vertex requiere Blaze.
- [Solo usuarios autenticados](https://firebase.google.com/docs/ai-logic/auth-mode):
  Firebase puede exigir Auth **en el servidor**, configuración de todo el proyecto.
  La comprobación local de login por sí sola NO protege una API.
- [App Check](https://firebase.google.com/docs/ai-logic/app-check): exige atestación;
  desde noviembre de 2026 será obligatoria. El alta reciente suele imponerla ya.
- [Cuotas](https://firebase.google.com/docs/ai-logic/quotas): límite por usuario,
  región y minuto, 100 RPM por defecto; reducir inicialmente a **5 RPM**.
  También limita el proveedor/modelo. Esto no es un tope diario ni garantía de
  gasto. No se presenta un contador local como protección de servidor.
- [Modelos admitidos](https://firebase.google.com/docs/ai-logic/models):
  `gemini-3.1-flash-lite` figura como **billing not required** para Developer API.
- [Modelo y precios](https://ai.google.dev/gemini-api/docs/pricing): 3.1 Flash-Lite,
  texto/imagen: nivel gratuito sin cargo, con disponibilidad/cuotas limitadas;
  nivel de pago **USD 0,25 / millón de tokens de entrada y USD 1,50 / millón de
  salida**, incluyendo razonamiento. Ejemplo 2.000 entrada + 1.000 salida:
  USD 0,002 por consulta, antes de otros servicios/impuestos. No es presupuesto
  máximo: imágenes, tokens y tarifas pueden variar. Gemini Pro personal no paga
  estas consultas. Revalidar el modelo y precios en la consola al activar.

El nivel gratuito puede utilizar contenido para mejorar productos según la tabla
oficial de precios/condiciones. Antes de enviar fotos reales, revisar ese tratamiento;
no enviar información personal innecesaria. Una foto solo se envía al pedir ayuda.
App Check Enterprise tiene sus propias cuotas/precios; no activar recursos de pago
sin decisión del propietario. Si el proyecto ya tiene facturación vinculada,
**NO asumir que el modelo será gratis** y no activarlo sin revisar costes.

## Estado de activación y una prueba real sin guardar plantas

El propietario ya ha realizado el alta externa. No volver a pedirle una clave
Gemini, otra cuenta Google ni activar facturación. Fraud Defense incluye
reCAPTCHA Enterprise; el cliente utiliza `ReCaptchaEnterpriseProvider`.
La clave de sitio es pública y no concede acceso administrativo ni sustituye
Firebase Auth o App Check. No se han cambiado cuotas ni otros servicios desde
este entorno, que no tiene identidad administradora ni la sesión del móvil.
La cuota recomendada sigue siendo 5 solicitudes/minuto/usuario/región; el límite
real de consola no se ha verificado aquí y el código no puede imponerlo.

La configuración de esta rama ya intenta Gemini real; **no está publicada**
mientras los PR #3 y #4 sigan abiertos. Integrar #3 primero y #4 después conserva
clima/actividad/apodos. GitHub Pages sirve main: HTMLPreview no prueba Gemini
y no debe autorizarse como origen de acceso real. Worker v19 instala
la nueva configuración junto con sus módulos sin borrar preferencias/jardines.

**Única prueba de usuario, una vez publicada la rama:** en
https://franoo1.github.io/misApps/Plantometro/, con la cuenta actual,
pulsa «+ Añadir planta», escribe «Epipremnum aureum» y pulsa
«Sugerir cuidados». No selecciones sugerencias ni pulses Guardar; cierra
el formulario. Esto envía un borrador a Gemini sin guardar una planta ni
usar las existentes como contexto. Si aparecen sugerencias, la consulta de
texto real ha respondido con tu Auth y App Check. Si falla, comunica el texto
exacto del mensaje visible; no envíes tokens ni credenciales. Quedan aparte
la prueba real de foto/cámara y las comprobaciones negativas de protección.

No se puede ejecutar esa consulta desde este entorno: no comparte la sesión
Firebase Auth de la tablet. Registrar App Check y afirmar Enforced en consola
son confirmaciones del propietario; ni la simulación ni una prueba sin Auth
demuestran que una consulta autenticada real esté funcionando.

## Alternativa preparada: callable + Vertex, solo con decisión sobre costes

`provider:'callable'` conserva el servidor preparado en `server/`. Se eliminó
la lista manual/custom claim: acepta cualquier usuario habilitado con Google
vinculado. Auth real, App Check y antirrepetición; lectura solo del jardín propio.
Cuotas atómicas: 10 consultas por UID/día, 200 globales/día, una concurrente por UID;
fallos cuentan. Base privada `plantometro-ai`; clientes no leen contadores.
2 instancias, concurrencia 8; entrada/fotos limitadas, salida 1.000 tokens; timeout
modelo 35 s, función 60 s. No genera claves de servicio: usa identidad IAM.
Vertex global no garantiza procesamiento en la UE. Esta alternativa necesita
Blaze/Functions/Vertex y aprobación de costes. **No se desplegó ni activó**.
Para elegirla, revisar primero [precios Vertex](https://cloud.google.com/vertex-ai/generative-ai/pricing)
y Functions/App Check/Firestore. No desplegar reglas de pruebas en producción.

## Datos y contexto

Apodo por `pg3_nickname_{uid}`, local a cada dispositivo. El apodo antiguo se migra
solo a la primera cuenta en ese dispositivo; no se hereda entre cuentas distintas.
No prueba identidad real. Se conserva el resto de `pg3b_settings`, incluida localidad.
La migración elimina exclusivamente `geminiKey`; no toca plantas, fotos o historial.

Alta: nombre/foto opcional, sugerencias con selección explícita y campos corregibles,
ubicación/luz/intervalo; abono opcional. Análisis: selector con vista previa o cámara
con «Capturar y analizar», una instantánea; tracks se cierran al cerrar/salir.
Contexto mínimo: nombre, especie, ubicación, luz, observaciones, últimos 12 cuidados
sin autores, dos fotos anteriores pequeñas si existen. Solo lectura actual reciente
aproximada de Open-Meteo, fechada; **no hay historial meteorológico fiable** y se
explica al modelo. Previsión no se usa como tiempo pasado. No cambia pautas ni
registra riegos. Guardar consejo/foto es explícito, con actualización de campos y
arrayUnion para conservar fotos concurrentes y actividad compartida.

## Revocar una clave antigua, si existió o fue expuesta

No se recupera ninguna del historial. Si pegaste una clave en la app anterior,
revócala aunque ahora se elimine del dispositivo: Google AI Studio → **Get API key**
([claves](https://aistudio.google.com/api-keys)) → identificar por nombre/proyecto →
menú de la clave → **Delete API key**. Alternativa: Google Cloud → **APIs & Services
→ Credentials** ([enlace](https://console.cloud.google.com/apis/credentials)) →
seleccionar la antigua credencial de **Generative Language/Gemini** → Delete.
Si pertenecía a otro proyecto, seleccionarlo primero. No borrar la clave pública
Firebase compartida: rompería login y otras apps. Firebase AI Logic gestiona su
nueva credencial; no pegar un reemplazo. Si no sabes cuál es, no borrar claves al
azar: revisar nombre y restricciones en la consola, sin publicar sus valores.

[Resultados y pendientes](TEST_MATRIX_GEMINI_ONBOARDING.md).
