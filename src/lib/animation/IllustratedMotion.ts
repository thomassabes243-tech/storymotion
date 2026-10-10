import { smooth } from "./CameraMotion";
export function illustratedMotion(
  frame: number,
  fps: number,
  frames: number,
  pose: string,
  phase = 0,
) {
  const t = frame / fps;
  const p = smooth(frame / Math.max(1, frames - 1));
  const delayed = smooth(
    (frame - fps * 0.12) / Math.max(1, frames - 1 - fps * 0.12),
  );
  const walking = ["walking", "arrested"].includes(pose);
  const gait = walking ? Math.sin(t * Math.PI * 2 * 0.88 + phase) : 0;
  return {
    progress: p,
    head:
      pose === "lower_gaze"
        ? p * 13
        : pose === "look"
          ? -p * 9
          : pose === "kiss"
            ? p * 10
            : Math.sin(t * 0.85 + phase) * 1.8,
    breath: Math.sin(t * 2.05 + phase) * 1.8,
    legs: gait * 14,
    shoulder:
      pose === "offering"
        ? -p * 34
        : pose === "reach"
          ? -p * 52
          : pose === "arrested"
            ? -p * 25
            : gait * -10,
    elbow: pose === "offering" || pose === "reach" ? delayed * 24 : gait * 6,
    cloth: Math.sin(t * 1.65 - 0.6 + phase) * 5 + (p - delayed) * 12,
    travel: walking ? p * 54 : 0,
  };
}
