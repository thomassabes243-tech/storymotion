import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  SQLiteRepository,
  ConflictError,
} from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { ProjectService, DEMO_STORY } from "../src/lib/story/ProjectService";
import { StoryAnalyzer } from "../src/lib/story/StoryAnalyzer";
import { ScenePlanner } from "../src/lib/story/ScenePlanner";
import { defaultConfig, type Project } from "../src/lib/domain";
import { AssetManager } from "../src/lib/assets/AssetManager";
import { VisualPromptBuilder } from "../src/lib/assets/VisualPromptBuilder";
import { RenderQueue } from "../src/lib/render/RenderQueue";
import { sceneCacheKey } from "../src/lib/render/SceneCache";
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storymotion-test-")),
    repo = new SQLiteRepository(dir),
    storage = new FileSystemStorage(dir);
  const draft = new ProjectService(repo).create("Test", DEMO_STORY),
    analysis = await new StoryAnalyzer().analyze(DEMO_STORY),
    plan = new ScenePlanner().plan(DEMO_STORY, analysis, defaultConfig);
  let project: Project = {
    ...draft,
    analysis,
    scenes: plan.scenes,
    state: "ASSETS_READY",
  };
  const assets = new AssetManager(repo, storage);
  for (let i = 0; i < project.scenes.length; i++)
    project.scenes[i] = await assets.compose(project, project.scenes[i]);
  project = repo.save(project, draft.revision);
  return { dir, repo, project, storage, assets };
}
test("project survives database close/reopen with storyboard, assets and identities", async () => {
  const f = await fixture();
  try {
    const snapshot = structuredClone(f.project);
    f.repo.close();
    const reopened = new SQLiteRepository(f.dir);
    assert.deepEqual(reopened.get(snapshot.id), snapshot);
    assert.equal(reopened.get(snapshot.id)!.scenes.length, 10);
    reopened.close();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("optimistic revisions prevent stale editors overwriting changes", async () => {
  const f = await fixture();
  try {
    const saved = f.repo.save(
      { ...f.project, name: "Nuevo" },
      f.project.revision,
    );
    assert.throws(
      () => f.repo.save(f.project, f.project.revision),
      ConflictError,
    );
    assert.equal(f.repo.get(saved.id)!.name, "Nuevo");
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("assets are reused across reframings; uploads retain alpha; errors stay isolated", async () => {
  const f = await fixture();
  try {
    const scene = f.project.scenes[0],
      before = f.repo.assets().length;
    await f.assets.compose(f.project, scene);
    assert.equal(f.repo.assets().length, before);
    const png = await sharp({
      create: {
        width: 30,
        height: 40,
        channels: 4,
        background: { r: 1, g: 2, b: 3, alpha: 0.3 },
      },
    })
      .png()
      .toBuffer();
    const imported = await f.assets.import(png, "transparent.png", "character");
    assert.equal(
      (await sharp(await f.storage.get(imported.storageKey)).metadata())
        .hasAlpha,
      true,
    );
    await assert.rejects(() =>
      f.assets.import(Buffer.from("bad"), "bad.jpg", "background"),
    );
    const failing = new AssetManager(f.repo, f.storage, {
      generate: async () => {
        throw new Error("provider down");
      },
    });
    const original = structuredClone(f.project.scenes);
    await assert.rejects(
      () => failing.generate(f.project, scene, "background"),
      /provider down/,
    );
    assert.deepEqual(f.project.scenes, original);
    const together = await f.assets.compose(f.project, {
      ...scene,
      characters: ["archer", "army"],
    });
    const positions = together.layers
      .filter((l) => l.kind === "character")
      .map((l) => l.x);
    assert.equal(new Set(positions).size, 2);
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("render jobs claim atomically, snapshot plans, persist and recover interrupted work", async () => {
  const f = await fixture();
  try {
    const queue = new RenderQueue(f.repo),
      job = queue.enqueue(f.project);
    assert.equal(queue.enqueue(f.project).id, job.id);
    f.project.scenes[0].description = "Cambio posterior";
    assert.notEqual(
      job.snapshot.scenes[0].description,
      f.project.scenes[0].description,
    );
    const claimed = f.repo.claimJob(999999999)!;
    assert.equal(claimed.state, "RENDERING");
    assert.equal(f.repo.claimJob(process.pid), undefined);
    queue.recover();
    assert.equal(f.repo.getJob(job.id)!.state, "RENDER_QUEUED");
    const current = f.repo.claimJob(process.pid)!;
    f.repo.putJob({ ...current, state: "FAILED", error: "test" });
    assert.equal(queue.retry(job.id).state, "RENDER_QUEUED");
    f.repo.close();
    const reopened = new SQLiteRepository(f.dir);
    assert.equal(reopened.getJob(job.id)!.snapshot.scenes.length, 10);
    reopened.close();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("visual prompts include identity, palette, era, lighting and cutout constraints", async () => {
  const f = await fixture();
  try {
    const scene = f.project.scenes.find((s) =>
      s.characters.includes("archer"),
    )!;
    const prompt = new VisualPromptBuilder().build(
      f.project,
      scene,
      "character",
      "archer",
    );
    assert.match(prompt.prompt, /Persistent identity/);
    assert.match(prompt.prompt, /dawn/);
    assert.match(prompt.prompt, /Palette/);
    assert.match(prompt.prompt, /transparent/);
    assert.match(prompt.prompt, /oscura/);
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("storage rejects traversal and writes atomically", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storymotion-storage-")),
    storage = new FileSystemStorage(dir);
  try {
    assert.throws(() => storage.resolve("../escape"));
    assert.throws(() => storage.resolve("/etc/passwd"));
    await storage.put("assets/test.bin", new Uint8Array([1, 2, 3]));
    assert.deepEqual([...(await storage.get("assets/test.bin"))], [1, 2, 3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("partial changes invalidate only the edited scene and its following transition", async () => {
  const f = await fixture();
  try {
    const hashes = Object.fromEntries(
      f.project.assets.map((a) => [a.id, a.fingerprint || a.id]),
    );
    const before = f.project.scenes.map((_, i) =>
      sceneCacheKey(f.project, i, hashes, "renderer-v1"),
    );
    f.project.scenes[4].camera.movement = "pan_right";
    const after = f.project.scenes.map((_, i) =>
      sceneCacheKey(f.project, i, hashes, "renderer-v1"),
    );
    assert.deepEqual(
      after.flatMap((key, i) => (key !== before[i] ? [i] : [])),
      [4, 5],
    );
    assert.notEqual(
      before[0],
      sceneCacheKey(f.project, 0, hashes, "renderer-v2"),
    );
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
