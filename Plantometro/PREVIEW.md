# Probar esta rama desde móvil o tablet

https://franoo1.github.io/misApps/Plantometro/ sirve `main`, actualmente minimalista
con worker v13. Esta rama prepara seguridad de IA y worker v14; crear el PR no
publica cambios ni actualiza la PWA instalada.

## Demostración sin usar tu jardín

Abrir en Chrome de Android o el navegador de la tablet:

https://htmlpreview.github.io/?https://github.com/FranOO1/misApps/blob/fix/plantometro-secure-ai/Plantometro/preview.html

La franja superior y «Sobre esta prueba» identifican servicios simulados. Permite
probar formularios, fotos, riegos, diario y consejos legibles. «IA simulada en esta
prueba» se muestra en la demostración. La app real de la rama muestra «Ayuda con IA
no disponible» hasta configurar servidor.

Login, datos, clima e IA son simulados. Bob es ejemplo calculado con 77 días pendientes,
no tu planta ni una medida de humedad. Fotos ilustrativas documentadas en
`preview-assets/README.md`. La demostración usa preferencias separadas y no cambia
cuenta, clave antigua ni jardín. No pide claves, instala worker o verifica PWA.
Si el visor no carga, descarga `preview.html` y ábrelo: es autocontenido con fotos
embebidas.

## Lo habitual

- Regar: un toque en «Ya la he regado». Deshacer desde aviso; después, corregir en Historial.
- Abrir ficha: foto o nombre. Si la tierra está húmeda, salir sin registrar nada.
- Añadir: botón fijo terracota, nombre/frecuencia y guardar. Foto opcional con botón
  español/vista previa; cancelar conserva la anterior.
- Clima, copia o cuenta: Ajustes y la opción correspondiente.
- IA simulada: ficha → Cuidados → «Revisar los cuidados». Leer consejo, revisar/corregir
  campos elegidos o descartar; nada cambia sin aceptar y guardar.

Una acción por planta. Añadir tiene espacio propio y se oculta con ventanas. Sin
filtros/estadísticas/avisos grandes ni controles para justificar que no has regado.

## Alcance

[Matriz](TEST_MATRIX.md): navegador real con servicios simulados; SDK web/Auth/Firestore
locales; HTTP real Open-Meteo. Gemini/Vertex, App Check válido, OAuth Google y PWA física
siguen pendientes con sus bloqueos. No se utiliza el jardín personal.
[Capturas móvil/tablet](captures/).

Servicios reales necesitan HTTPS controlado y autorizado en Firebase. No autorices
el visor compartido para sesiones Firebase. [Configuración de nube](SECURE_AI.md).
