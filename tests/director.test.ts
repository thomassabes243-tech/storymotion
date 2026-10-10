import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SQLiteRepository,
  ConflictError,
} from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { ProjectService, DEMO_STORY } from "../src/lib/story/ProjectService";
import { defaultConfig, ProjectSchema } from "../src/lib/domain";
import { Director } from "../src/lib/director/Director";
import { AgentRepository } from "../src/lib/director/AgentRepository";
import { RenderQueue } from "../src/lib/render/RenderQueue";
import { capabilities, renderQuality } from "../src/lib/director/Capabilities";
import {
  MotionDirectorAgent,
  StoryContinuityAgent,
  QualityControlAgent,
} from "../src/lib/director/Specialists";
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "actionmotion-director-"));
  const repo = new SQLiteRepository(dir);
  const storage = new FileSystemStorage(dir);
  const project = new ProjectService(repo).create("Test", DEMO_STORY, {
    ...defaultConfig,
    durationMode: "target",
    targetDuration: 6,
  });
  return { dir, repo, storage, project };
}
test("persistent director claims atomically, survives restart, waits for approval and renders once", async () => {
  const f = await fixture();
  let repo = f.repo;
  try {
    let director = new Director(repo, f.storage);
    const job = director.enqueue(f.project);
    assert.equal(director.enqueue(f.project).id, job.id);
    let claimed = director.jobs.claim(process.pid)!;
    const peer = new SQLiteRepository(f.dir);
    assert.equal(new AgentRepository(peer).claim(process.pid), undefined);
    peer.close();
    await director.tick(claimed);
    claimed = director.jobs.claim(process.pid)!;
    await director.tick(claimed);
    let planned = director.jobs.get(job.id)!;
    assert.equal(planned.state, "STORYBOARD");
    assert.equal(planned.waitingApproval, true);
    assert.equal(director.jobs.claim(process.pid), undefined);
    assert.throws(() => director.approve(job.id, 0), ConflictError);
    repo.close();
    repo = new SQLiteRepository(f.dir);
    director = new Director(repo, f.storage);
    planned = director.jobs.get(job.id)!;
    assert.ok(planned.snapshot.analysis);
    assert.ok(planned.snapshot.scenes.length >= 6);
    director.approve(job.id, planned.snapshot.revision);
    for (let i = 0; i < 25; i++) {
      const next = director.jobs.claim(process.pid);
      if (next) await director.tick(next);
      const state = director.jobs.get(job.id)!.state;
      if (state === "RENDERING") break;
    }
    const ready = director.jobs.get(job.id)!;
    assert.equal(ready.state, "RENDERING");
    assert.equal(ready.completedScenes.length, ready.snapshot.scenes.length);
    assert.ok(ready.snapshot.scenes.every((s) => s.visualPlan));
    const copies = ready.snapshot.scenes.filter((s) =>
      s.characters.includes("archer"),
    );
    assert.ok(copies.length > 1);
    assert.equal(
      copies[0].visualPlan!.identityHashes.archer,
      copies[1].visualPlan!.identityHashes.archer,
    );
    const queue = new RenderQueue(repo);
    const one = queue.enqueue(ready.snapshot, `director:${job.id}`);
    const two = queue.enqueue(ready.snapshot, `director:${job.id}`);
    assert.equal(one.id, two.id);
    const before = director.jobs.get(job.id)!;
    director.jobs.put({
      ...before,
      ownerPid: 999999,
      ownerStartedAt: "absent",
    });
    director.jobs.recover();
    assert.equal(director.jobs.get(job.id)!.ownerPid, undefined);
    assert.equal(
      director.jobs.get(job.id)!.completedScenes.length,
      before.completedScenes.length,
    );
    director.jobs.cancel(job.id);
    assert.equal(director.jobs.get(job.id)!.state, "CANCELED");
    assert.equal(director.jobs.claim(process.pid), undefined);
  } finally {
    repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("quality availability is honest, legacy JSON migrates and identity changes are caught", async () => {
  const f = await fixture();
  try {
    const legacy = JSON.parse(JSON.stringify(f.project));
    delete legacy.config.quality;
    assert.equal(ProjectSchema.parse(legacy).config.quality, "balanced");
    assert.equal(
      capabilities().quality.find((q) => q.id === "cinematic")!.available,
      false,
    );
    assert.throws(() => renderQuality("cinematic"), /no está disponible/);
    assert.equal(renderQuality("fast").width, 540);
    const project = await new ProjectService(f.repo).analyze(f.project);
    const plan = new MotionDirectorAgent().plan(project);
    assert.deepEqual(new StoryContinuityAgent().inspect(plan), []);
    const c = plan.analysis!.characters.find((c) => c.id === "archer")!;
    c.appearance.hair = "changed";
    assert.ok(
      new StoryContinuityAgent()
        .inspect(plan)
        .some((i) => i.code === "identity_changed"),
    );
    const scene = plan.scenes[0];
    scene.layers = [];
    scene.camera.movement = "static";
    scene.animation = [];
    assert.ok(
      (await new QualityControlAgent().inspect(plan, f.storage)).some(
        (i) => i.severity === "error",
      ),
    );
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("interrupted stale project changes never overwrite edits; failure retries are bounded", async () => {
  const f = await fixture();
  try {
    const director = new Director(f.repo, f.storage);
    const job = director.enqueue(f.project);
    let claimed = director.jobs.claim(process.pid)!;
    await director.tick(claimed);
    f.repo.save({ ...f.project, name: "User edit" }, f.project.revision);
    claimed = director.jobs.claim(process.pid)!;
    await director.tick(claimed);
    assert.equal(f.repo.get(f.project.id)!.name, "User edit");
    assert.equal(director.jobs.get(job.id)!.state, "FAILED");
    const failed = director.jobs.get(job.id)!;
    director.jobs.put({ ...failed, attempts: 3 });
    assert.throws(() => director.retry(job.id), /agotaron/);
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
