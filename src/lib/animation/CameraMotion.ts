import type { Camera } from "../domain";
export const smooth = (t: number) => {
  const p = Math.min(1, Math.max(0, t));
  return p * p * (3 - 2 * p);
};
function baseCameraMotion(frame: number, frames: number, camera: Camera) {
  const t = smooth(frame / Math.max(1, frames - 1)),
    a = camera.intensity,
    base = { x: 0, y: 0, scale: 1.08, rotation: 0 };
  switch (camera.movement) {
    case "static":
      return { ...base, scale: 1 };
    case "slow_zoom_in":
    case "push_in":
      return {
        ...base,
        scale: 1.06 + t * (camera.movement === "push_in" ? 0.2 : 0.11) * a,
      };
    case "slow_zoom_out":
    case "pull_out":
      return { ...base, scale: 1.06 + (1 - t) * 0.16 * a };
    case "pan_left":
      return { ...base, x: (t - 0.5) * 150 * a };
    case "pan_right":
      return { ...base, x: (0.5 - t) * 150 * a };
    case "pan_up":
      return { ...base, y: (t - 0.5) * 140 * a };
    case "pan_down":
      return { ...base, y: (0.5 - t) * 140 * a };
    case "follow_subject":
      return {
        ...base,
        x: (camera.direction === "right_to_left" ? 1 : -1) * t * 100 * a,
        scale: 1.12,
      };
    case "camera_shake":
      return {
        ...base,
        x: Math.sin(frame * 1.71) * 7 * a,
        y: Math.sin(frame * 2.31) * 6 * a,
        rotation: Math.sin(frame * 0.43) * 0.3 * a,
      };
    case "dramatic_zoom":
      return { ...base, scale: 1.07 + smooth(Math.min(t * 1.8, 1)) * 0.32 * a };
    case "reveal":
      return { ...base, x: (1 - t) * 140 * a, scale: 1.1 };
  }
}

export function cameraMotion(frame: number, frames: number, camera: Camera) {
  const motion = baseCameraMotion(frame, frames, camera);
  const framing = { wide: 1, medium: 1.07, close: 1.18, detail: 1.27 }[
    camera.shot
  ];
  return { ...motion, scale: motion.scale * framing };
}
