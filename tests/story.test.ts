import test from "node:test";
import assert from "node:assert/strict";
import { StoryAnalyzer, wordCount } from "../src/lib/story/StoryAnalyzer";
import { ScenePlanner, calculateDuration } from "../src/lib/story/ScenePlanner";
import { ContinuityEngine } from "../src/lib/story/ContinuityEngine";
import { CharacterBible } from "../src/lib/characters/CharacterBible";
import {
  defaultConfig,
  SceneSchema,
  reflow,
  totalFrames,
  AnalysisSchema,
} from "../src/lib/domain";
import { DEMO_STORY } from "../src/lib/story/ProjectService";
test("analyzer detects entities, actions and more events than sentences", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY);
  assert.ok(a.characters.some((c) => c.id === "archer"));
  assert.ok(a.characters.some((c) => c.id === "army"));
  assert.ok(a.locations.some((l) => l.id === "valle"));
  assert.ok(a.events.some((e) => e.action === "raise_bow"));
  assert.ok(a.events.some((e) => e.action === "fire_arrow"));
  assert.ok(a.events.length > DEMO_STORY.split(".").filter(Boolean).length);
  assert.ok(a.events.every((e) => e.timeOfDay === "dawn"));
});
test("arbitrary named characters recur across clauses and genres", async () => {
  const a = await new StoryAnalyzer().analyze(
    "Elena caminó por un bosque. Elena encontró un libro mágico. Elena huyó hacia el castillo.",
  );
  assert.equal(a.characters.filter((c) => c.name === "Elena").length, 1);
  const id = a.characters.find((c) => c.name === "Elena")!.id;
  assert.ok(a.events.every((e) => e.subjects.includes(id)));
  assert.ok(a.locations.some((l) => l.id === "bosque"));
  assert.ok(a.locations.some((l) => l.id === "castillo"));
});

test("a name binds to its own role even with an army in the story", async () => {
  const a = await new StoryAnalyzer().analyze(
    "La viajera Elena caminó con un ejército por el bosque. Elena observó una luz.",
  );
  assert.equal(a.characters.find((c) => c.id === "traveler")?.name, "Elena");
  assert.equal(a.characters.find((c) => c.id === "army")?.name, "Ejército");
  assert.deepEqual(a.events[1].subjects, ["traveler"]);
});
test("word-based duration and target duration are configurable without audio", () => {
  assert.equal(wordCount("uno dos tres cuatro cinco"), 5);
  assert.equal(
    calculateDuration(Array(150).fill("historia").join(" "), defaultConfig),
    60,
  );
  assert.equal(
    calculateDuration(Array(150).fill("historia").join(" "), {
      ...defaultConfig,
      settings: { ...defaultConfig.settings, wordsPerMinute: 100 },
    }),
    90,
  );
  assert.equal(
    calculateDuration("texto", {
      ...defaultConfig,
      durationMode: "target",
      targetDuration: 90,
    }),
    90,
  );
});
test("demo expands to ten animated shots and exact target frames", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY),
    plan = new ScenePlanner().plan(DEMO_STORY, a, {
      ...defaultConfig,
      durationMode: "target",
      targetDuration: 30,
    });
  assert.equal(plan.scenes.length, 10);
  assert.equal(totalFrames(plan.scenes), 900);
  assert.ok(plan.scenes.some((s) => s.action === "arrow_flight"));
  assert.ok(
    plan.scenes.every(
      (s) =>
        s.duration > 0 && s.camera.movement !== "static" && s.animation.length,
    ),
  );
  assert.ok(
    plan.scenes.filter((s) => s.characters.includes("archer")).length >= 4,
  );
  let start = 0;
  for (const s of plan.scenes) {
    assert.equal(s.start, start / 30);
    start += s.durationFrames;
  }
});
test("long targets add reframings and respect maximum shot lengths", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY),
    plan = new ScenePlanner().plan(DEMO_STORY, a, {
      ...defaultConfig,
      durationMode: "target",
      targetDuration: 600,
    });
  assert.equal(totalFrames(plan.scenes), 18000);
  assert.ok(plan.scenes.every((s) => s.duration <= 8));
  assert.ok(plan.scenes.length > 75);
});
test("short auto targets preserve exact runtime and flag fast pacing", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY),
    plan = new ScenePlanner().plan(DEMO_STORY, a, defaultConfig);
  assert.equal(
    totalFrames(plan.scenes),
    Math.round(calculateDuration(DEMO_STORY, defaultConfig) * 30),
  );
  assert.ok(plan.warnings.length);
});
test("character bible preserves identity and protects stored appearance", async () => {
  const a = await new StoryAnalyzer().analyze(
    "El comandante levantó la espada. El comandante avanzó por el valle.",
  );
  const c = a.characters.find((c) => c.id === "commander")!,
    bible = new CharacterBible(a.characters);
  const changed = bible.get(c.id);
  changed.appearance.clothing = "capa azul";
  assert.equal(bible.get(c.id).appearance.clothing, c.appearance.clothing);
  bible.register({ ...c, description: "otro rostro" });
  assert.equal(bible.get(c.id).description, c.description);
  assert.match(bible.identityPrompt(c.id), /capa roja/);
});
test("continuity preserves screen direction and diagnoses accidental stills", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY),
    plan = new ScenePlanner().plan(DEMO_STORY, a, defaultConfig),
    engine = new ContinuityEngine();
  const scenes = plan.scenes.slice(0, 2);
  scenes[1].camera.direction = "right_to_left";
  assert.ok(engine.validate(scenes, a).some((e) => e.includes("dirección")));
  const fixed = engine.apply(scenes, a);
  assert.equal(fixed[0].camera.direction, fixed[1].camera.direction);
  fixed[0].camera.movement = "static";
  fixed[0].animation = [];
  assert.ok(engine.validate(fixed, a).some((e) => e.includes("estático")));
  fixed[0].intentionalStill = true;
  assert.ok(!engine.validate(fixed, a).some((e) => e.includes("estático")));
});
test("stable scene JSON roundtrips and timing edits rescale animation", async () => {
  const a = await new StoryAnalyzer().analyze(DEMO_STORY),
    scene = new ScenePlanner().plan(DEMO_STORY, a, defaultConfig).scenes[0];
  scene.layers = [
    {
      id: "moving",
      kind: "object",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      depth: 0.5,
      blur: 0,
      startFrame: 0,
      endFrame: scene.durationFrames,
      keyframes: [
        { frame: 0, x: 0 },
        { frame: scene.durationFrames - 1, x: 200 },
      ],
      poses: [],
    },
  ];
  assert.deepEqual(SceneSchema.parse(JSON.parse(JSON.stringify(scene))), scene);
  const resized = reflow([{ ...scene, duration: scene.duration * 2 }], 30)[0];
  assert.equal(
    resized.layers[0].keyframes[1].frame,
    resized.durationFrames - 1,
  );
  assert.throws(() => SceneSchema.parse({ ...scene, duration: -1 }));
});
test("analysis provider responses pass schema validation", async () => {
  const local = await new StoryAnalyzer().analyze(DEMO_STORY);
  const provider = {
    analyze: async () => ({ ...local, analyzer: "provider" as const }),
  };
  assert.equal(
    (await new StoryAnalyzer(provider).analyze(DEMO_STORY)).analyzer,
    "provider",
  );
  assert.throws(() => AnalysisSchema.parse({ title: "invalid" }));
});
