import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "./StorageProvider";
import { processIdentity } from "../render/WorkerIdentity";
import {
  ProjectSchema,
  type Project,
  type Asset,
  type RenderJob,
  AudioAssetSchema,
  type AudioAsset,
} from "../domain";
export interface ProjectRepository {
  list(): Project[];
  get(id: string): Project | undefined;
  save(project: Project, expectedRevision?: number): Project;
}
export class ConflictError extends Error {}
export class SQLiteRepository implements ProjectRepository {
  db: DatabaseSync;
  constructor(directory = dataDirectory()) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "storymotion.sqlite"));
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, fingerprint TEXT, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS asset_fingerprint ON assets(fingerprint); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS queue ON jobs(state, created_at); CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, document TEXT NOT NULL);`,
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS audio_assets (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, document TEXT NOT NULL)",
    );
  }
  list() {
    return (
      this.db
        .prepare(
          "SELECT document FROM projects ORDER BY json_extract(document,'$.updatedAt') DESC",
        )
        .all() as { document: string }[]
    ).map((r) => ProjectSchema.parse(JSON.parse(r.document)));
  }
  get(id: string) {
    const row = this.db
      .prepare("SELECT document FROM projects WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? ProjectSchema.parse(JSON.parse(row.document)) : undefined;
  }
  save(project: Project, expectedRevision?: number) {
    const current = this.get(project.id);
    if (current && expectedRevision === undefined)
      throw new ConflictError("Se requiere revisión para actualizar");
    const next = ProjectSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...project,
          revision: (current?.revision ?? -1) + 1,
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
    if (current) {
      const result = this.db
        .prepare(
          "UPDATE projects SET revision=?,document=? WHERE id=? AND revision=?",
        )
        .run(next.revision, JSON.stringify(next), next.id, expectedRevision!);
      if (result.changes !== 1)
        throw new ConflictError(
          "El proyecto cambió. Recárgalo antes de guardar.",
        );
    } else
      this.db
        .prepare("INSERT INTO projects VALUES (?,?,?)")
        .run(next.id, next.revision, JSON.stringify(next));
    return next;
  }
  assets() {
    return (
      this.db.prepare("SELECT document FROM assets").all() as {
        document: string;
      }[]
    ).map((r) => JSON.parse(r.document) as Asset);
  }
  getAsset(id: string) {
    const row = this.db
      .prepare("SELECT document FROM assets WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? (JSON.parse(row.document) as Asset) : undefined;
  }
  findAsset(fingerprint: string) {
    const row = this.db
      .prepare("SELECT document FROM assets WHERE fingerprint=? LIMIT 1")
      .get(fingerprint) as { document: string } | undefined;
    return row ? (JSON.parse(row.document) as Asset) : undefined;
  }
  putAsset(asset: Asset) {
    this.db
      .prepare("INSERT OR REPLACE INTO assets VALUES (?,?,?)")
      .run(asset.id, asset.fingerprint || null, JSON.stringify(asset));
  }
  jobs(projectId?: string) {
    return (
      projectId
        ? this.db
            .prepare(
              "SELECT document FROM jobs WHERE project_id=? ORDER BY created_at DESC",
            )
            .all(projectId)
        : (this.db
            .prepare("SELECT document FROM jobs ORDER BY created_at DESC")
            .all() as unknown)
    ) as { document: string }[];
  }
  getAudio(id: string) {
    const row = this.db
      .prepare("SELECT document FROM audio_assets WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? AudioAssetSchema.parse(JSON.parse(row.document)) : undefined;
  }
  findAudio(fingerprint: string) {
    const row = this.db
      .prepare("SELECT document FROM audio_assets WHERE fingerprint=?")
      .get(fingerprint) as { document: string } | undefined;
    return row ? AudioAssetSchema.parse(JSON.parse(row.document)) : undefined;
  }
  putAudio(asset: AudioAsset) {
    const parsed = AudioAssetSchema.parse(asset);
    this.db
      .prepare("INSERT OR REPLACE INTO audio_assets VALUES (?,?,?)")
      .run(parsed.id, parsed.fingerprint, JSON.stringify(parsed));
    return parsed;
  }
  listJobs(projectId?: string) {
    return this.jobs(projectId).map((r) => JSON.parse(r.document) as RenderJob);
  }
  getJob(id: string) {
    const row = this.db
      .prepare("SELECT document FROM jobs WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? (JSON.parse(row.document) as RenderJob) : undefined;
  }
  putJob(job: RenderJob) {
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?,?,?)")
      .run(
        job.id,
        job.projectId,
        job.state,
        job.createdAt,
        JSON.stringify(job),
      );
    return job;
  }
  claimJob(pid: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "SELECT document FROM jobs WHERE state='RENDER_QUEUED' ORDER BY created_at LIMIT 1",
        )
        .get() as { document: string } | undefined;
      if (!row) {
        this.db.exec("COMMIT");
        return undefined;
      }
      const job = JSON.parse(row.document) as RenderJob;
      this.putJob({
        ...job,
        state: "RENDERING",
        ownerPid: pid,
        ownerStartedAt: processIdentity(pid)?.startedAt,
        attempts: job.attempts + 1,
        updatedAt: new Date().toISOString(),
      });
      this.db.exec("COMMIT");
      return this.getJob(job.id);
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
let singleton: SQLiteRepository | undefined;
export const repository = () => (singleton ??= new SQLiteRepository());
