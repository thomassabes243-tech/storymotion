import { createHash } from "node:crypto";
import type { Project, Scene } from "../domain";
import { sampleLayer } from "../animation/AnimationEngine";
import { VisualPromptBuilder } from "../assets/VisualPromptBuilder";
import { FileSystemStorage } from "../storage/StorageProvider";
import { FFmpegService, runProcess } from "../render/FFmpegService";
import type { QualityIssue } from "./contracts";
export class VisualDesignerAgent {
  plan(project: Project) {
    const p = structuredClone(project);
    for (const c of p.analysis?.characters || [])
      c.referenceAssetIds = p.assets
        .filter((a) => a.characterId === c.id && a.source !== "placeholder")
        .map((a) => a.id);
    for (const l of p.analysis?.locations || [])
      l.referenceAssetIds = p.assets
        .filter((a) => a.locationId === l.id && a.source !== "placeholder")
        .map((a) => a.id);
    const builder = new VisualPromptBuilder();
    return {
      project: p,
      prompts: Object.fromEntries(
        p.scenes.map((s) => [
          s.sceneId,
          builder.build(p, s, "background").prompt,
        ]),
      ),
    };
  }
}
export class MotionDirectorAgent {
  plan(project: Project) {
    const p = structuredClone(project);
    let previous: Scene | undefined;
    for (const scene of p.scenes) {
      const same =
        previous?.location === scene.location &&
        previous?.timeOfDay === scene.timeOfDay;
      if (same && previous) scene.camera.direction = previous.camera.direction;
      if (!scene.clipAssetId && !scene.intentionalStill) {
        if (scene.camera.movement === "static")
          scene.camera.movement = "slow_zoom_in";
        for (const layer of scene.layers.filter(
          (l) => l.kind === "character",
        )) {
          const prev = same
            ? previous?.visualPlan?.exit[layer.characterId || ""]
            : undefined;
          if (scene.action === "advance" && !layer.keyframes.length)
            layer.keyframes = [
              { frame: 0, x: layer.x },
              {
                frame: scene.durationFrames - 1,
                x:
                  layer.x +
                  (scene.camera.direction === "right_to_left" ? -110 : 110),
              },
            ];
          if (prev) {
            const current = sampleLayer(layer, 0);
            const dx = prev.x - current.x,
              dy = prev.y - current.y;
            layer.x += dx;
            layer.y += dy;
            layer.keyframes = layer.keyframes.map((k) => ({
              ...k,
              x: k.x === undefined ? undefined : k.x + dx,
              y: k.y === undefined ? undefined : k.y + dy,
            }));
          }
        }
      }
      const positions = (frame: number) =>
        Object.fromEntries(
          scene.layers
            .filter((l) => l.characterId)
            .map((l) => {
              const v = sampleLayer(l, frame);
              return [l.characterId!, { x: v.x, y: v.y }];
            }),
        );
      scene.visualPlan = {
        previousSceneId: same ? previous?.sceneId : undefined,
        identityHashes: Object.fromEntries(
          (p.analysis?.characters || [])
            .filter((c) => scene.characters.includes(c.id))
            .map((c) => [
              c.id,
              createHash("sha256")
                .update(JSON.stringify(c.appearance))
                .digest("hex"),
            ]),
        ),
        referenceAssetIds: p.assets
          .filter(
            (a) =>
              scene.characters.includes(a.characterId || "") ||
              a.locationId === scene.location,
          )
          .map((a) => a.id),
        motionMode: scene.clipAssetId ? "video" : "cutout",
        entry: positions(0),
        exit: positions(scene.durationFrames - 1),
      };
      if (scene.clipAssetId || previous?.clipAssetId) {
        if (previous) previous.transitionOut = "hard_cut";
        scene.transitionOut = "hard_cut";
      }
      previous = scene;
    }
    return p;
  }
}
export class StoryContinuityAgent {
  inspect(project: Project): QualityIssue[] {
    const issues: QualityIssue[] = [];
    let previous: Scene | undefined;
    for (const scene of project.scenes) {
      const add = (
        code: string,
        message: string,
        severity: QualityIssue["severity"] = "warning",
      ) =>
        issues.push({
          code,
          message,
          severity,
          sceneId: scene.sceneId,
          resolved: false,
        });
      if (
        scene.characters.some(
          (id) => !project.analysis?.characters.some((c) => c.id === id),
        )
      )
        add(
          "unknown_character",
          "Personaje sin definición persistente.",
          "error",
        );
      if (
        previous?.location === scene.location &&
        previous.timeOfDay === scene.timeOfDay &&
        previous.camera.direction !== scene.camera.direction
      )
        add("screen_direction", "Cambio inesperado de dirección.");
      for (const c of project.analysis?.characters || []) {
        const expected = createHash("sha256")
          .update(JSON.stringify(c.appearance))
          .digest("hex");
        if (
          scene.visualPlan?.identityHashes[c.id] &&
          scene.visualPlan.identityHashes[c.id] !== expected
        )
          add(
            "identity_changed",
            "La definición del personaje cambió.",
            "error",
          );
      }
      for (const layer of scene.layers) {
        const asset = project.assets.find((a) => a.id === layer.assetId);
        if (
          layer.characterId &&
          asset?.characterId &&
          asset.characterId !== layer.characterId
        )
          add(
            "wrong_reference",
            "La capa usa una referencia de otro personaje.",
            "error",
          );
      }
      previous = scene;
    }
    return issues;
  }
}
export class AudioEngineerAgent {
  inspect(project: Project): QualityIssue[] {
    return project.audio.mode === "off"
      ? []
      : [
          {
            code: "audio_optional",
            severity: "info",
            message:
              project.audio.mode === "imported"
                ? "Audio importado; el montaje conserva el ritmo del texto."
                : "Voz opcional activada explícitamente; no condiciona el análisis de la historia.",
            resolved: false,
          },
        ];
  }
}
export class VideoEditorAgent {
  inspect(project: Project): QualityIssue[] {
    return project.scenes.flatMap((s) =>
      s.duration < 0.5
        ? [
            {
              code: "short_shot",
              severity: "warning" as const,
              message: "Plano menor de medio segundo: revisar legibilidad.",
              sceneId: s.sceneId,
              resolved: false,
            },
          ]
        : [],
    );
  }
}
export class QualityControlAgent {
  async inspect(
    project: Project,
    storage = new FileSystemStorage(),
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const add = (
      code: string,
      message: string,
      sceneId: string,
      severity: QualityIssue["severity"] = "warning",
    ) => issues.push({ code, message, sceneId, severity, resolved: false });
    for (const s of project.scenes) {
      if (s.status === "FAILED" || (!s.layers.length && !s.clipAssetId))
        add("scene_failed", "Escena sin material listo.", s.sceneId, "error");
      const used = s.layers
        .flatMap((l) => [l.assetId, ...l.poses.map((p) => p.assetId)])
        .filter((v): v is string => !!v);
      for (const id of new Set(used)) {
        const a = project.assets.find((a) => a.id === id);
        if (!a || !(await storage.exists(a.storageKey))) {
          add(
            "missing_asset",
            "Archivo de imagen ausente.",
            s.sceneId,
            "error",
          );
          continue;
        }
        if (a.source === "placeholder")
          add(
            "placeholder",
            "Ilustración provisional: necesita revisión artística.",
            s.sceneId,
          );
        if (a.kind === "background" && a.width < 1080)
          add(
            "low_resolution",
            "El fondo tiene menos de 1080 píxeles; ampliar no genera detalle nuevo.",
            s.sceneId,
          );
      }
      const layerMotion = s.layers.some(
        (l) =>
          l.keyframes.length > 1 ||
          l.poses.length > 1 ||
          l.kind === "particles",
      );
      if (
        !s.clipAssetId &&
        !s.intentionalStill &&
        !layerMotion &&
        s.camera.movement === "static"
      )
        add("still_shot", "No hay movimiento efectivo.", s.sceneId, "error");
    }
    return issues;
  }
  async output(
    file: string,
    expected: Parameters<FFmpegService["validate"]>[1],
  ) {
    const ffmpeg = new FFmpegService();
    const probe = ffmpeg.validate(await ffmpeg.probe(file), expected);
    await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      file,
      "-f",
      "null",
      "-",
    ]);
    return probe;
  }
}
