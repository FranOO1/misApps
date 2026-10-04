# Comprobación publicada antes de integrar PR #3 y #4

4 de octubre de 2026: ambos PR abiertos y compatibles; Pages sigue en main.
El propietario indica que publicó la regla de actividad. Este entorno tiene
escritura GitHub, pero no identidad administradora Google ni sesión Google de
prueba. La creación de una identidad anónima temporal está bloqueada por
`ADMIN_ONLY_OPERATION`; no se habilitaron proveedores ni servicios.
**No se verificó todavía la regla publicada con una sesión real.** La autorización
para fusionar es condicional a esa comprobación; los PR no se fusionaron.

Se añadió `scripts/verify-live-activity.mjs` para realizar la prueba desde Cloud
Shell con una cuenta Google **de prueba** autorizada allí. El script no requiere
clave Gemini, JSON de servicio, contraseña ni compartir tokens con Codex; utiliza
OAuth de la cuenta de prueba y Auth/Firestore cliente, **no escrituras Admin que
eludan las reglas**. No activa APIs ni facturación. Solo admite el proyecto actual.

## Procedimiento preparado (se guía paso a paso)

1. Tener una cuenta Google de prueba distinta de la de Frank/Rosita y con jardín
   vacío. No utilizar la cuenta personal. Abrir [Cloud Shell](https://shell.cloud.google.com/)
   en Chrome; en tablet puede ayudar ⋮ → Sitio para ordenador.
2. Autorizar **esa cuenta de prueba** en gcloud, con su correo (no contraseña en
   terminal). El navegador de Google pide iniciar sesión. No cambiar IAM ni plan:

```sh
gcloud auth login CORREO_GOOGLE_DE_PRUEBA
```

3. Obtener la rama de revisión y ejecutar con Node 22 o posterior:

```sh
git clone --branch improve/plantometro-gemini-onboarding https://github.com/FranOO1/misApps.git misApps-verificacion
cd misApps-verificacion/Plantometro
node scripts/verify-live-activity.mjs CORREO_GOOGLE_DE_PRUEBA
```

   Si esa carpeta ya existe, no borrarla ni sobrescribirla; usar otra carpeta nueva.
   Solo se comparte la salida JSON de resultado, nunca credenciales. Si Auth rechaza
   el acceso/alta Google de esa cuenta, el script termina antes de escribir plantas:
   revisar el mensaje y Authentication en la consola; no habilitar métodos ni
   cambiar permisos a ciegas.
4. La salida debe indicar `status: PASS` y limpieza completada. Comprueba alta
   atómica, riego Rosita, corrección Frank, lectura confirmada del diario,
   denegación a otro UID, máximo de 120 eventos, timestamp de servidor y rollback.
   Un fallo impide la publicación. No confundir esta prueba REST con una prueba
   física Android ni con snapshots/estado leído del navegador: esos últimos tienen
   pruebas locales documentadas, y su confirmación real en dispositivos sigue pendiente.

El script comprueba que la cuenta de prueba no tenga plantas ni eventos antes de
escribir, crea una única planta `verification-*`, la elimina al terminar y restaura
el diario vacío. La regla impide borrar el diario, por eso puede quedar el documento
vacío en **esa cuenta de prueba**, sin plantas. Ante una limpieza fallida, retirar
solo esa planta de esa cuenta; nunca borrar colecciones ni el jardín compartido.

## Orden posterior

Tras comprobar PASS real: integrar #3 en main, cambiar la base de #4 a main,
comprobar que su diff no elimina clima/actividad, integrar #4 y esperar Pages.
La configuración del cliente Gemini se actualizó a `enabled:true` con la clave
pública proporcionada por el propietario, que confirma Spark/Auth/App Check.
No hay consulta Gemini real verificada: véase [SECURE_AI.md](SECURE_AI.md).
La prueba de Gemini puede realizarse con la cuenta actual y un borrador sin guardar;
no requiere la cuenta separada que utiliza este verificador histórico de actividad.
