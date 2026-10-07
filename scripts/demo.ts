import "dotenv/config";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { ProjectService } from "../src/lib/story/ProjectService";
import { RenderManager } from "../src/lib/render/RenderManager";
async function main() {
  const repo = new SQLiteRepository();
  const project = await new ProjectService(repo).demo();
  console.log(
    JSON.stringify({
      projectId: project.id,
      scenes: project.scenes.length,
      duration: project.scenes.reduce((n, s) => n + s.duration, 0),
      characters: project.analysis?.characters.map((c) => c.id),
    }),
  );
  if (process.argv.includes("--render")) {
    const manager = new RenderManager(repo);
    const queued = manager.enqueue(project);
    const job = repo.claimJob(process.pid);
    if (job) {
      const result = await manager.render(job);
      console.log(
        JSON.stringify({
          id: result.id,
          state: result.state,
          error: result.error,
          output: result.outputKey,
          probe: result.probe,
        }),
      );
      if (result.state !== "COMPLETE") process.exitCode = 1;
    } else console.log(`En cola: ${queued.id}`);
  }
  repo.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
