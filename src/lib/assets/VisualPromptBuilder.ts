import { CharacterBible } from "../characters/CharacterBible";
import type { Project, Scene, Asset } from "../domain";
import { visualStyles } from "./styles";
export class VisualPromptBuilder {
  build(
    project: Project,
    scene: Scene,
    kind: Asset["kind"],
    characterId?: string,
  ) {
    const style = visualStyles[project.config.style],
      bible = new CharacterBible(project.analysis?.characters),
      location = project.analysis?.locations.find(
        (l) => l.id === scene.location,
      );
    return {
      prompt: [
        style.prompt,
        `Era: ${project.analysis?.era}. Palette: ${style.palette.join(", ")}.`,
        `Location: ${location?.description || scene.location}. Light/time: ${scene.timeOfDay}.`,
        `Weather: ${scene.environment?.weather || "as described"}. Action state: ${scene.narrativeState?.initial || "as described"} to ${scene.narrativeState?.final || scene.action}.`,
        `Narrative action: ${scene.description}. Shot: ${scene.camera.shot}. Movement direction: ${scene.camera.direction}.`,
        `Asset role: ${kind}. ${kind === "character" || kind === "object" || kind === "foreground" ? "Isolated cutout on transparent background, no full scene, maintain clean edges." : "Overscan composition suitable for vertical camera moves, 9:16."}`,
        characterId
          ? `Persistent identity, preserve exactly: ${bible.identityPrompt(characterId)}`
          : scene.characters.map((id) => bible.identityPrompt(id)).join(" | "),
        `Continuity: ${scene.continuityNotes.join("; ")}. Reuse established costume, light and geography.`,
      ].join("\n"),
      negativePrompt: style.negativePrompt,
      transparent:
        kind === "character" || kind === "object" || kind === "foreground",
    };
  }
}
