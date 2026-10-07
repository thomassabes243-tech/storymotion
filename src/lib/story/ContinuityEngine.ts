import type { Analysis, Scene } from "../domain";
import { CharacterBible } from "../characters/CharacterBible";
export class ContinuityEngine {
  apply(scenes: Scene[], analysis: Analysis): Scene[] {
    const bible = new CharacterBible(analysis.characters);
    let previous: Scene | undefined;
    return scenes.map((s) => {
      const scene = structuredClone(s);
      scene.characters.forEach((id) => bible.get(id));
      if (previous && previous.location === scene.location) {
        scene.camera.direction = previous.camera.direction;
        scene.continuityNotes.push(
          `Dirección conservada: ${scene.camera.direction}`,
        );
      }
      scene.continuityNotes.push(
        `Luz: ${scene.timeOfDay}; estilo: ${analysis.visualStyle}`,
      );
      if (
        scene.camera.movement === "static" &&
        !scene.intentionalStill &&
        !scene.animation.length
      ) {
        scene.animation = ["dust_drift"];
      }
      previous = scene;
      return scene;
    });
  }
  validate(scenes: Scene[], analysis: Analysis) {
    const ids = new Set(analysis.characters.map((c) => c.id)),
      errors: string[] = [];
    scenes.forEach((s, i) => {
      if (s.characters.some((id) => !ids.has(id)))
        errors.push(`${s.sceneId}: personaje desconocido`);
      if (
        i &&
        s.location === scenes[i - 1].location &&
        s.camera.direction !== scenes[i - 1].camera.direction
      )
        errors.push(
          `${s.sceneId}: cambio de dirección; revisar intención narrativa`,
        );
      if (
        !s.intentionalStill &&
        s.camera.movement === "static" &&
        !s.animation.length &&
        !s.layers.some((l) => l.keyframes.length || l.poses.length)
      )
        errors.push(`${s.sceneId}: plano estático sin intención explícita`);
    });
    return errors;
  }
}
