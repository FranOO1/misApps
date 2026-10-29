# Relieve y odómetro — respaldo y recuperación

Publicación comprobada: c9c77b887ab170fbfc97e8918257f3baa79f2f34 (Pages correcto). Respaldo completo verificado: backup/mis-horas-publicada-20261029-c9c77b8.

Trabajo pendiente del PR #13, antes del relieve: 41a8221ad75d942fe94c76def3d4e67889387e25. Respaldo completo verificado: backup/mis-horas-pendiente-20261029-41a8221. Su workflow 38943285480 terminó correctamente; el artefacto mis-horas-ui-captures (12063663819) conserva capturas de móvil/tablet y PDF antes del relieve. Las referencias visuales de la versión publicada de Mis Horas permanecen en backup/mis-horas-referencias-20261014 (la parte Mis Horas de c9c77b8 coincide con 92bf4f8).

No se han exportado datos reales: el entorno no tiene acceso a la sesión de Firebase del usuario. Estos respaldos son de código. Los datos originales y las copias restaurables permanecen en su almacenamiento privado; no se incorporan al repositorio.

Para restaurar únicamente el código anterior en una rama nueva:

```sh
git fetch origin
git switch -c restore/mis-horas-relieve origin/main
git restore --source=origin/backup/mis-horas-pendiente-20261029-41a8221 --staged --worktree -- controlHoras gemini-prueba .github/workflows/mis-horas-ui.yml
```

Asignar una versión nueva a CACHE en controlHoras/sw.js, comprobar y publicar mediante PR. Para volver exactamente al código publicado antes de la entrega, usar backup/mis-horas-publicada-20261029-c9c77b8. No borrar localStorage, IndexedDB o Firestore; no importar registros antiguos. Restaurar código no restaura datos ni debe descartar registros posteriores.

La transición del neto es solo presentación después de guardar/borrar. Usa el cálculo común antes y después de la operación; no incluye tarifas o cantidades de demostración. Cada render cancela la transición anterior. Los importes ocultos y el movimiento reducido omiten la animación. La cifra final se anuncia una sola vez. Los PDF con importes ocultos requieren una confirmación explícita breve.

La configuración de Gemini, Auth y App Check se conserva. Las pruebas de Google simuladas en CI no acreditan una respuesta real; la prueba histórica real continúa requiriendo una sesión autorizada del usuario.
