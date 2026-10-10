import { z } from "zod";
import type { NextRequest } from "next/server";
import type { SQLiteRepository } from "../storage/ProjectRepository";
import { ConflictError } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { Director } from "./Director";
import { capabilities } from "./Capabilities";
import { publicAgentJob } from "./contracts";
import { ClipManager } from "../video/ClipManager";
import { ImportedAudio } from "../audio/ImportedAudio";
import { reflow } from "../domain";
import { videoResponse } from "../render/VideoResponse";
export async function agentApi(
  req: NextRequest,
  p: string[],
  repo: SQLiteRepository,
  storage: FileSystemStorage,
): Promise<Response | undefined> {
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  if (p[0] === "agent" && p[1] === "capabilities" && req.method === "GET")
    return json(capabilities());
  const director = new Director(repo, storage);
  if (p[0] === "agent-jobs") {
    const job = director.jobs.get(p[1]);
    if (!job) return json({ error: "Trabajo no encontrado" }, 404);
    if (req.method === "GET" && !p[2]) return json(publicAgentJob(job));
    if (req.method === "POST") {
      if (p[2] === "approve") {
        const body = z
          .object({ revision: z.number().int().min(0) })
          .parse(await req.json());
        return json(publicAgentJob(director.approve(job.id, body.revision)));
      }
      if (p[2] === "cancel")
        return json(publicAgentJob(director.jobs.cancel(job.id)));
      if (p[2] === "retry")
        return json(publicAgentJob(director.retry(job.id)), 202);
    }
  }
  if (p[0] === "clips" && p[1]) {
    const clip = new ClipManager(repo, storage).get(p[1]);
    if (!clip) return json({ error: "Clip no encontrado" }, 404);
    if (p[2] === "video" && ["GET", "HEAD"].includes(req.method))
      return videoResponse(
        req,
        storage.resolve(clip.storageKey),
        `actionmotion-${clip.id}.mp4`,
      );
    if (
      (p[2] === "first-frame" || p[2] === "last-frame") &&
      req.method === "GET"
    )
      return new Response(
        await storage.get(
          p[2] === "first-frame" ? clip.firstFrameKey : clip.lastFrameKey,
        ),
        {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=3600",
          },
        },
      );
  }
  if (p[0] === "audio-assets" && p[1] && req.method === "GET") {
    const audio = repo.getAudio(p[1]);
    if (!audio) return json({ error: "Audio no encontrado" }, 404);
    if (p[2] === "original" && audio.originalKey) {
      const response = await videoResponse(
        req,
        storage.resolve(audio.originalKey),
        `audio-original-${audio.id}`,
      );
      response.headers.set(
        "Content-Type",
        audio.originalMime || "application/octet-stream",
      );
      response.headers.set(
        "Content-Disposition",
        `attachment; filename="audio-original-${audio.id}"; filename*=UTF-8''${encodeURIComponent(audio.originalName || "audio-original")}`,
      );
      return response;
    }
    return json(audio);
  }
  if (p[0] !== "projects" || !p[1]) return;
  const project = repo.get(p[1]);
  if (!project) return;
  if (p[2] === "director") {
    if (req.method === "GET")
      return json(director.jobs.list(project.id).map(publicAgentJob));
    if (req.method === "POST")
      return json(publicAgentJob(director.enqueue(project)), 202);
  }
  if (p[2] === "audio" && p[3] === "import" && req.method === "POST") {
    if (Number(req.headers.get("content-length")) > 51 * 1024 * 1024)
      throw Error("Máximo 50 MB de audio.");
    const form = await req.formData();
    const file = form.get("file");
    const revision = z.coerce.number().int().parse(form.get("revision"));
    if (revision !== project.revision)
      throw new ConflictError("El proyecto cambió. Recárgalo.");
    if (!(file instanceof File)) throw Error("Selecciona un archivo de audio.");
    const asset = await new ImportedAudio(repo, storage).import(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      form.get("denoise") !== "false",
      form.get("processing") === "clean" ? "clean" : "preserve",
    );
    return json(
      {
        project: repo.save(
          {
            ...project,
            audio: {
              ...project.audio,
              mode: "imported",
              importedAssetId: asset.id,
            },
          },
          revision,
        ),
        asset,
      },
      201,
    );
  }
  if (p[2] === "scenes" && p[3] && p[4] === "clip" && req.method === "POST") {
    if (Number(req.headers.get("content-length")) > 51 * 1024 * 1024)
      throw Error("Máximo 50 MB por clip.");
    const form = await req.formData();
    const file = form.get("file");
    const revision = z.coerce.number().int().parse(form.get("revision"));
    if (revision !== project.revision)
      throw new ConflictError("El proyecto cambió. Recárgalo.");
    const scene = project.scenes.find((s) => s.sceneId === p[3]);
    if (!scene) throw Error("Escena desconocida.");
    if (!(file instanceof File)) throw Error("Selecciona un clip MP4.");
    const clip = await new ClipManager(repo, storage).import(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      form.get("interpolate") === "true",
    );
    scene.clipAssetId = clip.id;
    scene.clipStart = 0;
    scene.duration = clip.duration;
    scene.transitionOut = "hard_cut";
    scene.status = "READY";
    delete scene.error;
    const previous = project.scenes[project.scenes.indexOf(scene) - 1];
    if (previous) previous.transitionOut = "hard_cut";
    project.scenes = reflow(project.scenes, project.config.fps);
    return json({ project: repo.save(project, revision), clip }, 201);
  }
}
