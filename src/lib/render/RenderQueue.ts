import { randomUUID } from "node:crypto";
import type { Project } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { ContinuityEngine } from "../story/ContinuityEngine";
import { workerIsAlive } from "./WorkerIdentity";
// Lightweight queue API: it never loads Chromium, webpack or the renderer.
export class RenderQueue {
  constructor(protected repo: SQLiteRepository) {}
  enqueue(project: Project) {
    if (!project.scenes.length || !project.analysis)
      throw new Error("Analiza la historia antes de renderizar");
    const continuity = new ContinuityEngine().validate(
      project.scenes,
      project.analysis,
    );
    if (
      continuity.some(
        (e) => e.includes("desconocido") || e.includes("estático"),
      )
    )
      throw new Error(continuity.join("; "));
    if (
      project.scenes.some(
        (s) =>
          s.status === "GENERATING" ||
          s.status === "FAILED" ||
          !s.layers.length,
      )
    )
      throw new Error("Revisa las escenas con assets pendientes o fallidos");
    const active = this.repo
      .listJobs(project.id)
      .find((j) => ["RENDERING", "RENDER_QUEUED"].includes(j.state));
    if (active) return active;
    const now = new Date().toISOString();
    return this.repo.putJob({
      id: randomUUID(),
      projectId: project.id,
      state: "RENDER_QUEUED",
      progress: 0,
      currentScene: 0,
      sceneCount: project.scenes.length,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      snapshot: structuredClone(project),
    });
  }
  retry(id: string) {
    const job = this.repo.getJob(id);
    if (!job || job.state !== "FAILED")
      throw new Error("Solo se pueden reintentar trabajos fallidos");
    return this.repo.putJob({
      ...job,
      state: "RENDER_QUEUED",
      error: undefined,
      ownerPid: undefined,
      ownerStartedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  recover() {
    for (const job of this.repo.listJobs())
      if (job.state === "RENDERING") {
        const alive = workerIsAlive(job.ownerPid, job.ownerStartedAt);
        if (!alive)
          this.repo.putJob({
            ...job,
            state: "RENDER_QUEUED",
            ownerPid: undefined,
            ownerStartedAt: undefined,
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
      }
  }
}
