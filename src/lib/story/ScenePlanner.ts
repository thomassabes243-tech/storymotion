import { type Analysis, type Config, type Scene, reflow } from "../domain";
import { wordCount } from "./StoryAnalyzer";
import { ContinuityEngine } from "./ContinuityEngine";
export function calculateDuration(story: string, config: Config) {
  return config.durationMode === "target"
    ? config.targetDuration
    : Math.max(2, (wordCount(story) / config.settings.wordsPerMinute) * 60);
}
type Shot = {
  description: string;
  shot: Scene["camera"]["shot"];
  movement: Scene["camera"]["movement"];
  action: string;
};
function expand(event: Analysis["events"][number]): Shot[] {
  const base = event.sourceText.replace(/[.!?]$/, "");
  switch (event.action) {
    case "advance":
      return [
        {
          description: `Plano general: ${base}`,
          shot: "wide",
          movement: "slow_zoom_out",
          action: "establish",
        },
        {
          description: `Acompañar el avance: ${base}`,
          shot: "medium",
          movement: "follow_subject",
          action: "advance",
        },
      ];
    case "observe":
      return [
        {
          description: `Revelar el punto de observación: ${base}`,
          shot: "wide",
          movement: "reveal",
          action: "reveal",
        },
        {
          description: `Mirada y tensión: ${base}`,
          shot: "medium",
          movement: "slow_zoom_in",
          action: "observe",
        },
      ];
    case "fire_arrow":
      return [
        {
          description: `Preparación del arco: ${base}`,
          shot: "close",
          movement: "push_in",
          action: "draw_bow",
        },
        {
          description: `La flecha sale del arco: ${base}`,
          shot: "detail",
          movement: "dramatic_zoom",
          action: "fire_arrow",
        },
        {
          description: `Seguir el vuelo de la flecha`,
          shot: "wide",
          movement: "follow_subject",
          action: "arrow_flight",
        },
      ];
    case "raise_bow":
      return [
        {
          description: `El arquero alza el arco: ${base}`,
          shot: "close",
          movement: "slow_zoom_in",
          action: "raise_bow",
        },
      ];
    case "arrow_rain":
      return [
        {
          description: `Lluvia de flechas: ${base}`,
          shot: "wide",
          movement: "pan_down",
          action: "arrow_rain",
        },
        {
          description: `Reacción bajo las flechas: ${base}`,
          shot: "medium",
          movement: "camera_shake",
          action: "reaction",
        },
      ];
    case "discover":
      return [
        {
          description: `Descubrimiento: ${base}`,
          shot: "medium",
          movement: "reveal",
          action: "discover",
        },
        {
          description: `Detalle de lo descubierto: ${base}`,
          shot: "detail",
          movement: "push_in",
          action: "detail",
        },
      ];
    default:
      return [
        {
          description: base,
          shot: event.emotion === "calm" ? "wide" : "medium",
          movement:
            event.emotion === "tension" ? "camera_shake" : "slow_zoom_in",
          action: event.action,
        },
      ];
  }
}
export class ScenePlanner {
  plan(
    story: string,
    analysis: Analysis,
    config: Config,
  ): { scenes: Scene[]; warnings: string[] } {
    const seconds = calculateDuration(story, config),
      fps = config.fps,
      targetFrames = Math.round(seconds * fps);
    const warnings: string[] = [];
    let shots = analysis.events.flatMap((e) =>
      expand(e).map((s) => ({
        e,
        s,
        weight: e.emotion === "tension" ? 2.5 : e.emotion === "calm" ? 5 : 3.5,
      })),
    );
    const minFrames = Math.round(config.settings.fast[0] * fps);
    if (targetFrames < shots.length * minFrames)
      warnings.push(
        "La duración estimada exige planos más rápidos que el mínimo configurado. Puedes aumentar la duración objetivo.",
      );
    // Long targets create reframings of the same action and reuse its assets.
    const range = (e: Analysis["events"][number]) =>
      e.emotion === "tension"
        ? config.settings.fast
        : e.emotion === "calm"
          ? config.settings.contemplative
          : config.settings.normal;
    while (
      shots.reduce((n, v) => n + Math.round(range(v.e)[1] * fps), 0) <
      targetFrames
    ) {
      const index = shots.reduce(
        (best, v, i) => (v.weight > shots[best].weight ? i : best),
        0,
      );
      const item = shots[index];
      shots.splice(index + 1, 0, {
        ...item,
        s: {
          ...item.s,
          description: `Otro encuadre: ${item.s.description}`,
          shot: item.s.shot === "wide" ? "medium" : "wide",
          movement: shots.length % 2 ? "pan_left" : "slow_zoom_out",
        },
      });
      shots[index] = { ...item, weight: item.weight / 2 };
      shots[index + 1].weight = item.weight / 2;
    }
    if (shots.length > targetFrames) shots = shots.slice(0, targetFrames);
    // Integer frame allocation guarantees the requested total exactly.
    const weights = shots.map((v) =>
      v.e.emotion === "tension"
        ? (config.settings.fast[0] + config.settings.fast[1]) / 2
        : v.e.emotion === "calm"
          ? (config.settings.contemplative[0] +
              config.settings.contemplative[1]) /
            2
          : (config.settings.normal[0] + config.settings.normal[1]) / 2,
    );
    const lower = shots.map((v) =>
        Math.max(1, Math.round(range(v.e)[0] * fps)),
      ),
      upper = shots.map((v) => Math.max(1, Math.round(range(v.e)[1] * fps)));
    const feasible = lower.reduce((a, b) => a + b, 0) <= targetFrames;
    if (!feasible && !warnings.length)
      warnings.push(
        "El objetivo requiere planos más rápidos que los mínimos configurados.",
      );
    const frames = feasible ? [...lower] : shots.map(() => 1);
    let remaining = targetFrames - frames.reduce((a, b) => a + b, 0);
    while (remaining > 0) {
      const active = frames
        .map((n, i) => ({ i, capacity: upper[i] - n }))
        .filter((v) => v.capacity > 0);
      if (!active.length)
        throw new Error("Duración sin capacidad visual suficiente");
      const sum = active.reduce((n, v) => n + weights[v.i], 0);
      let allocated = 0;
      for (const v of active) {
        const add = Math.min(
          v.capacity,
          Math.floor((remaining * weights[v.i]) / sum),
        );
        frames[v.i] += add;
        allocated += add;
      }
      if (!allocated) {
        for (const v of active) {
          if (allocated >= remaining) break;
          frames[v.i]++;
          allocated++;
        }
      }
      remaining -= allocated;
    }
    const scenes = shots.map(({ e, s }, i): Scene => ({
      sceneId: `scene_${String(i + 1).padStart(3, "0")}`,
      start: 0,
      duration: frames[i] / fps,
      durationFrames: frames[i],
      sourceText: e.sourceText,
      description: s.description,
      location: e.location,
      characters:
        s.action === "reaction" &&
        analysis.characters.some((c) => c.id === "army")
          ? ["army"]
          : e.subjects,
      action: s.action,
      emotion: e.emotion,
      timeOfDay: e.timeOfDay,
      camera: {
        shot: s.shot,
        movement: s.movement,
        direction: "left_to_right",
        intensity: 0.8,
      },
      layers: [],
      animation: [
        "parallax",
        "dust_drift",
        ...(["fire_arrow", "arrow_flight", "arrow_rain"].includes(s.action)
          ? ["object_linear"]
          : []),
        ...(["raise_bow", "draw_bow", "fire_arrow"].includes(s.action)
          ? ["pose_change"]
          : []),
      ],
      transitionOut:
        i === shots.length - 1
          ? "fade"
          : e.emotion === "tension"
            ? "hard_cut"
            : i % 3 === 0
              ? "match_pan"
              : "crossfade",
      status: "NEEDS_REVIEW",
      intentionalStill: false,
      continuityNotes: [],
      clipStart: 0,
    }));
    return {
      scenes: new ContinuityEngine().apply(reflow(scenes, fps), analysis),
      warnings,
    };
  }
}
