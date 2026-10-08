import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { FFmpegService } from "../src/lib/render/FFmpegService";
import { ContinuityEngine } from "../src/lib/story/ContinuityEngine";
import { totalFrames, ProjectSchema } from "../src/lib/domain";
async function main() {
  const repo = new SQLiteRepository(),
    storage = new FileSystemStorage();
  const job = repo.listJobs().find((j) => j.state === "COMPLETE");
  if (!job)
    throw new Error(
      "No existe un render completo. Ejecuta npm run demo -- --render.",
    );
  const project = repo.get(job.projectId)!;
  const parsed = ProjectSchema.parse(JSON.parse(JSON.stringify(project)));
  if (!parsed.scenes.length) throw new Error("No hay storyboard");
  const continuity = new ContinuityEngine().validate(
    job.snapshot.scenes,
    job.snapshot.analysis!,
  );
  if (continuity.length) throw new Error(continuity.join("; "));
  const probe = new FFmpegService().validate(
    await new FFmpegService().probe(storage.resolve(job.outputKey!)),
    {
      ...job.snapshot.config,
      duration:
        totalFrames((job.renderedPlan || job.snapshot).scenes) /
        job.snapshot.config.fps,
      audioStreams: job.snapshot.audio?.mode === "automatic" ? 1 : 0,
    },
  );
  repo.close();
  const reopened = new SQLiteRepository();
  if (reopened.get(project.id)?.scenes.length !== project.scenes.length)
    throw new Error("Falló la persistencia");
  reopened.close();
  const report = {
    verifiedAt: new Date().toISOString(),
    projectId: project.id,
    jobId: job.id,
    scenes: job.snapshot.scenes.length,
    characters: job.snapshot.analysis!.characters.map((c) => ({
      id: c.id,
      scenes: job.snapshot.scenes.filter((s) => s.characters.includes(c.id))
        .length,
    })),
    allScenesAnimated: job.snapshot.scenes.every(
      (s) => s.camera.movement !== "static" || s.animation.length > 0,
    ),
    continuity: "PASS",
    persistence: "PASS",
    output: storage.resolve(job.outputKey!),
    probe,
  };
  await mkdir("docs", { recursive: true });
  await writeFile("docs/verification.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
