# Plantómetro 3 · Sincronización en tiempo real con tu cuenta de Google

La app usa **Firebase** (gratis, de Google). Se configura UNA sola vez, en unos 10 minutos.
Después: entráis con Google en cada móvil y todo se sincroniza al instante.

## Paso 1 · Crear el proyecto (solo tú, una vez)

1. Entra en https://console.firebase.google.com con tu cuenta de Gmail.
2. "Crear proyecto" → nombre: `plantometro` → desactiva Analytics → Crear.

## Paso 2 · Activar el login con Google

1. Menú lateral: **Authentication** → "Comenzar".
2. Pestaña "Sign-in method" → **Google** → Habilitar → Guardar.
3. En Authentication → **Settings → Dominios autorizados**: añade el dominio
   donde tienes la app (por ejemplo `tuusuario.github.io`). `localhost` ya viene incluido.

## Paso 3 · Crear la base de datos

1. Menú lateral: **Firestore Database** → "Crear base de datos".
2. Ubicación: `eur3 (europe-west)` → empezar en **modo producción**.
3. Pestaña **Reglas**: borra lo que haya y pega esto tal cual (no hay que cambiar nada):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/plants/{plantId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
  }
}
```

4. Pulsa **Publicar**. Cada cuenta de Google solo puede ver SU propio jardín.

## Paso 4 · Copiar la configuración

1. Rueda dentada (arriba izq.) → **Configuración del proyecto**.
2. Baja hasta "Tus apps" → icono **</>** (Web) → nombre `plantometro` → Registrar.
3. Te muestra un bloque `const firebaseConfig = { apiKey: "...", ... }`.
   **Cópialo entero.**

## Paso 5 · Poner en marcha la app

1. Sube `index.html`, `manifest.json` y `sw.js` a tu hosting (GitHub Pages, etc.).
2. Abre la app: te pedirá pegar la configuración → pégala → Guardar.
3. "Continuar con Google" → listo.
4. En el móvil de tu pareja: abrir la app, pegar LA MISMA configuración,
   y entrar con LA MISMA cuenta de Google. Al compartir cuenta, compartís jardín.

## Notas

- La "apiKey" de Firebase NO es secreta: la seguridad la ponen las reglas del paso 3.
- Funciona sin conexión: los cambios se guardan y se suben solos al volver la cobertura.
- Cada cuenta de Google tiene su propio jardín: si alguien entra con otra
  cuenta, empieza de cero con sus propias plantas.
- Para compartir el jardín con más gente: que entren con la misma cuenta.
- En Ajustes de la app poned quién usa cada móvil, para que los riegos
  queden firmados aunque compartáis cuenta.
