# Voz automática

StoryMotion puede narrar la historia escrita completa en español y exportar un MP4 con audio AAC. Los proyectos existentes conservan la exportación sin audio. En un proyecto, abre **Audio**, elige **Voz automática en español** y guarda; después exporta. Los proyectos nuevos activan la voz si está instalada. Puedes subir música propia y ajustar su volumen; se atenúa durante la voz. No se incluye música por defecto.

El motor local no cobra por carácter ni requiere una API externa. Utiliza los recursos del servidor existente; no cambia su plan ni crea servicios de pago. Una narración larga tarda más que una corta. La voz es sintética; actualmente hay una voz masculina de español mexicano, con tres velocidades.

## Instalación local

Requiere Python 3.11 o posterior, FFmpeg y las dependencias habituales de StoryMotion:

```sh
python3 -m venv voice-env
voice-env/bin/pip install -r scripts/voice-requirements.txt
voice-env/bin/python scripts/download-voice.py voices
```

Configura `STORYMOTION_VOICE_PYTHON` y `STORYMOTION_VOICE_MODEL` con rutas absolutas en `.env`. Docker incluye automáticamente el entorno de voz y el modelo verificado. Si no está instalado, el programa sigue permitiendo exportar sin audio.

## Duración y persistencia

Las escenas siguen naciendo del texto. La voz no se transcribe ni se interpreta para decidir acontecimientos. Cuando los fragmentos del storyboard cubren la historia original en orden, la síntesis produce duraciones por fragmento y distribuye sus planos dentro de ellas. Si se reordenan o editan los fragmentos, se narra la historia original completa y se adapta proporcionalmente el tiempo visual. Las poses y keyframes se ajustan al nuevo número de fotogramas.

La duración final sigue la narración completa: una historia larga no se recorta para alcanzar una duración objetivo breve. El storyboard editable conserva sus tiempos originales; cada trabajo guarda también el plan con los tiempos efectivamente renderizados. La vista previa del storyboard muestra el ritmo visual estimado sin voz; el MP4 exportado incluye el audio y su duración real.

SQLite guarda la configuración de audio, los recursos y las duraciones; filesystem guarda los audios. La caché depende del texto, voz, velocidad y versión del motor. Cambiar una imagen o la cámara reutiliza la narración. Los fallos de voz se muestran en el trabajo y pueden reintentarse sin perder el proyecto.

## Componentes y licencias

La interfaz `SpeechProvider` separa la síntesis de la planificación y permite otros motores. `AudioManager` gestiona caché, importación y mezcla; Remotion renderiza las capas sin audio y FFmpeg añade voz/música al final sin recodificar la imagen.

- [Piper 1.4.1](https://github.com/OHF-Voice/piper1-gpl): GPL-3.0. Se utiliza como proceso Python independiente. Su distribución y código fuente incluyen la licencia correspondiente.
- [Modelo es_MX-ald-medium](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD): dataset publicado bajo [Unlicense](https://unlicense.org/), voz de Ald, ajustada desde davefx (dataset CC0). Los dos archivos descargados se verifican con SHA-256.

No se envía la historia a un proveedor externo de voz. No se usa Whisper.
