import "dotenv/config";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { RenderManager } from "../src/lib/render/RenderManager";
const repo = new SQLiteRepository(),
  manager = new RenderManager(repo);
manager.recover();
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
    } else await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  repo.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
