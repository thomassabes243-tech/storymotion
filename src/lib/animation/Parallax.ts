export function parallax(
  camera: { x: number; y: number; scale: number; rotation: number },
  depth: number,
) {
  return {
    x: camera.x * depth,
    y: camera.y * depth,
    scale: 1 + (camera.scale - 1) * (0.35 + depth * 0.65),
    rotation: camera.rotation * depth,
  };
}
