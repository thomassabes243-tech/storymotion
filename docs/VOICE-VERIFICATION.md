# Verificación de narración automática

Fecha: 8 de octubre de 2026. Instalación: https://storymotion.onrender.com.

Flujo verificado: historia escrita → storyboard → configuración de voz persistente → trabajo en segundo plano → síntesis local → tiempos visuales ajustados → MP4 con voz y música opcional → reproducción móvil.

- 31 pruebas de módulos aprobadas: narrativa, identidad, animación, persistencia, caché de voz, temporización por fragmentos, mezcla real AAC y recuperación de procesos terminados o con PID reutilizado.
- TypeScript y compilación de producción aprobados.
- Prueba local de navegador de narración aprobada: crear, guardar velocidad, recargar, exportar y reproducir a 390 × 844 sin errores ni desbordamiento horizontal.
- Síntesis Piper verificada en la imagen Docker de voz con 1 CPU, 768 MB y sin capacidades Linux adicionales.
- Exportación real local desde StoryMotion/Remotion: H.264, 1080 × 1920, 30 FPS, 5,166667 segundos y una pista AAC.
- Exportación real en Render: narración automática desde «José decidió obedecer a Dios», música importada de prueba con mezcla/atenuación, H.264, 1080 × 1920, 30/1 FPS y una pista AAC. Duración de imagen: 2,166667 s; audio: 2,166 s. Decodificación completa con FFmpeg sin errores.
- Navegador móvil contra la instalación publicada: controles de voz guardados, MP4 reproducible, dimensiones correctas, sin errores de JavaScript y sin desbordamiento horizontal.
- Memoria observada en el servicio durante la prueba: máximo registrado de 1.692 MB decimales en muestras cada 30 segundos; plan existente de 2 GB. No se creó otro servicio ni se cambió el plan.

La prueba de reinicio detectó un caso real de un proceso zombie: la comprobación del PID lo consideraba activo y retenía el render. La corrección verifica su estado en Linux y guarda su instante de creación para distinguir un PID reutilizado. El trabajo volvió a la cola y reanudó sus planos pendientes utilizando los segmentos guardados.

Los proyectos existentes mantienen el modo sin audio. El validador continúa exigiendo cero pistas en ese modo; para voz exige una pista AAC. La vista previa de storyboard conserva su ritmo visual estimado; el render guarda el plan ajustado y su duración final.

Cinco pruebas de navegador aprobadas tras corregir la prueba para reconocer un render que ya estaba activo: narración, edición/importación/reapertura, exportación sin audio de 30 segundos, estructura de escenas y fallo aislado de una imagen. La exportación silenciosa reanudó el trabajo interrumpido y finalizó con H.264, 1080 × 1920, 30 FPS y cero pistas de audio.

Después del nuevo despliegue se reabrió el proyecto publicado, se confirmó la persistencia de voz, música y MP4 anteriores y se exportó de nuevo reutilizando recursos. El nuevo trabajo guardó la identidad del proceso y finalizó con una pista AAC.

Demostración completa de José: 1.887 palabras narradas, 56 fragmentos, 151 planos, 22.838 fotogramas, 761,266667 segundos, H.264 1080 × 1920 a 30/1 FPS y una pista AAC. Decodificación completa aprobada; reproducción móvil y saltos a seis secciones aprobados. El archivo de esta demostración se entrega por separado, fuera del almacenamiento de la app publicada.
