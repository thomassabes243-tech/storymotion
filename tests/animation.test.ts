import test from "node:test";
import assert from "node:assert/strict";
import { cameraMovements, CameraSchema, type Layer } from "../src/lib/domain";
import { cameraMotion } from "../src/lib/animation/CameraMotion";
import { parallax } from "../src/lib/animation/Parallax";
import { sampleLayer } from "../src/lib/animation/AnimationEngine";
import { FFmpegService } from "../src/lib/render/FFmpegService";
test("all camera presets produce finite transforms and moving presets evolve", () => {
  for (const movement of cameraMovements) {
    const c = CameraSchema.parse({
        shot: "wide",
        movement,
        direction: "left_to_right",
        intensity: 1,
      }),
      first = cameraMotion(0, 90, c),
      last = cameraMotion(89, 90, c);
    assert.ok(Object.values(first).every(Number.isFinite));
    assert.ok(Object.values(last).every(Number.isFinite));
    if (movement !== "static") assert.notDeepEqual(first, last);
  }
  assert.throws(() => CameraSchema.parse({ movement: "unknown" }));
});
test("parallax uses independent depth factors", () => {
  const camera = { x: 100, y: 50, scale: 1.2, rotation: 1 };
  assert.equal(parallax(camera, 0.05).x, 5);
  assert.equal(parallax(camera, 0.8).x, 80);
  assert.ok(parallax(camera, 0.8).scale > parallax(camera, 0.05).scale);
});
test("keyframes clamp and interpolate layer properties", () => {
  const layer: Layer = {
    id: "arrow",
    kind: "object",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    depth: 0.5,
    blur: 0,
    startFrame: 0,
    endFrame: 60,
    poses: [],
    keyframes: [
      { frame: 0, x: -100, opacity: 0 },
      { frame: 59, x: 100, opacity: 1 },
    ],
  };
  assert.equal(sampleLayer(layer, -1).x, -100);
  assert.equal(sampleLayer(layer, 59).x, 100);
  assert.equal(sampleLayer(layer, 200).opacity, 1);
  assert.ok(Math.abs(sampleLayer(layer, 29.5).x) < 0.001);
});
test("output validator rejects wrong dimensions, codec, fps and any audio", () => {
  const f = new FFmpegService(),
    valid = {
      width: 1080,
      height: 1920,
      codec: "h264",
      fps: 30,
      duration: 30,
      audioStreams: 0,
    };
  assert.deepEqual(
    f.validate(valid, { width: 1080, height: 1920, fps: 30, duration: 30 }),
    valid,
  );
  for (const patch of [
    { width: 720 },
    { codec: "hevc" },
    { fps: 24 },
    { audioStreams: 1 },
    { duration: 40 },
  ])
    assert.throws(() =>
      f.validate(
        { ...valid, ...patch },
        { width: 1080, height: 1920, fps: 30, duration: 30 },
      ),
    );
});
