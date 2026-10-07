# StoryMotion

MVP independiente que transforma una historia escrita en un storyboard editable y un MP4 animado 2.5D sin audio. No tiene dependencias de ClipForge.

## Ejecutar localmente

Requisitos: **Node.js 24+**, FFmpeg, FFprobe y Chromium/Chrome. SQLite viene integrado en Node; no necesitas servidores de base de datos ni cuentas de IA.

```bash
cd storymotion
npm ci
npm run dev
```

Abre `http://localhost:3000`. El comando inicia **Next.js y el worker de render**. Si el puerto está ocupado, Next indica el puerto alternativo. Para fijarlo: `PORT=3100 npm run dev`. En esta sesión la aplicación usa **http://localhost:3001**.

La primera apertura crea una demostración de 30 segundos con diez planos. También puedes crearla y renderizarla desde la terminal:

```bash
npm run demo
npm run demo -- --render
npm run verify
```

En producción local:

```bash
npm run build
npm start
```

Para separar procesos, usa `npm run dev:web` y `npm run worker`. El worker debe usar el mismo directorio de datos que la web. Si falta Chromium, instala Chrome/Chromium o usa el instalador de navegador de Remotion; `CHROME_EXECUTABLE` permite especificar su ejecutable. `FFMPEG_PATH` y `FFPROBE_PATH` permiten indicar rutas alternativas.

La aplicación está pensada para uso de una persona. Para abrirla desde un teléfono en local, usa la dirección LAN del equipo y el puerto indicado. La instalación PWA requiere HTTPS o localhost; la persistencia reside en el servidor, no en el teléfono. La instalación web permite acceso con una contraseña del propietario; no incluye cuentas multiusuario ni edición colaborativa.

Para alojamiento con enlace HTTPS, consulta [Publicación en Render](docs/HOSTING.md). El proyecto incluye Dockerfile y Blueprint con disco persistente; subir el código no publica la aplicación ni activa cobros.

## Flujo de uso

1. **Nuevo proyecto:** nombre, historia, Historical Parchment, duración automática o de 2–600 segundos, formato vertical y 24/30/60 FPS. La salida predeterminada es 1080 × 1920, 30 FPS.
2. **Analizar:** detectar personajes, lugares, objetos, acciones y cambios temporales; expandir acontecimientos en planos. La división usa acciones y subacciones, además de límites lingüísticos.
3. **Storyboard:** editar un plano, dividir, unir con el siguiente, mover o recomponer solo sus assets de muestra.
4. **Editor:** descripción, duración, cámara, dirección, transición, capas, asset, posición, escala, rotación, profundidad, opacidad, desenfoque y movimiento lineal. Importar PNG/JPG/WebP de hasta 20 MB. Los PNG conservan transparencia.
5. **Preview:** comprobar secuencia, parallax, partículas, poses y transiciones usando la misma composición de Remotion que el render.
6. **Render:** encolar, consultar progreso, revisar errores, reintentar y descargar MP4. El proyecto y los renders anteriores permanecen guardados.

Los rangos de duración y la velocidad de 150 palabras/minuto se modifican en Configuración y se copian a los nuevos proyectos. El objetivo temporal se reparte en fotogramas enteros; si requiere planos más cortos que los mínimos, se muestra una nota. Los objetivos largos crean otros encuadres reutilizando assets.

## Qué incluye y qué requiere revisión

- Análisis **local por reglas**, principalmente en español y con acciones comunes en inglés. Detecta nombres recurrentes, roles, acciones, lugares, época, tensión, iluminación y cambios temporales. Conserva identificadores y definiciones entre planos. **No equivale a comprensión semántica general por un LLM**: pronombres ambiguos, relaciones complejas y acontecimientos implícitos requieren revisión. Se puede sustituir por un proveedor de análisis sin cambiar el planificador ni el renderer.
- Assets originales **provisionales**, ilustrados de forma procedural y separados en capas. Son útiles para verificar el flujo y el movimiento; la calidad artística final depende de assets importados o de un proveedor de imágenes. No se realiza separación automática de una fotografía en capas ni extracción de personajes.
- Cutout por desplazamiento, escala y cambio de poses con fundido corto. Las poses de demostración están preparadas; para una identidad importada, los cambios de pose se definen mediante el JSON o un proveedor. No hay rigging 3D.
- Historical Parchment es el único perfil desarrollado. El registro de estilos permite añadir perfiles posteriores.
- Zoom, paneo, seguimiento, reveal, shake, parallax por capa, partículas, flecha lineal y lluvia de flechas. Transiciones: corte, fade, crossfade, continuidad de cámara, match pan, barrido, flash, blur y zoom.
- Continuidad conserva identidad, dirección por ubicación, estilo y hora; diagnostica inversiones y planos inmóviles accidentales. No garantiza por sí sola que un proveedor externo respete una identidad: los prompts y referencias transmiten esas restricciones.
- No se importa audio, no se transcribe, no se genera voz ni se llama a Whisper/TTS. Remotion renderiza con `muted: true`; FFmpeg concatena con `-an`; FFprobe exige cero streams de audio.

