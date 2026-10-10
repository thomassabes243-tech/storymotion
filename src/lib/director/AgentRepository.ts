import { randomUUID, createHash } from "node:crypto";
import type { Project } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { AgentJobSchema, type AgentJob } from "./contracts";
import { processIdentity, workerIsAlive } from "../render/WorkerIdentity";
import { RenderQueue } from "../render/RenderQueue";
const terminal = ["READY_FOR_REVIEW", "FAILED", "CANCELED"];
export class AgentRepository {
  constructor(private repo: SQLiteRepository) {
    repo.db.exec(
      `CREATE TABLE IF NOT EXISTS agent_jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, state TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS agent_queue ON agent_jobs(state,created_at);`,
    );
  }
  transaction<T>(fn: () => T): T {
    this.repo.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.repo.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.repo.db.exec("ROLLBACK");
      throw e;
    }
  }
  get(id: string) {
    const row = this.repo.db
      .prepare("SELECT document FROM agent_jobs WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? AgentJobSchema.parse(JSON.parse(row.document)) : undefined;
  }
  list(projectId?: string) {
    const rows = (
      projectId
        ? this.repo.db
            .prepare(
              "SELECT document FROM agent_jobs WHERE project_id=? ORDER BY created_at DESC",
            )
            .all(projectId)
        : this.repo.db
            .prepare("SELECT document FROM agent_jobs ORDER BY created_at DESC")
            .all()
    ) as { document: string }[];
    return rows.map((r) => AgentJobSchema.parse(JSON.parse(r.document)));
  }
  put(job: AgentJob) {
    const parsed = AgentJobSchema.parse(job);
    this.repo.db
      .prepare(
        "INSERT INTO agent_jobs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,document=excluded.document",
      )
      .run(
        parsed.id,
        parsed.projectId,
        parsed.state,
        parsed.requestKey,
        parsed.createdAt,
        JSON.stringify(parsed),
      );
    return parsed;
  }
  enqueue(project: Project) {
    return this.transaction(() => {
      const active = this.list(project.id).find(
        (j) => !terminal.includes(j.state),
      );
      if (active) return active;
      const key = createHash("sha256")
        .update(
          JSON.stringify({
            id: project.id,
            revision: project.revision,
            config: project.config,
          }),
        )
        .digest("hex");
      const existing = this.list(project.id).find((j) => j.requestKey === key);
      if (existing) return existing;
      const now = new Date().toISOString();
      return this.put(
        AgentJobSchema.parse({
          id: randomUUID(),
          projectId: project.id,
          requestKey: key,
          state: "PENDING",
          progress: 0,
          currentScene: 0,
          attempts: 0,
          maxAttempts: 3,
          createdAt: now,
          updatedAt: now,
          snapshot: project,
        }),
      );
    });
  }
  claim(pid: number) {
    return this.transaction(() => {
      const job = this.list()
        .reverse()
        .find(
          (j) =>
            !terminal.includes(j.state) &&
            !j.waitingApproval &&
            !j.ownerPid &&
            j.retryAt <= Date.now(),
        );
      if (!job) return;
      return this.put({
        ...job,
        ownerPid: pid,
        ownerStartedAt: processIdentity(pid)?.startedAt,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  recover() {
    for (const job of this.list())
      if (job.ownerPid && !workerIsAlive(job.ownerPid, job.ownerStartedAt))
        this.put({
          ...job,
          ownerPid: undefined,
          ownerStartedAt: undefined,
          updatedAt: new Date().toISOString(),
        });
  }
  cancel(id: string) {
    return this.transaction(() => {
      const job = this.get(id);
      if (!job) throw Error("Trabajo no encontrado");
      if (terminal.includes(job.state)) return job;
      const renderId =
        job.renderJobId ||
        this.repo
          .listJobs(job.projectId)
          .find((r) => r.requestKey === `director:${job.id}`)?.id;
      if (renderId) new RenderQueue(this.repo).cancel(renderId);
      return this.put({
        ...job,
        state: "CANCELED",
        waitingApproval: false,
        updatedAt: new Date().toISOString(),
      });
    });
  }
}
