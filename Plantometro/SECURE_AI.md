# Ayuda con IA: configuración segura pendiente

## Estado de esta rama

El navegador deja de almacenar/enviar una clave de Gemini. No hay campo de clave,
instrucciones para obtenerla ni llamadas directas al modelo. Se borra exclusivamente
`geminiKey` de `pg3b_settings`; preferencias, jardín, fotos e historial permanecen.
Una escritura bloqueada conserva las preferencias y la clave antigua no se usa.
Los errores no exponen tokens, detalles del SDK ni respuestas sin validar.

`js/ai-config.js`: `enabled:false`, sin clave de sitio App Check. La aplicación indica
**«Ayuda con IA no disponible»** y permite todos los cuidados manuales.
No se desplegó servidor: este entorno no tiene identidades/credenciales/vinculaciones
de secretos de Google Cloud ni `gcloud`. El permiso de GitHub permite subir código,
no administrar ese proyecto. La demostración no implica que funcione Gemini real.

## Arquitectura preparada

- Firebase Auth autentica la callable. La función comprueba además el usuario
  vigente, habilitado y con autorización `plantometroAI:true`. Revocar rechaza incluso
  un token antiguo que conserve esa autorización.
- App Check con reCAPTCHA Enterprise y tokens limitados: `enforceAppCheck` y
  `consumeAppCheckToken` en servidor, `limitedUseAppCheckTokens` en cliente.
- Lectura únicamente de `users/{uid autenticado}/plants/{id}`. No acepta otro UID,
  URLs de imagen, modelos o endpoints del cliente; no escribe en el jardín.
- Vertex AI/Gemini utiliza la identidad IAM del servidor. No se crea clave de
  Gemini ni archivo JSON de cuenta de servicio ni secretos descargables.
- Cuotas atómicas: 10 intentos por cuenta/día y 200 globales/día UTC; una consulta
  simultánea por cuenta. Intentos fallidos cuentan. Bloqueo 65 s, función 60 s,
  petición al modelo 35 s y cliente 45 s; sin reintentos automáticos.
- Máximo 2 instancias/concurrencia 8, entrada/foto limitadas, salida estructurada
  hasta 1.000 tokens y contrato validado. Se envían datos mínimos de cuidados,
  nunca autores del historial ni metadatos de cuenta. Fotos/contenido necesario
  sí se envían a Google al pedir ayuda, nunca al crear o abrir automáticamente.
- Contadores en base separada **`plantometro-ai`**, con lecturas/escrituras de clientes
  denegadas. Jardín en `(default)`; no se despliegan reglas de esa base ni otras apps.
- Respuestas legibles y sugerencias aceptadas/corregidas/descartadas individualmente.
  Consejo/foto solo se guarda con una acción explícita.

La configuración Firebase existente y la clave de sitio App Check son públicas,
no secretos de Gemini. La protección depende de Auth, App Check, autorización,
cuotas y reglas/IAM.

## Pasos desde la tablet (administrador del proyecto)

1. Abre https://console.firebase.google.com/project/mishoras-bb0cc/overview con la
   cuenta administradora del proyecto existente. Functions/Vertex requieren
   facturación habilitada (Blaze). Configura presupuesto/alertas: alertar no limita
   por sí mismo el gasto.
2. Abre https://console.cloud.google.com/home/dashboard?project=mishoras-bb0cc.
   Pulsa `>_` (Cloud Shell) en la barra superior; en tablet puede ayudar «Sitio para
   ordenador». Usa allí tu identidad, sin descargar credenciales ni iniciar otra
   tarea de Codex.
3. Ejecuta línea por línea en Cloud Shell, con Node 22 (comprueba `node --version`):

