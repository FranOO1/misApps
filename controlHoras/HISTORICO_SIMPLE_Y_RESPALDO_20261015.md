# Histórico de consulta y descarga

## Respaldo previo y recuperación

Antes de editar se crearon y comprobaron en GitHub estas referencias completas:

- Publicación actual: `backup/mis-horas-publicada-20261015-c9c77b8`, commit `c9c77b887ab170fbfc97e8918257f3baa79f2f34`. Su versión de Mis Horas coincide con `92bf4f8b07e0037438a2de326c798c7215c12b22`; los cambios posteriores de ese commit afectan a Plantómetro.
- Trabajo ya aprobado del archivo maestro, pendiente de publicación: `backup/mis-horas-maestro-pendiente-20261015-cb2f4a2`, commit `cb2f4a209958bf32d22583fb43452b8b8b56497d`.
- Se mantienen `backup/mis-horas-publicada-20261012-25cfb24`, `backup/mis-horas-publicada-20261013-ab19dc6`, `backup/mis-horas-publicada-20261014-92bf4f8` y las referencias visuales de `backup/mis-horas-referencias-20261014`.

Son respaldos completos de código, configuración, estilos, dependencias, recursos y service worker. No son exportaciones de jornadas o nóminas reales: no se ha accedido a los datos del usuario ni se ha generado una copia de ellos. La exportación JSON restaurable permanece en su apartado actual. El archivo maestro derivado también permanece disponible.

Para recuperar el código publicado antes de esta entrega, crear una rama desde el `main` que exista en ese momento y restaurar únicamente Mis Horas:

```sh
git fetch origin
git switch -c restore/mis-horas-historico origin/main
git restore --source=origin/backup/mis-horas-publicada-20261015-c9c77b8 --staged --worktree -- controlHoras gemini-prueba .github/workflows/mis-horas-ui.yml
```

Para recuperar el código con archivo maestro pero con el Histórico anterior, usar en su lugar `origin/backup/mis-horas-maestro-pendiente-20261015-cb2f4a2`. En ambos casos, asignar un nombre nuevo a la caché del service worker, ejecutar las comprobaciones y publicar mediante PR. No restaurar todo el repositorio sobre `main`, para conservar cambios ajenos a Mis Horas.

No importar copias antiguas, borrar localStorage/IndexedDB ni sustituir documentos de Firestore al recuperar el diseño. El formato de datos originales sigue siendo el mismo; retirar la interfaz de nómina no elimina las nóminas existentes. Los registros posteriores al respaldo deben conservarse.

## Cambio de pantalla

Histórico muestra un único selector de año, meses con jornadas, datos económicos registrados o cálculos de cobro derivados, y descarga mensual o anual. Se excluyen meses que solo contienen ajustes sin registros ni importes derivados. No aparecen formularios de nómina ni contexto para IA, ni se trasladan a otra pantalla. Se mantienen los datos y la compatibilidad del almacenamiento/importación/sincronización.

Cada tarjeta conserva su color, selección, horas y neto estimado; el ojo oculta este importe. Los botones `PDF con importes` y `Descargar PDF anual con importes` generan directamente un documento completo con importes, incluso si la pantalla está en modo privado, tal como indican sus etiquetas. No se cambia la elección de privacidad del exportador anterior de otras pantallas. La descarga de una cuenta comprueba que el historial esté cargado y descarta una operación si cambia la cuenta durante su recuperación.

## Informes y pruebas

Los modelos de cálculo son los mismos `HorasCore` / `HorasReports` utilizados por pantalla, PDF y archivo maestro. No se alteran fórmulas, tarifas, registros, Gemini ni sus credenciales/configuración.

El PDF mensual muestra cifras reales únicamente cuando ya existe nómina y las separa de la estimación. El anual incluye una tabla específica de bruto, deducciones y neto estimados, y cifras reales aparte. Mantiene doce meses, identifica ausencias, explica procedencia, periodos de trabajo/cobro, fórmulas, redondeos e IRPF y no extrapola.

Las pruebas usan exclusivamente datos ficticios: octubre con 12 horas (8 normales, 4 festivas), un descanso y nómina real de 125 bruto / 15 deducciones / 110 neto, frente a estimación de 140 / 14 / 126. Mayo tiene 4 horas y ninguna nómina: 40 / 4 / 36 estimados. Total anual 16 horas y 180 / 18 / 162 estimados, separado de 125 / 15 / 110 reales. También se prueba septiembre de otro año, meses vacíos, privacidad, selección, texto ampliado y conservación de los originales tras consultar/descargar.

Se ejecutaron localmente 155 pruebas Node. Las pruebas Chromium de CI descargan y abren los PDF con pypdf y los renderizan para revisión visual; sus capturas y PDF se adjuntan como artefacto. Los resultados de navegador deben comprobarse en el workflow del commit final antes de publicar. Esto no constituye una prueba real contra Google/Gemini: esta entrega no cambia esa integración.
