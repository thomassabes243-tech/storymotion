# ActionMotion: prueba completa de dos minutos

**FUNCIONAL dentro del alcance 2.5D solicitado, con limitaciones visuales.** Ejecutada el 10 de octubre de 2026 sobre `feat/actionmotion-director-ai`. No se modifica producción ni se hacen llamadas a proveedores pagos, generativos, cinematográficos o ficticios.

[Descargar MP4 con narración real](https://raw.githubusercontent.com/thomassabes243-tech/storymotion/refs/heads/feat/actionmotion-director-ai/docs/actionmotion-e2e-120.mp4) · [Historia original](actionmotion-e2e-120-story.txt) · [Reporte técnico completo](actionmotion-e2e-120-verification.json) · [Log completo de decodificación](actionmotion-e2e-120-decode.log) · [Fotogramas](actionmotion-e2e-120-frames.jpg) · [Reproductor móvil](actionmotion-e2e-120-mobile-player.png).

## Resultado comprobado

| Comprobación    | Resultado                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Historia        | «El mensaje del valle», original, 259 palabras                                                      |
| Storyboard      | 38 planos por acciones; personajes Darío, Elena y ejército                                          |
| Perfil          | Equilibrado, ilustraciones 2.5D                                                                     |
| Video           | H.264, 1080×1920, 9:16, 30 FPS constantes                                                           |
| Compresión      | CRF20, comprobado también en los parámetros x264 presentes en el MP4                                |
| Duración        | 120,233333 segundos; 3.607 fotogramas                                                               |
| Audio           | Narración real Piper local, `es_MX-claude-high`, español, modo narrador                             |
| Streams         | Un stream de video y uno AAC mono de 48 kHz                                                         |
| Audio observado | Aproximadamente 161 kbps; objetivo de codificación 192 kbps                                         |
| Sonoridad       | −16,15 LUFS; pico verdadero −1,23 dBTP; sin saturación según esa medición                           |
| Decodificación  | Video y audio completos, FFmpeg `-xerror`, sin fallos; 3.607 frames decodificados                   |
| Congelación     | Ningún intervalo detectado con umbral −50 dB y duración mínima 1,5 s                                |
| Cuadros negros  | Ningún intervalo detectado con duración mínima 0,8 s y `pix_th=0.03`                                |
| Uso móvil       | Chromium 390×844, sin desbordamiento ni errores de página; playback y fotograma visible comprobados |
| Descarga        | HTTP 200 con attachment; reproducción por rangos HTTP 206                                           |
| Archivo         | 26.023.918 bytes, aproximadamente 26 MB                                                             |

La primera pasada completa, incluyendo interfaz, calibración de voz, planificación, render y QA, tardó 942.870 ms: aproximadamente 15 minutos y 43 segundos en CPU de dos núcleos. Es una medición de esta prueba, no una promesa de rendimiento del servidor publicado.

SHA256 del MP4: `613ce3ec299e6375570b58cc0df92924a7e9d60fd3d6b3d35d70af52aa194c0e`.

## Flujo real ejecutado

El proyecto se creó desde la interfaz móvil. La API y el worker existentes analizaron el texto con reglas locales y dejaron el storyboard pendiente de aprobación. CharacterBible y ContinuityEngine comprobaron referencias e identidades. El ejecutor aprobó el proyecto dentro de la autorización del usuario y el director persistente preparó assets, animación y render.

Piper ya estaba instalado en `/workspace/storymotion-voice-env`, con voces en `/workspace/storymotion-voices`. Se utilizó la librería local mediante el proveedor existente; no se descargaron modelos ni se contrataron servicios. La configuración estaba ausente en las pruebas anteriores. Cuatro síntesis de calibración ajustaron la velocidad a 0,8513355 y produjeron 120,224853 segundos de narración. La versión final se reutilizó desde la caché para renderizar, sin volver a sintetizarla. **No se utilizó el audio placeholder.**

Remotion renderizó las capas, cámara, personajes articulados, partículas y objetos. FFmpeg montó los segmentos y añadió AAC. El director realizó su QA y se ejecutó además una decodificación completa guardando todo el log, para no depender de un resumen de stderr. La API entregó el MP4 y Chromium comprobó reproducción, dimensiones, duración y un fotograma decodificado visible. La primera captura se tomó antes de que pintara el video; se corrigió la comprobación para esperar playback efectivo y repetir la captura.

## Qué quedó bien y qué sigue limitado

- El flujo de historia a archivo descargable funcionó sin intervención del usuario. No hubo fallos de render que exigieran reintentos; sí hubo calibración automática de duración y una corrección de la captura de verificación.
- Las tres definiciones de personajes conservan sus identificadores y apariencia registrada. La narración incluye el texto original completo. El archivo cumple formato, duración y streams solicitados.
- **La calidad artística es básica:** son ilustraciones procedurales provisionales. Los rostros son genéricos, los movimientos de extremidades son esquemáticos y las localizaciones no tienen una distribución espacial detallada.
- Algunos detalles no se muestran fielmente: la cinta azul, los gestos de señalar y guardar la espada, y la interacción con el terreno. El analizador por reglas también puede interpretar frases figuradas como acciones o cambios de lugar; esta prueba no demuestra comprensión narrativa general.
- La narración se conservó como un solo grupo para leer todas las palabras una vez. Se distribuye la duración visual dentro de ese grupo; **no hay alineación palabra por palabra ni sincronización labial**.
- El reporte mantiene 164 avisos por uso de assets provisionales, repetidos por plano/capa, y un aviso informativo de audio opcional. No son 164 imágenes fallidas ni errores de decodificación.
- El QA de congelación/negro usa los umbrales indicados. No garantiza ausencia de pausas inferiores a esos umbrales ni evalúa rostros, manos, anatomía o pronunciación.

Esta prueba acepta el alcance 2.5D solicitado. No se presenta como una prueba de actuación humana generada o de producción cinematográfica fotorrealista.

## Reproducir la prueba

Se necesita un build Next.js existente, Chromium, FFmpeg/FFprobe, Node 24 y los modelos locales de Piper. Estas rutas corresponden al entorno verificado; adaptarlas si la instalación está en otro directorio.

```bash
export STORYMOTION_DATA_DIR=/workspace/storymotion/data/actionmotion-e2e-120
export STORYMOTION_VOICE_PYTHON=/workspace/storymotion-voice-env/bin/python
export STORYMOTION_VOICE_MODEL=/workspace/storymotion-voices/es_MX-ald-medium.onnx
export ACTIONMOTION_EXTERNAL_PAID_CALLS=false
export ACTIONMOTION_REQUIRE_APPROVAL=true
export ACTIONMOTION_OLLAMA_URL=
export STORY_ANALYZER_URL=
export IMAGE_PROVIDER_URL=
export PORT=3103
npm run start
```

En otra terminal con las mismas variables:

```bash
npx tsx scripts/actionmotion-e2e-120.ts
```

El ejecutor guarda sus identificadores en `data/actionmotion-e2e-120/e2e-run.json`; al repetirlo reutiliza el proyecto y el trabajo existente. Su ruta de fallback está identificada como tono placeholder y no se activó en esta ejecución. La autorización local de storyboard no habilita gastos ni despliegues.
