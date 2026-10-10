# Prueba completa: la traición de Judas

[Descargar el MP4](https://raw.githubusercontent.com/thomassabes243-tech/storymotion/refs/heads/feat/actionmotion-director-ai/docs/actionmotion-e2e-judas.mp4).

Historia original en español, adaptación narrativa breve de la traición de Judas: cena, miradas, monedas, beso, arresto y reflexión. El título exacto permanece fijo: **¿Qué pasaría si supieras que tu amigo te va a traicionar?**

Se utilizó la aplicación existente: interfaz móvil → API → StoryAnalyzer local → storyboard por acciones → CharacterBible → storyboard dirigido y corregido para esta prueba → director persistente → escenas Remotion por capas → montaje FFmpeg → narración Piper y ambiente tonal local → QA → descarga y reproducción móvil.

## Resultado medido

| Comprobación           | Resultado                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| Duración               | 69,866667 s                                                          |
| Resolución y relación  | 1080 × 1920, 9:16                                                    |
| Video                  | H.264, CRF20 verificado en parámetros x264                           |
| FPS nominales y medios | 30/1, 30/1                                                           |
| Fotogramas             | 2.096, todos decodificados                                           |
| Streams                | 1 video + 1 AAC mono a 48 kHz                                        |
| Audio medido           | −15,96 LUFS; pico real −0,88 dBTP                                    |
| Decodificación         | Sin errores con FFmpeg `-xerror`                                     |
| Congelación            | 0 intervalos ≥1,5 s, umbral −50 dB                                   |
| Negro                  | 0 intervalos ≥0,8 s, `pix_th=0.03`                                   |
| Tomas                  | 23, de 2,73 a 3,63 s                                                 |
| Título fijo            | 2.096 fotogramas verificados; máscara mínima de coincidencia 99,09 % |
| Reproducción móvil     | Chromium 390 × 844; sin errores ni desbordamiento; video visible     |
| Descarga local HTTP    | 200; rangos de bytes 206                                             |
| Tamaño                 | 23.894.107 bytes, 23,9 MB                                            |

La narración es Piper real, voz local `es_MX-claude-high`, con 12 fragmentos sincronizados a sus grupos de tomas. No se utilizó el audio placeholder. El fondo tonal se sintetizó con FFmpeg y se mezcló con reducción de volumen durante la voz. La prueba desde creación móvil hasta QA y reproducción tardó 23 min 03 s en una máquina con cuota de 2 CPU y sin GPU, incluyendo calibración y revisión previa. La escritura del código y la revisión/publicación posterior no están incluidas en ese tiempo.

Pasaron 43 pruebas unitarias y 3 comprobaciones específicas repetidas tras la última corrección, TypeScript y la compilación de Next.js. Remotion compiló y renderizó realmente la fuente final. La continuidad verificó SHA256 de las apariencias, identificadores recurrentes y la cadena de estados narrativos. Se revisaron 46 fotogramas del archivo final, dos por toma; la revisión de muestras no certifica anatomía fotograma por fotograma.

SHA256 del MP4: `1155d69f65c4d5cf3aad10dff72246218eb351642892b9da29165fffba5d4981`.

Rama: `feat/actionmotion-director-ai`. Commits de implementación: `22abbb2`, `78a049b`; las pruebas y el video se entregan en un commit separado.

## Alcance real

**FUNCIONAL:** modo ilustrado 2.5D, perfiles Equilibrado, identidades y vestuario persistentes, fondos locales por capas, cámara con easing, gestos articulados, respiración y tela, manos/pan/monedas, partículas, sombras, luz de lámparas, fundidos, título fijo, narración y mezcla AAC. Se añadió una mezcla temporal ponderada de tres fotogramas para suavizar movimientos; no es interpolación por IA ni un desenfoque físico 3D.

**PARCIAL:** expresiones, anatomía y gestos son esquemáticos. El beso es una aproximación de perfil y el arresto una representación ilustrada. Los discípulos y guardias se representan con pocos personajes, no un grupo histórico completo. El movimiento no es actuación humana realista. La voz local puede conservar una entonación sintética; el fondo es un ambiente tonal sencillo, no una banda sonora orquestal.

**BLOQUEADO / no utilizado:** generación de video realista por IA, modos Generativo y Cinematográfico, modelos GPU e inferencia de pago. No se sustituyeron esos modos por ilustraciones: se seleccionó explícitamente cutout.

El storyboard se diseñó y corrigió específicamente para este ensayo después del análisis local por reglas. No demuestra dirección cinematográfica general por un modelo de lenguaje instalado. La memoria visual verifica definiciones e identificadores, no reconocimiento facial aprendido.

## Correcciones durante la prueba

- La primera frase tenía menos de cuatro segundos: se fusionaron sus dos encuadres para mantener todas las tomas entre 2 y 4 s. Quedaron 23 tomas, por encima de las 18 solicitadas.
- Se corrigieron las expresiones excesivamente sonrientes y se dibujó un perfil de Judas para hacer más comprensible el beso.
- Se corrigió solamente el fondo de la salida de Judas, reemplazando los árboles por arquitectura nocturna; las otras tomas se conservaron.
- Se incluyeron las lanzas en la definición persistente de los guardias.
- Se revisaron las composiciones antes del render y fotogramas medios/finales de cada toma del MP4 exportado.

El OCR disponible utiliza inglés: reconoce todas las palabras en orden, pero confunde el signo de interrogación inicial y algunos acentos. El texto exacto se verificó en la configuración y visualmente; la prueba de máscara comprueba su posición y permanencia en todos los fotogramas.

El título se coloca en una caja de 792 px desde x=138, y=255; permanece independiente de cámaras y transiciones. Se usan márgenes conservadores. La interfaz de cada plataforma y los subtítulos añadidos posteriormente pueden variar; no se garantiza compatibilidad con todas sus variantes.

## Evidencia

- [Historia](actionmotion-e2e-judas-story.txt)
- [QA técnico, audio y reproducción móvil](actionmotion-e2e-judas-verification.json)
- [Proyecto y storyboard persistidos](actionmotion-e2e-judas-project.json)
- [Decodificación completa y detección de congelación/negro](actionmotion-e2e-judas-decode.log)
- [Título: OCR y estabilidad de posición durante todos los fotogramas](actionmotion-e2e-judas-title-qa.json)
- [Tomas 1–12](actionmotion-e2e-judas-frames-1.jpg), [tomas 13–23](actionmotion-e2e-judas-frames-2.jpg)
- [Finales de tomas 1–12](actionmotion-e2e-judas-frames-1-end.jpg), [finales de tomas 13–23](actionmotion-e2e-judas-frames-2-end.jpg)
- [Reproducción móvil](actionmotion-e2e-judas-mobile-player.png)

No se alteró producción, se contrataron servicios ni se consumieron APIs de pago. Los modelos locales de Piper ya estaban instalados.

## Reproducir

Configurar un directorio de datos aislado, la ruta de Python/Piper y el modelo local. Iniciar `npm run start` con `PORT=3104`, `ACTIONMOTION_EXTERNAL_PAID_CALLS=false` y sin proveedores de imágenes/lenguaje externos. Ejecutar:

```sh
npx tsx scripts/actionmotion-e2e-judas.ts
npx tsx scripts/review-judas-frames.ts --final
npx tsx scripts/qa-judas-title.ts
```

El runner conserva los identificadores del proyecto y los trabajos en `e2e-run.json`, reutiliza audios cacheados y espera el trabajo persistente; puede reanudarlo sin duplicar un render finalizado. El parámetro `ACTIONMOTION_E2E_PREVIEW_ONLY=true` prepara el proyecto antes de aprobar su render, para revisión autónoma local.