## Persistencia y recuperación

`data/storymotion.sqlite` guarda proyectos completos, revisión de edición, assets, preferencias y trabajos. `data/assets/` guarda imágenes, `data/cache/` segmentos y `data/renders/` los MP4 finales. Para respaldar, detén los procesos y copia **todo el directorio data**; para mover datos usa `STORYMOTION_DATA_DIR`.

SQLite utiliza WAL y revisiones optimistas para impedir que un editor desactualizado sobrescriba cambios. La web encola y devuelve HTTP 202: nunca mantiene abierta la petición durante el render. El worker reclama trabajos de forma transaccional, guarda progreso y recupera trabajos cuyo proceso anterior terminó.

Cada render utiliza un snapshot inmutable del proyecto. La caché compara plano, assets, configuración y plano anterior para la transición de entrada. Editar un plano vuelve a renderizar ese segmento y, cuando depende de su transición, el siguiente; reutiliza los demás. Los archivos finales se publican solo después de validar FFprobe. Si falla un render, puedes reintentarlo y conservar sus segmentos completos. La caché se conserva hasta que se borre manualmente `data/cache` con el worker detenido.

## Proveedores opcionales

Copia `.env.example` a `.env` y reinicia ambos procesos. Nunca se envían claves al navegador.

**Imagen:** implementa `ImageProvider` o configura `IMAGE_PROVIDER_URL` y `IMAGE_PROVIDER_KEY`. El adaptador HTTP es una **interfaz gateway**, no una URL que funcione directamente con todos los servicios comerciales. Un gateway convierte este contrato al SDK/API del proveedor elegido.

Petición `POST` (Bearer opcional):

```json
{
  "prompt": "...",
  "negativePrompt": "...",
  "transparent": true,
  "width": 1080,
  "height": 1920,
  "referenceAssets": [{ "mime": "image/png", "base64": "..." }]
}
```

Respuesta:

```json
{ "base64": "<imagen codificada sin prefijo data:>", "mime": "image/png" }
```

`VisualPromptBuilder` incorpora CharacterBible, época, paleta, ubicación, luz, composición y continuidad. Se reutiliza un asset generado cuyo prompt sea idéntico. La generación es explícita por capa: un cambio de cámara no solicita una imagen nueva. Sin proveedor, el control de generación queda deshabilitado y funcionan importación, biblioteca y placeholders.

**Análisis:** `STORY_ANALYZER_URL` y `STORY_ANALYZER_KEY` activan un gateway que recibe `{story, style, schemaVersion: 1}` y devuelve `AnalysisSchema` definido en `src/lib/domain.ts`. La respuesta se valida antes de guardarse. Para documentar un contrato real desde el MVP, descarga el JSON del proyecto de demostración y usa su propiedad `analysis` como ejemplo. Un error conserva la historia; puedes reintentar.

## Arquitectura

```text
Story → StoryAnalyzer → Narrative Model → ScenePlanner
  → ContinuityEngine + CharacterBible
  → AssetManager + VisualPromptBuilder → Visual Plan
  → AnimationEngine + CameraMotion + Parallax
  → Remotion → segmentos H.264 → FFmpeg → FFprobe → MP4 sin audio
```

`StoryAnalyzer` y `ScenePlanner` no importan React ni Remotion. `src/lib/domain.ts` define JSON versionado y esquemas Zod. `ProjectRepository`, `StorageProvider`, `StoryAnalysisProvider` e `ImageProvider` separan persistencia, almacenamiento y proveedores. SQLite puede sustituirse por PostgreSQL, y filesystem por S3/R2; esos adaptadores futuros **no están implementados**. La cola persistente de este MVP pertenece al adaptador SQLite.

## Comprobaciones

```bash
npm test                 # 22 pruebas de módulos y persistencia real
npm run typecheck
npm run build
npm run test:e2e         # abre servidor aislado en 3100, datos en data-e2e
# O usa una aplicación ya iniciada:
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e
npm run verify          # requiere un render completo; escribe docs/verification.json
```

Las pruebas de navegador cubren historia → storyboard, edición de una sola escena, importación, reapertura, móvil, preview, división/unión/movimiento y conflictos de revisión. El render real de la demostración y `verify` cubren dimensiones, H.264, FPS, duración, cero audio, continuidad y persistencia. Consulta `docs/VERIFICATION.md` para la evidencia de esta implementación.

Dependencias y versiones fijadas en `package-lock.json`. Para uso comercial, revisa la licencia vigente de Remotion según el tamaño y uso de tu organización.
