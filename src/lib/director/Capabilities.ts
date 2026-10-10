import { existsSync } from "node:fs";
import { agentConfig } from "./contracts";
export function capabilities() {
  const localVideo =
    !!process.env.ACTIONMOTION_VIDEO_COMMAND &&
    existsSync(process.env.ACTIONMOTION_VIDEO_COMMAND);
  return {
    agent: agentConfig(),
    narrativeEngine: process.env.ACTIONMOTION_OLLAMA_URL
      ? "ollama_configured_unverified"
      : "local_rules",
    engines: [
      {
        id: "remotion-cutout",
        status: "available",
        kind: "cutout",
        detail:
          "Capas, poses, objetos y animación articulada de ilustraciones. No es video fotorrealista.",
      },
      {
        id: "imported-video",
        status: "available",
        kind: "video",
        detail:
          "Clips propios con movimiento real, sin generar imágenes nuevas.",
      },
      {
        id: "local-video-command",
        status: localVideo ? "configured_unverified" : "unavailable",
        kind: "image_to_video",
        detail:
          "Necesita ejecutable adaptador, modelo y GPU compatibles. No instalado ni validado aquí.",
      },
      {
        id: "optical-flow",
        status: "available",
        kind: "interpolation",
        detail:
          "FFmpeg minterpolate para clips; crea fotogramas intermedios, no anatomía ni acciones nuevas.",
      },
      {
        id: "super-resolution",
        status: "unavailable",
        kind: "enhancement",
        detail:
          "No hay modelo de superresolución instalado. El reescalado no crea detalle real.",
      },
    ],
    quality: [
      {
        id: "fast",
        available: true,
        width: 540,
        height: 960,
        crf: 28,
        detail: "Previsualización 540 × 960; consume menos recursos.",
      },
      {
        id: "balanced",
        available: true,
        width: 1080,
        height: 1920,
        crf: 20,
        detail: "Exportación 1080 × 1920 con el movimiento disponible.",
      },
      {
        id: "cinematic",
        available: false,
        width: 1080,
        height: 1920,
        crf: 17,
        detail:
          "Pendiente: motor generativo y evaluación de continuidad visual.",
      },
    ],
    limitations: [
      "No hay análisis automático de anatomía, rostros o expresiones. Requieren revisión visual.",
      "La normalización de audio no restaura una grabación ya saturada.",
    ],
  };
}
export function renderQuality(quality = "balanced") {
  if (quality === "cinematic")
    throw Error(
      "El modo cinematográfico necesita un motor de video validado; no está disponible.",
    );
  return quality === "fast"
    ? { width: 540, height: 960, crf: 28 }
    : { width: 1080, height: 1920, crf: 20 };
}
