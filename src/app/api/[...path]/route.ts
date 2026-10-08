import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { createReadStream, promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  repository,
  ConflictError,
} from "../../../lib/storage/ProjectRepository";
import { FileSystemStorage } from "../../../lib/storage/StorageProvider";
import {
  ProjectService,
  assetManager,
} from "../../../lib/story/ProjectService";
import {
  ConfigSchema,
  SceneSchema,
  SettingsSchema,
  defaultSettings,
  reflow,
  type RenderJob,
  AssetSchema,
  AudioConfigSchema,
} from "../../../lib/domain";
import { RenderQueue } from "../../../lib/render/RenderQueue";
import { AudioManager } from "../../../lib/audio/AudioManager";
import {
  speechAvailable,
  availableVoices,
} from "../../../lib/audio/providers/SpeechProvider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status });
const publicJob = (job: RenderJob) => {
  const { snapshot, renderedPlan, ...view } = job;
  return view;
};
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await context.params).path,
      repo = repository(),
      service = new ProjectService(repo),
      storage = new FileSystemStorage();
    if (p[0] === "health")
      return json({
        ok: true,
        imageProvider: !!process.env.IMAGE_PROVIDER_URL,
        storyAnalyzer: process.env.STORY_ANALYZER_URL ? "provider" : "local",
        automaticVoice: availableVoices().length > 0,
        voices: availableVoices(),
      });
    if (p[0] === "settings") {
      if (req.method === "GET") {
        const row = repo.db
          .prepare("SELECT document FROM settings WHERE id='default'")
          .get() as { document: string } | undefined;
        return json(row ? JSON.parse(row.document) : defaultSettings);
      }
      if (req.method === "PUT") {
        const settings = SettingsSchema.parse(await req.json());
        repo.db
          .prepare("INSERT OR REPLACE INTO settings VALUES ('default',?)")
          .run(JSON.stringify(settings));
        return json(settings);
      }
    }
    if (p[0] === "demo" && req.method === "POST")
      return json(await service.demo());
    if (p[0] === "assets") {
      if (!p[1] && req.method === "GET") return json(repo.assets());
      if (!p[1] && req.method === "POST") {
        const form = await req.formData(),
          file = form.get("file");
        if (!(file instanceof File)) throw new Error("Selecciona una imagen");
        const kind = AssetSchema.shape.kind.parse(
          form.get("kind") || "background",
        );
        const asset = await assetManager(repo).import(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
          kind,
        );
        const projectId = form.get("projectId");
        if (typeof projectId === "string") {
          const project = repo.get(projectId);
          if (project) {
            project.assets.push(asset);
            repo.save(project, project.revision);
          }
        }
        return json(asset, 201);
      }
      if (p[1] && p[2] === "data") {
        const asset = repo.getAsset(p[1]);
        if (!asset) return json({ error: "Asset no encontrado" }, 404);
        return new Response(
          new Uint8Array(await storage.get(asset.storageKey)),
          {
            headers: {
              "Content-Type": asset.mime,
              "Cache-Control": "private, max-age=31536000, immutable",
            },
          },
        );
      }
    }
    if (p[0] === "projects") {
      if (!p[1]) {
        if (req.method === "GET")
          return json(
            repo.list().map((project) => ({
              ...project,
              jobs: repo.listJobs(project.id).map(publicJob),
            })),
          );
        if (req.method === "POST") {
          const body = z
            .object({
              name: z.string().min(1).max(120),
              story: z.string().min(3).max(50000),
              config: ConfigSchema,
              audio: AudioConfigSchema.optional(),
            })
            .parse(await req.json());
          return json(
            service.create(body.name, body.story, body.config, body.audio),
            201,
          );
        }
      }
      const project = repo.get(p[1]);
      if (!project) return json({ error: "Proyecto no encontrado" }, 404);
      if (!p[2] && req.method === "GET")
        return json({
          ...project,
          jobs: repo.listJobs(project.id).map(publicJob),
        });
      if (p[2] === "analyze" && req.method === "POST")
        return json(await service.analyze(project));
      if (p[2] === "render" && req.method === "POST") {
        if (
          project.audio.mode === "automatic" &&
          !speechAvailable(project.audio.voice)
        )
          throw new Error(
            "La voz automática no está instalada en este servidor",
          );
        return json(publicJob(new RenderQueue(repo).enqueue(project)), 202);
      }
      if (p[2] === "audio") {
        if (req.method === "PATCH") {
          const body = z
            .object({ revision: z.number().int(), audio: AudioConfigSchema })
            .parse(await req.json());
          if (
            body.audio.mode === "automatic" &&
            !speechAvailable(body.audio.voice)
          )
            throw new Error(
              "La voz automática no está instalada en este servidor",
            );
          if (
            body.audio.musicAssetId &&
            repo.getAudio(body.audio.musicAssetId)?.source !== "music"
          )
            throw new Error("Música desconocida");
          return json(
            repo.save({ ...project, audio: body.audio }, body.revision),
          );
        }
        if (req.method === "POST" && p[3] === "music") {
          const length = Number(req.headers.get("content-length"));
          if (length > 51 * 1024 * 1024)
            throw new Error("El audio supera los 50 MB");
          const form = await req.formData(),
            file = form.get("file");
          if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
            throw new Error("Selecciona un audio de hasta 50 MB");
          const revision = z.coerce.number().int().parse(form.get("revision"));
          if (revision !== project.revision)
            throw new ConflictError("El proyecto cambió. Recárgalo.");
          const asset = await new AudioManager(repo, storage).importMusic(
            new Uint8Array(await file.arrayBuffer()),
            file.name,
          );
          return json(
            repo.save(
              {
                ...project,
                audio: { ...project.audio, musicAssetId: asset.id },
              },
              revision,
            ),
            201,
          );
        }
      }
      if (p[2] === "json")
        return new Response(
          JSON.stringify(
            { ...project, jobs: repo.listJobs(project.id).map(publicJob) },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="storymotion-${project.id}.json"`,
            },
          },
        );
      if (p[2] === "scenes" && p[3]) {
        const index = project.scenes.findIndex((s) => s.sceneId === p[3]);
        if (index < 0) return json({ error: "Escena no encontrada" }, 404);
        const scene = project.scenes[index];
        if (req.method === "PATCH") {
          const body = z
            .object({ revision: z.number().int(), scene: SceneSchema })
            .parse(await req.json());
          if (body.scene.sceneId !== scene.sceneId)
            throw new Error("No puedes cambiar el identificador de escena");
          const knownCharacters = new Set(
            project.analysis?.characters.map((c) => c.id),
          );
          if (body.scene.characters.some((id) => !knownCharacters.has(id)))
            throw new Error("Personaje desconocido");
          project.scenes[index] = body.scene;
          for (const layer of body.scene.layers) {
            for (const id of [
              layer.assetId,
              ...layer.poses.map((p) => p.assetId),
            ].filter((v): v is string => !!v)) {
              const asset = repo.getAsset(id);
              if (!asset) throw new Error("Asset desconocido");
              if (!project.assets.some((a) => a.id === id))
                project.assets.push(asset);
            }
          }
          project.scenes = reflow(project.scenes, project.config.fps);
          return json(repo.save(project, body.revision));
        }
        if (req.method === "POST") {
          const body = z
            .object({
              action: z.enum([
                "regenerate",
                "generate",
                "split",
                "merge",
                "move",
              ]),
              kind: AssetSchema.shape.kind.optional(),
              characterId: z.string().optional(),
              direction: z.enum(["up", "down"]).optional(),
              revision: z.number().int(),
            })
            .parse(await req.json());
          if (body.revision !== project.revision)
            throw new ConflictError("El proyecto cambió. Recárgalo.");
          if (body.action === "regenerate") {
            try {
              project.scenes[index] = await assetManager(repo).compose(
                project,
                scene,
              );
            } catch (error) {
              project.scenes[index] = {
                ...scene,
                status: "FAILED",
                error: String(error),
              };
            }
          }
          if (body.action === "generate") {
            if (
              body.characterId &&
              !project.analysis?.characters.some(
                (c) => c.id === body.characterId,
              )
            )
              throw new Error("Personaje desconocido");
            const pending = repo.save(
              {
                ...project,
                scenes: project.scenes.map((s, i) =>
                  i === index
                    ? { ...s, status: "GENERATING", error: undefined }
                    : s,
                ),
              },
              project.revision,
            );
            try {
              const asset = await assetManager(repo).generate(
                pending,
                scene,
                body.kind || "background",
                body.characterId,
              );
              const current = repo.get(project.id)!;
              const target = current.scenes.find(
                (s) => s.sceneId === scene.sceneId,
              )!;
              const layer = target.layers.find(
                (l) =>
                  l.kind === (body.kind || "background") &&
                  (!body.characterId || l.characterId === body.characterId),
              );
              if (!layer)
                throw new Error("Añade una capa de este tipo antes de generar");
              layer.assetId = asset.id;
              layer.poses = [];
              target.status = "READY";
              if (!current.assets.some((a) => a.id === asset.id))
                current.assets.push(asset);
              return json(repo.save(current, current.revision));
            } catch (error) {
              const current = repo.get(project.id)!;
              const target = current.scenes.find(
                (s) => s.sceneId === scene.sceneId,
              )!;
              target.status = "FAILED";
              target.error =
                error instanceof Error ? error.message : String(error);
              repo.save(current, current.revision);
              throw error;
            }
          }
          if (body.action === "split") {
            if (scene.durationFrames < 2)
              throw new Error("Este plano es demasiado corto");
            const half =
              Math.floor(scene.durationFrames / 2) / project.config.fps;
            const second = {
              ...structuredClone(scene),
              sceneId: `scene_${randomUUID().slice(0, 8)}`,
              duration: scene.duration - half,
              description: `Segundo encuadre: ${scene.description}`,
              camera: { ...scene.camera, movement: "slow_zoom_out" as const },
            };
            scene.duration = half;
            project.scenes.splice(index + 1, 0, second);
          }
          if (body.action === "merge") {
            const next = project.scenes[index + 1];
            if (!next) throw new Error("No existe una escena siguiente");
            scene.duration += next.duration;
            scene.sourceText += ` ${next.sourceText}`;
            scene.description += ` / ${next.description}`;
            scene.transitionOut = next.transitionOut;
            project.scenes.splice(index + 1, 1);
            project.warnings.push(
              "Planos unidos: se conserva la composición del primero; revisa sus capas.",
            );
          }
          if (body.action === "move") {
            const dest = index + (body.direction === "up" ? -1 : 1);
            if (dest >= 0 && dest < project.scenes.length)
              [project.scenes[index], project.scenes[dest]] = [
                project.scenes[dest],
                project.scenes[index],
              ];
          }
          project.scenes = reflow(project.scenes, project.config.fps);
          project.state = project.scenes.every((s) => s.status === "READY")
            ? "ASSETS_READY"
            : "ASSETS_PENDING";
          return json(repo.save(project, project.revision));
        }
      }
    }
    if (p[0] === "jobs" && p[1]) {
      const job = repo.getJob(p[1]);
      if (!job) return json({ error: "Render no encontrado" }, 404);
      if (p[2] === "retry" && req.method === "POST")
        return json(publicJob(new RenderQueue(repo).retry(job.id)), 202);
      if (!p[2]) return json(publicJob(job));
      if (p[2] === "video") {
        if (job.state !== "COMPLETE" || !job.outputKey)
          return json({ error: "Video todavía no disponible" }, 404);
        const file = storage.resolve(job.outputKey),
          stat = await fs.stat(file),
          range = req.headers.get("range");
        let start = 0,
          end = stat.size - 1,
          status = 200;
        if (range) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!m)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${stat.size}` },
            });
          if (m[1]) {
            start = Number(m[1]);
            if (m[2]) end = Math.min(Number(m[2]), end);
          } else if (m[2]) start = Math.max(0, stat.size - Number(m[2]));
          if (start > end || start >= stat.size)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${stat.size}` },
            });
          status = 206;
        }
        const stream = Readable.toWeb(
          createReadStream(file, { start, end }),
        ) as ReadableStream;
        return new Response(stream, {
          status,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
            ...(status === 206
              ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` }
              : {}),
            ...(req.nextUrl.searchParams.has("download")
              ? {
                  "Content-Disposition": `attachment; filename="storymotion-${job.id}.mp4"`,
                }
              : {}),
          },
        });
      }
    }
    return json({ error: "Ruta no encontrada" }, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Error inesperado",
      },
      error instanceof ConflictError ? 409 : 400,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
