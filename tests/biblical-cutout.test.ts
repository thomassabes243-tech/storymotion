import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { RenderQueue } from "../src/lib/render/RenderQueue";
import test from "node:test";
import assert from "node:assert/strict";
import { StoryAnalyzer } from "../src/lib/story/StoryAnalyzer";
import { CharacterBible } from "../src/lib/characters/CharacterBible";
import { ProjectSchema, ConfigSchema, defaultConfig } from "../src/lib/domain";
import { illustratedMotion } from "../src/lib/animation/IllustratedMotion";
import { sceneCacheKey } from "../src/lib/render/SceneCache";
import { judasBeats, JUDAS_TITLE } from "../scripts/judas-test-plan";

test("biblical recurring names retain separate identities and intended actions", async () => {
  const a = await new StoryAnalyzer().analyze(judasBeats.join(" "));
  const bible = new CharacterBible(a.characters);
  assert.equal(bible.get("jesus").name, "Jesús");
  assert.equal(bible.get("judas").name, "Judas");
  assert.notDeepEqual(
    bible.get("jesus").appearance.colors,
    bible.get("judas").appearance.colors,
  );
  for (const action of [
    "share_bread",
    "exchange_coins",
    "kiss",
    "arrest",
    "lower_gaze",
  ])
    assert(
      a.events.some((e) => e.action === action),
      `missing ${action}`,
    );
  const copy = bible.get("jesus");
  copy.appearance.colors[0] = "changed";
  assert.notEqual(bible.get("jesus").appearance.colors[0], "changed");
});
test("illustrated gestures ease into action and cloth follows instead of jumping", () => {
  const samples = Array.from({ length: 90 }, (_, frame) =>
    illustratedMotion(frame, 30, 90, "reach"),
  );
  const shoulderStep = (i: number) =>
    Math.abs(samples[i + 1].shoulder - samples[i].shoulder);
  assert(shoulderStep(0) < shoulderStep(44) / 10);
  assert(shoulderStep(88) < shoulderStep(44) / 10);
  assert(samples.every((m) => Object.values(m).every(Number.isFinite)));
  assert(
    samples[30].progress >
      illustratedMotion(30 - 3.6, 30, 90, "reach").progress,
  );
  assert.notEqual(samples[10].cloth, samples[70].cloth);
});
test("old projects opt out; title and smoothing settings invalidate rendered caches", () => {
  const config = ConfigSchema.parse({
    ...defaultConfig,
    motionBlur: undefined,
  });
  assert.equal(config.motionBlur, "off");
  const scene = {
    sceneId: "one",
    start: 0,
    duration: 3,
    durationFrames: 90,
    sourceText: "A",
    description: "A",
    location: "supper",
    characters: [],
    action: "observe",
    emotion: "calm",
    timeOfDay: "night",
    camera: {
      shot: "wide",
      movement: "pan_left",
      direction: "left_to_right",
      intensity: 0.5,
    },
    layers: [],
    animation: ["parallax"],
    transitionOut: "crossfade",
    status: "READY",
  };
  const p = ProjectSchema.parse({
    schemaVersion: 1,
    id: "test",
    revision: 0,
    name: "test",
    story: "test",
    createdAt: "now",
    updatedAt: "now",
    config,
    scenes: [scene],
    assets: [],
    warnings: [],
    state: "DRAFT",
  });
  const original = sceneCacheKey(p, 0, {}, "v1");
  p.config.fixedTitle = JUDAS_TITLE;
  assert.notEqual(sceneCacheKey(p, 0, {}, "v1"), original);
  const withTitle = sceneCacheKey(p, 0, {}, "v1");
  p.config.motionBlur = "subtle";
  assert.notEqual(sceneCacheKey(p, 0, {}, "v1"), withTitle);
  const directory = mkdtempSync(path.join(os.tmpdir(), "actionmotion-title-"));
  const repo = new SQLiteRepository(directory);
  try {
    p.scenes[0].clipAssetId = "existing-clip";
    assert.throws(
      () => new RenderQueue(repo).enqueue(p),
      /título fijo.*ilustradas/,
    );
  } finally {
    repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
