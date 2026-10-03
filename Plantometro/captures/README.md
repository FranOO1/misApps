# Capturas de la simulación

Capturas de Chromium real sobre `preview.html` de esta rama, sin edición de imagen.
Servicios y jardín simulados, sin sesión ni datos personales.

| Captura | Tamaño y caso |
| --- | --- |
| `mobile-home.png` | 390×844, portada y botón fijo sin superposición. |
| `tablet-home.png` | 768×1024, tablet vertical y botón fijo separado. |
| `mobile-ai.png`, `tablet-ai.png` | Consejo legible, IA simulada y guardado explícito. |
| `mobile-settings.png`, `tablet-settings.png` | Ajustes sin clave ni notificaciones. |

La app real mantiene la IA desactivada; la demostración la simula expresamente.
Hardware, Google y PWA instalada siguen pendientes: ver `../TEST_MATRIX.md`.

## Clima y actividad compartida (3 octubre 2026)

Capturas nuevas de `preview.html`, Chromium con diez plantas ficticias y servicios
simulados. No sustituyen las capturas ni las pruebas anteriores de IA.

| Captura | Caso |
| --- | --- |
| [mobile-weather-activity.png](mobile-weather-activity.png) | 390×844, dos columnas, clima y campana, acción fija sin superposición. |
| [tablet-weather-activity.png](tablet-weather-activity.png) | 768×1024, tres columnas y clima compacto. |
| [tablet-dark-weather-activity.png](tablet-dark-weather-activity.png) | Misma tablet, tema oscuro. |
| [mobile-activity-weather-activity.png](mobile-activity-weather-activity.png) | Campana con riego de Rosita nuevo y registros de ejemplo anteriores leídos. |
| [mobile-reduced-motion-weather-activity.png](mobile-reduced-motion-weather-activity.png) | Nieve simulada: solo franja estática, sin animación. |

[Matriz específica](../TEST_MATRIX_WEATHER_ACTIVITY.md). Firebase de producción,
push y teléfonos Android físicos siguen separados de esta simulación.

## Gemini y apodo por cuenta (PR de IA)

`gemini-photo-390.png` / `gemini-photo-768.png`: selector y vista previa.
`gemini-analysis-390.png` / `gemini-analysis-768.png`: diagnóstico estructurado.
También hay variantes estrechas de 320 px. Capturadas con Chromium real y
`tests/gemini_onboarding_ui.py`, usando datos, SDK de servicio y respuestas de
modelo simulados. No son una consulta Gemini real ni un teléfono físico.
Las capturas anteriores de clima corresponden al PR #3 que esta rama conserva.
