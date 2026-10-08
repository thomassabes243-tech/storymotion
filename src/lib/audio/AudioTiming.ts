import { reflow, type Project, type Scene } from "../domain";
import type { SpeechCue } from "./providers/SpeechProvider";
const words = (text: string) =>
  (text.toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) || []).join(" ");
export function narrationGroups(
  project: Project,
): { text: string; indices: number[] }[] {
  const groups: { text: string; indices: number[] }[] = [];
  project.scenes.forEach((scene, i) => {
    const previous = groups.at(-1);
    if (previous && previous.text === scene.sourceText)
      previous.indices.push(i);
    else groups.push({ text: scene.sourceText, indices: [i] });
  });
  // Narrate every original word exactly once, including after editing/reordering.
  // If shot excerpts no longer reproduce the story, use the complete original.
  if (
    !groups.length ||
    words(groups.map((g) => g.text).join(" ")) !== words(project.story)
  )
    return [{ text: project.story, indices: project.scenes.map((_, i) => i) }];
  return groups;
}
function allocateFrames(scenes: Scene[], indices: number[], count: number) {
  const budget = Math.max(indices.length, count);
  const weights = indices.map((i) => scenes[i].durationFrames);
  const weight = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((n) => (n / weight) * (budget - indices.length));
  const frames = exact.map((n) => Math.floor(n) + 1);
  let remaining = budget - frames.reduce((a, b) => a + b, 0);
  const order = exact
    .map((n, i) => ({ i, remainder: n - Math.floor(n) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const entry of order) if (remaining-- > 0) frames[entry.i]++;
  return frames;
}
export function alignToNarration(project: Project, cues: SpeechCue[]): Project {
  const groups = narrationGroups(project);
  if (
    groups.length !== cues.length ||
    groups.some((g, i) => g.text !== cues[i].text)
  )
    throw new Error("La narración no coincide con la historia guardada");
  const scenes = structuredClone(project.scenes),
    fps = project.config.fps;
  let elapsed = 0,
    previousBoundary = 0;
  for (const [i, group] of groups.entries()) {
    elapsed += cues[i].duration;
    const boundary =
      i === groups.length - 1
        ? Math.ceil(elapsed * fps)
        : Math.round(elapsed * fps);
    const frames = allocateFrames(
      scenes,
      group.indices,
      boundary - previousBoundary,
    );
    group.indices.forEach((index, j) => {
      scenes[index].duration = frames[j] / fps;
    });
    previousBoundary += frames.reduce((a, b) => a + b, 0);
  }
  return { ...structuredClone(project), scenes: reflow(scenes, fps) };
}