```sh
gcloud config set project mishoras-bb0cc
git clone --branch fix/plantometro-secure-ai https://github.com/FranOO1/misApps.git
cd misApps/Plantometro
node --version
npm ci
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com firebaseappcheck.googleapis.com recaptchaenterprise.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com
gcloud iam service-accounts create plantometro-ai --display-name="Plantometro AI"
gcloud projects add-iam-policy-binding mishoras-bb0cc --member="serviceAccount:plantometro-ai@mishoras-bb0cc.iam.gserviceaccount.com" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding mishoras-bb0cc --member="serviceAccount:plantometro-ai@mishoras-bb0cc.iam.gserviceaccount.com" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding mishoras-bb0cc --member="serviceAccount:plantometro-ai@mishoras-bb0cc.iam.gserviceaccount.com" --role="roles/firebaseauth.viewer"
gcloud projects add-iam-policy-binding mishoras-bb0cc --member="serviceAccount:plantometro-ai@mishoras-bb0cc.iam.gserviceaccount.com" --role="roles/firebaseappcheck.tokenVerifier"
gcloud firestore databases create --database=plantometro-ai --location=eur3 --type=firestore-native --project=mishoras-bb0cc
npx firebase deploy --project mishoras-bb0cc --only firestore:plantometro-ai
npx firebase deploy --project mishoras-bb0cc --only functions:plantometro-ai
```

   Si cuenta de servicio/base existen, verifica nombres y continúa sin recrearlas.
   Nunca despliegues `tests/firestore.rules` ni reemplaces las reglas de `(default)`.
   La cuenta de servicio dedicada tiene lectura de Auth, no administración de usuarios.
   El operador necesita permisos para APIs/IAM/despliegue y usar esa cuenta
   (`iam.serviceAccounts.actAs`). Para conceder acceso necesita `roles/firebaseauth.admin`.
   Si el shell pide autorización, autoriza allí; no pegues tokens en el chat. Si falta
   la identidad ADC para el script, usa `gcloud auth application-default login` en
   Cloud Shell mediante el navegador; no crees un archivo de clave de servicio.
4. Google Cloud → Seguridad → reCAPTCHA: crea clave Enterprise de sitio web por
   puntuación para `franoo1.github.io`. Firebase → App Check: registra la app web
   **existente** con Enterprise y esa clave pública. No impongas App Check a
   Firestore/Auth u otras apps: la nueva función ya lo exige. No uses tokens de
   depuración en producción.
5. Authentication → Usuarios: crea/elige una cuenta de prueba sin tu jardín personal.
   Copia su UID y sustituye `UID_DE_PRUEBA`:

```sh
GOOGLE_CLOUD_PROJECT=mishoras-bb0cc node server/grant-access.js UID_DE_PRUEBA grant
```

   Conserva las autorizaciones de otras apps. Vuelve a iniciar sesión para renovar
   token. Para revocar, utiliza el mismo comando con `revoke`.
6. Comprueba disponibilidad de `gemini-2.5-flash` en Vertex `europe-west1`, IAM,
   cuotas/facturación y texto/fotos. Si no está disponible, revisa modelo fijo y
   pruebas antes de cambiarlo; nunca un endpoint/modelo arbitrario del cliente.
7. Solo después, cambia en esta rama `js/ai-config.js`: `enabled:true` y
   `appCheckSiteKey` con la clave **pública** Enterprise. Región/nombre ya fijados.
   Incrementa versión de worker al publicar ese cambio. Nunca incluir una clave
   secreta de Gemini o un JSON IAM.
8. Sirve rama en HTTPS controlado/autorizado en Firebase/App Check. CORS permite
   solo `https://franoo1.github.io`; otro origen debe añadirse explícitamente y
   revisarse. No autorices HTMLPreview para sesiones Firebase. Con la cuenta de
   prueba verifica modelo real, App Check válido/ausente/token reutilizado, cuenta
   sin permiso, revocación, cuotas y denegación de acceso a `plantometro-ai`.
   Completa la matriz antes de activar IA para cuentas personales. Este PR no
   se fusiona automáticamente.

Los contadores tienen `expireAt`: TTL opcional de ocho días solo en colecciones de
cuotas de la base privada, nunca en plantas/historial. Mantener límites de Vertex
además de la cuota global de la app. No activar logs de cuerpos, fotos, respuestas,
tokens o credenciales.

## Comprobado y límites

7/7 pruebas unitarias de servidor, 2/2 migración y 7/7 integración local. Auth/Firestore
locales y SDK web son servicios reales de prueba; modelo controlado, no Gemini.
Middleware real rechaza App Check ausente. Tokens Google válidos no tienen emisor
local: pendientes. Este emulador no aplica reglas a bases con nombre: contadores en
colección privada de su base desechable predeterminada únicamente en pruebas.
El aislamiento cloud/IAM de la base privada requiere comprobación tras desplegar.

`npm audit --omit=dev`: cero vulnerabilidades de ejecución. Backend Node 22 excluye
HTML, imágenes, cliente, pruebas y `.env*` del paquete. App estática sin npm/framework.
No se utilizó jardín personal ni Gemini real. [Matriz completa](TEST_MATRIX.md).
