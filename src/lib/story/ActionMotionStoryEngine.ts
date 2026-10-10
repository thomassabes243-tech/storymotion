import type { Project } from "../domain";
import { normalize } from "./StoryAnalyzer";
export const RAINY_STORY =
  "Un hombre camina por una calle oscura durante una noche lluviosa. Lleva una chaqueta negra. De pronto escucha un ruido detrás de él. Se detiene, gira lentamente la cabeza y observa una figura misteriosa al fondo de la calle. Comienza a correr mientras la cámara lo sigue.";
export class ActionMotionStoryEngine {
  enrich(project: Project) {
    const p = structuredClone(project);
    let state = "inicio",
      weather: "rain" | "clear" = /lluv|rain/.test(normalize(p.story))
        ? "rain"
        : "clear";
    p.scenes = p.scenes.map((s, i) => {
      if (
        /dejo de llover|lluvia termino|rain stopped/.test(
          normalize(s.sourceText),
        )
      )
        weather = "clear";
      const next =
        s.action === "advance"
          ? "walking"
          : s.action === "stop"
            ? "stopped"
            : s.action === "head_turn"
              ? "looking_back"
              : s.action === "escape"
                ? "running"
                : s.action === "observe"
                  ? "observing"
                  : state;
      const result = {
        ...s,
        environment: {
          weather,
          lighting: `${s.timeOfDay}; dirección de luz coherente en ${s.location}`,
          objects: p.analysis?.objects || [],
        },
        narrativeState: {
          initial: state,
          final: next,
          actorIds:
            p.analysis?.events.find((e) => s.sourceText === e.sourceText)
              ?.subjects || s.characters,
          nextSceneId: p.scenes[i + 1]?.sceneId,
        },
      };
      state = next;
      return result;
    });
    return p;
  }
}
export class ActionMotionCinematicDirector {
  plan(project: Project) {
    const p = structuredClone(project);
    for (let i = 0; i < p.scenes.length; i++) {
      const s = p.scenes[i];
      if (s.action === "advance") {
        s.camera.angle = "lateral";
        s.camera.movement = "follow_subject";
      }
      if (s.action === "head_turn") {
        s.camera.angle = "over_shoulder";
        s.camera.shot = "close";
        s.camera.movement = "slow_zoom_in";
      }
      if (s.action === "escape") {
        s.camera.movement = "follow_subject";
        s.animation = [...new Set([...s.animation, "character_run"])];
      }
      s.transitionOut =
        i === p.scenes.length - 1
          ? "fade"
          : s.location !== p.scenes[i + 1].location
            ? "crossfade"
            : "hard_cut";
    }
    return p;
  }
}
