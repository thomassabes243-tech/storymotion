# Verificación del MVP

Se ejecutaron pruebas sobre el producto real, además de compilarlo.

| Prueba de aceptación  | Evidencia                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Texto → storyboard    | Playwright crea un proyecto desde el formulario y encuentra varios planos                      |
| Personaje recurrente  | Elena mantiene su ID; la demo reutiliza `archer` en seis planos y `army` en cuatro             |
| Duración y movimiento | Diez planos de demo, 900 fotogramas totales; todos tienen cámara o animación                   |
| Render real           | Remotion genera segmentos; FFmpeg concatena el MP4; estado COMPLETE                            |
| Formato               | FFprobe: 1080 × 1920, H.264, 30 FPS                                                            |
| Sin audio             | FFprobe: `audioStreams: 0`; no entrada de audio ni TTS                                         |
| Continuidad           | CharacterBible, dirección e iluminación comprobados; dawn conservado en la demo                |
| Persistencia          | SQLite se cierra/reabre y conserva análisis, escenas, capas, assets e identidades              |
| Edición parcial       | Cambiar una escena conserva las demás; prueba de caché invalida solo esa escena y la siguiente |
| Errores aislados      | Fallar una generación marca una sola escena; recomponerla conserva el resto                    |

Las 22 pruebas de módulos cubren análisis, escenas, duración exacta, encuadres, keyframes, parallax, serialización, CharacterBible, continuidad, almacenamiento, assets, prompts, trabajos y validación de video. Las cuatro pruebas Playwright cubren creación, edición, upload, recarga, móvil, preview, exportación HTTP 202, finalización del worker, descarga Range, operaciones de storyboard y fallo/reintento aislado.

La UI se revisó en 1440 × 1024 y 390 × 844. Las vistas móviles no producen desbordamiento horizontal; el preview carga sin errores JavaScript. El renderer y el reproductor utilizan la misma composición.

`verification.json` contiene el resultado de FFprobe y los identificadores del render comprobado. Ejecutar `npm run verify` actualiza ese archivo con el render completo más reciente.

Los assets de demostración son placeholders originales por capas. La verificación acredita el flujo y el movimiento del MVP; no acredita calidad artística de producción ni comprensión semántica general en relatos arbitrarios. Las APIs externas no están configuradas en este entorno y no se probaron contra un servicio comercial.
