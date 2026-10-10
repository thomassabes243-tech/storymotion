import "dotenv/config";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { RenderManager } from "../src/lib/render/RenderManager";
import { Director } from "../src/lib/director/Director";
import { agentConfig } from "../src/lib/director/contracts";
const repo = new SQLiteRepository(),
  manager = new RenderManager(repo);
const director = new Director(repo);
manager.recover();
director.jobs.recover();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log("StoryMotion render worker listo");
async function main() {
  while (!stopping) {
    const job = repo.claimJob(process.pid);
    if (job) {
      console.log(`Render ${job.id}: ${job.sceneCount} planos`);
      const result = await manager.render(job);
      console.log(`${result.state}${result.error ? `: ${result.error}` : ""}`);
    } else {
      const task = agentConfig().enabled
        ? director.jobs.claim(process.pid)
        : undefined;
      if (task) await director.tick(task);
      else await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  repo.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
