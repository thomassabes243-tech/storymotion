import type { Layer } from "../domain";
import { smooth } from "./CameraMotion";
export function sampleLayer(layer: Layer, frame: number) {
  const result = {
    x: layer.x,
    y: layer.y,
    scale: layer.scale,
    rotation: layer.rotation,
    opacity: layer.opacity,
  };
  for (const key of ["x", "y", "scale", "rotation", "opacity"] as const) {
    const points = layer.keyframes
      .filter((p) => p[key] !== undefined)
      .sort((a, b) => a.frame - b.frame);
    if (!points.length) continue;
    const prev =
        [...points].reverse().find((p) => p.frame <= frame) || points[0],
      next = points.find((p) => p.frame > frame) || prev;
    const t =
      next.frame === prev.frame
        ? 0
        : smooth((frame - prev.frame) / (next.frame - prev.frame));
    result[key] = prev[key]! + (next[key]! - prev[key]!) * t;
  }
  return result;
}
