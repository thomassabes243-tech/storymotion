import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { ProjectService } from "../src/lib/story/ProjectService";
import { RAINY_STORY } from "../src/lib/story/ActionMotionStoryEngine";
import { defaultConfig, totalFrames } from "../src/lib/domain";
import { Director } from "../src/lib/director/Director";
import { RenderManager } from "../src/lib/render/RenderManager";
async function main() {
  // Deliberate illustrated preview, not a pass of the photorealistic acceptance test.
  const fast = process.argv.includes("--fast");
  const prefix = fast ? "docs/actionmotion-fast" : "docs/actionmotion-rain";
  const root = path.resolve(
    fast ? "data/actionmotion-fast-demo" : "data/actionmotion-rain-demo",
  );
  const repo = new SQLiteRepository(root),
    storage = new FileSystemStorage(root),
    director = new Director(repo, storage),
    renderer = new RenderManager(repo, storage);
  const start = Date.now();
  try {
    const project = new ProjectService(repo).create(
      "Calle lluviosa · preview ilustrado",
      RAINY_STORY,
      {
        ...defaultConfig,
        durationMode: "target",
        targetDuration: fast ? 2 : 12,
        quality: fast ? "fast" : "balanced",
        fps: fast ? 24 : 30,
      },
    );
    const initial = director.enqueue(project);
    let approved = false;
    for (let count = 0; count < 100; count++) {
      let job = director.jobs.get(initial.id)!;
      if (job.state === "STORYBOARD" && !approved) {
        director.approve(job.id, job.snapshot.revision);
        approved = true;
      }
      const render = repo.claimJob(process.pid);
      if (render) await renderer.render(render);
      job = director.jobs.get(initial.id)!;
      if (job.state === "READY_FOR_REVIEW") {
        const result = repo.getJob(job.renderJobId!)!;
        const output = `${prefix}-preview.mp4`;
        await fs.copyFile(storage.resolve(result.outputKey!), output);
        const hero = job.snapshot.analysis!.characters.find(
          (c) => c.id === "traveler",
        )!;
        const report = {
          status: "PARTIAL",
          acceptance: "BLOCKED",
          reason:
            "No GPU or generative video model is installed. This is an articulated illustration preview, not a cinematic real-motion result.",
          story: RAINY_STORY,
          agentId: job.id,
          renderJobId: result.id,
          elapsedMs: Date.now() - start,
          probe: result.probe,
          frames: totalFrames(job.snapshot.scenes),
          hero,
          scenes: job.snapshot.scenes.map((s) => ({
            id: s.sceneId,
            action: s.action,
            duration: s.duration,
            characters: s.characters,
            environment: s.environment,
            narrativeState: s.narrativeState,
            visualPlan: s.visualPlan,
            camera: s.camera,
            transition: s.transitionOut,
          })),
          qualityIssues: job.issues,
          sha256: createHash("sha256")
            .update(await fs.readFile(output))
            .digest("hex"),
        };
        await fs.writeFile(
          `${prefix}-verification.json`,
          JSON.stringify(report, null, 2),
        );
        await fs.writeFile(
          `${prefix}-project.json`,
          JSON.stringify(job.snapshot, null, 2),
        );
        console.log(
          JSON.stringify({
            output,
            elapsedMs: report.elapsedMs,
            probe: result.probe,
            acceptance: report.acceptance,
          }),
        );
        break;
      }
      if (job.state === "FAILED") throw Error(job.error);
      const next = director.jobs.claim(process.pid);
      if (next) await director.tick(next);
      else await new Promise((r) => setTimeout(r, 1000));
      if (count === 99) throw Error("La producción no terminó.");
    }
  } finally {
    repo.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
