# Contratos del MVP

El proyecto usa `schemaVersion: 1`. Las escenas almacenan inicio y duración en segundos y `durationFrames` como fuente temporal del renderer. `reflow` ordena los inicios, ajusta duraciones a fotogramas enteros y reescala keyframes y poses al modificar la duración. Los IDs se mantienen al editar y mover; dividir crea un ID nuevo.

## Estados

Proyecto: DRAFT → PLANNING → ASSETS_PENDING → ASSETS_READY. Los fallos de análisis quedan registrados como FAILED con la historia original conservada. Los planos tienen READY, GENERATING, FAILED o NEEDS_REVIEW de forma independiente.

Trabajo: RENDER_QUEUED → RENDERING → COMPLETE/FAILED. Un reintento vuelve a RENDER_QUEUED. El snapshot incluye historia, análisis, personajes, lugares, estilo, escenas, assets y animaciones. El trabajo guarda progreso, plano actual, error, ruta de salida y resultado de FFprobe.

La comprobación de proceso local permite recuperar un render tras reiniciar el worker. No es una cola distribuida: una versión multi-host necesitará leases y heartbeats en PostgreSQL o un sistema de colas externo.

## API local

| Ruta                                | Método     | Resultado                                             |
| ----------------------------------- | ---------- | ----------------------------------------------------- |
| `/api/projects`                     | GET / POST | Listar / crear proyecto                               |
| `/api/projects/:id`                 | GET        | Proyecto con trabajos                                 |
| `/api/projects/:id/analyze`         | POST       | Análisis y storyboard con capas                       |
| `/api/projects/:id/scenes/:sceneId` | PATCH      | Guardar escena y reordenar tiempos; requiere revisión |
| misma ruta                          | POST       | `split`, `merge`, `move`, `regenerate` o `generate`   |
| `/api/projects/:id/render`          | POST       | Encolar, HTTP 202                                     |
| `/api/projects/:id/json`            | GET        | Descargar proyecto completo                           |
| `/api/assets`                       | GET / POST | Biblioteca / importar multipart                       |
| `/api/assets/:id/data`              | GET        | Imagen normalizada PNG                                |
| `/api/jobs/:id`                     | GET        | Estado y progreso                                     |
| `/api/jobs/:id/retry`               | POST       | Reintentar trabajo fallido                            |
| `/api/jobs/:id/video`               | GET        | MP4 con soporte Range; `?download=1` para descargar   |
| `/api/demo`                         | POST       | Crear u obtener demostración                          |
| `/api/settings`                     | GET / PUT  | Preferencias locales                                  |

Los cuerpos se validan con Zod. La capa de almacenamiento rechaza rutas absolutas y traversal; las rutas de assets y video se resuelven por IDs registrados. Las imágenes importadas se decodifican con Sharp y se normalizan a PNG, preservando alpha. Los renders usan fuentes de imagen locales codificadas: no dependen de que Next siga atendiendo peticiones.
