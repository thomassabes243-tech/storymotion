import type { Project } from "../domain";
import { StoryAnalyzer } from "../story/StoryAnalyzer";
import { ScenePlanner } from "../story/ScenePlanner";
import { AssetManager } from "../assets/AssetManager";
import { SQLiteRepository, ConflictError } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { RenderQueue } from "../render/RenderQueue";
import { totalFrames } from "../domain";
import { AgentRepository } from "./AgentRepository";
import { agentConfig, type AgentJob, type Specialist } from "./contracts";
import { OllamaNarrativeProvider } from "./OllamaNarrativeProvider";
import { renderQuality } from "./Capabilities";
import {
  VisualDesignerAgent,
  MotionDirectorAgent,
  StoryContinuityAgent,
  AudioEngineerAgent,
  VideoEditorAgent,
  QualityControlAgent,
} from "./Specialists";
export class Director {
  jobs: AgentRepository;
  constructor(
    private repo: SQLiteRepository,
    private storage = new FileSystemStorage(),
  ) {
    this.jobs = new AgentRepository(repo);
  }
  enqueue(project: Project) {
    if (!agentConfig().enabled) throw Error("El director está desactivado.");
    renderQuality(project.config.quality);
    return this.jobs.enqueue(project);
  }
  approve(id: string, revision: number) {
    return this.jobs.transaction(() => {
      const job = this.jobs.get(id);
      if (!job || job.state !== "STORYBOARD" || !job.waitingApproval)
        throw Error("Este trabajo no espera aprobación.");
      const project = this.repo.get(job.projectId);
      if (!project || project.revision !== revision)
        throw new ConflictError(
          "El storyboard cambió. Recárgalo antes de aprobar.",
        );
      renderQuality(project.config.quality);
      return this.jobs.put({
        ...job,
        snapshot: project,
        approvedRevision: revision,
        state: "GENERATING",
        waitingApproval: false,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  retry(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.state !== "FAILED")
      throw Error("Solo se reintentan trabajos fallidos.");
    if (job.attempts >= job.maxAttempts)
      throw Error(
        "Se agotaron los reintentos; revisa el error antes de crear otro trabajo.",
      );
    return this.jobs.put({
      ...job,
      state: job.resumeState || "ANALYZING",
      error: undefined,
      retryAt: 0,
      updatedAt: new Date().toISOString(),
    });
  }
  async tick(job: AgentJob) {
    const event = (agent: Specialist, message: string) => {
      job.events = [
        ...job.events,
        { at: new Date().toISOString(), agent, message },
      ].slice(-250);
    };
    const checkpoint = (patch: Partial<AgentJob>, project?: Project) =>
      this.jobs.transaction(() => {
        const current = this.jobs.get(job.id)!;
        if (current.state === "CANCELED") return current;
        const saved = project
          ? this.repo.save(project, job.snapshot.revision)
          : job.snapshot;
        return this.jobs.put({
          ...job,
          ...patch,
          snapshot: saved,
          ownerPid: undefined,
          ownerStartedAt: undefined,
          updatedAt: new Date().toISOString(),
        });
      });
    try {
      switch (job.state) {
        case "PENDING":
          event(
            "VideoEditorAgent",
            "Historia recibida; producción local sin servicios de pago.",
          );
          return checkpoint({ state: "ANALYZING", progress: 0.04 });
        case "ANALYZING": {
          let p = job.snapshot;
          if (!p.analysis) {
            const provider = process.env.ACTIONMOTION_OLLAMA_URL
              ? new OllamaNarrativeProvider(
                  process.env.ACTIONMOTION_OLLAMA_URL,
                  process.env.ACTIONMOTION_OLLAMA_MODEL || "qwen2.5:7b",
                )
              : undefined;
            const analysis = await new StoryAnalyzer(provider).analyze(
              p.story,
              p.config.style,
            );
            const plan = new ScenePlanner().plan(p.story, analysis, p.config);
            p = {
              ...p,
              analysis,
              scenes: plan.scenes,
              warnings: [...analysis.warnings, ...plan.warnings],
              state: "ASSETS_PENDING",
            };
          }
          event(
            "VisualDesignerAgent",
            `Storyboard de ${p.scenes.length} planos. ${p.analysis?.analyzer === "provider" ? "Modelo local de lenguaje." : "Análisis local por reglas; requiere revisión narrativa."}`,
          );
          const wait =
            agentConfig().requireApproval || agentConfig().mode === "SEMI_AUTO";
          return checkpoint(
            {
              state: wait ? "STORYBOARD" : "GENERATING",
              waitingApproval: wait,
              progress: 0.15,
            },
            p,
          );
        }
        case "STORYBOARD":
          return checkpoint({});
        case "GENERATING": {
          const p = structuredClone(job.snapshot);
          const next = p.scenes.find(
            (s) => !job.completedScenes.includes(s.sceneId),
          );
          if (!next) return checkpoint({ state: "ANIMATING", progress: 0.45 });
          if (!next.clipAssetId && !next.layers.length) {
            const i = p.scenes.indexOf(next);
            p.scenes[i] = await new AssetManager(
              this.repo,
              this.storage,
            ).compose(p, next);
          }
          event(
            "VisualDesignerAgent",
            `Material del plano ${next.sceneId} listo; se reutilizan referencias existentes.`,
          );
          return checkpoint(
            {
              currentScene: job.completedScenes.length + 1,
              completedScenes: [...job.completedScenes, next.sceneId],
              progress:
                0.15 +
                (0.3 * (job.completedScenes.length + 1)) / p.scenes.length,
            },
            p,
          );
        }
        case "ANIMATING": {
          let p = new VisualDesignerAgent().plan(job.snapshot).project;
          p = new MotionDirectorAgent().plan(p);
          p.state = "ASSETS_READY";
          const qc = await new QualityControlAgent().inspect(p, this.storage);
          const issues = [
            ...new StoryContinuityAgent().inspect(p),
            ...new AudioEngineerAgent().inspect(p),
            ...new VideoEditorAgent().inspect(p),
            ...qc,
          ];
          if (issues.some((i) => i.severity === "error"))
            throw Error(
              issues
                .filter((i) => i.severity === "error")
                .map((i) => i.message)
                .join("; "),
            );
          event(
            "MotionDirectorAgent",
            "Dirección, posiciones de entrada/salida y referencias persistentes preparadas.",
          );
          event(
            "StoryContinuityAgent",
            "Continuidad de identidades y dirección comprobada.",
          );
          event(
            "AudioEngineerAgent",
            p.audio.mode === "off"
              ? "Exportación sin audio."
              : "Audio opcional conservado.",
          );
          return checkpoint({ state: "RENDERING", issues, progress: 0.5 }, p);
        }
        case "RENDERING": {
          const render = job.renderJobId
            ? this.repo.getJob(job.renderJobId)
            : new RenderQueue(this.repo).enqueue(
                job.snapshot,
                `director:${job.id}`,
              );
          if (!render) throw Error("No se encuentra el trabajo de render.");
          if (render.state === "FAILED")
            throw Error(render.error || "Falló el render.");
          if (render.state === "COMPLETE") {
            event(
              "VideoEditorAgent",
              "MP4 compuesto; comienza verificación de salida.",
            );
            return checkpoint({
              state: "QUALITY_CHECK",
              renderJobId: render.id,
              progress: 0.94,
            });
          }
          return checkpoint({
            renderJobId: render.id,
            progress: 0.5 + 0.43 * render.progress,
            currentScene: render.currentScene,
            retryAt: Date.now() + 1000,
          });
        }
        case "QUALITY_CHECK": {
          const render = this.repo.getJob(job.renderJobId!);
          if (!render?.outputKey) throw Error("Falta la salida del render.");
          const p = render.renderedPlan || job.snapshot;
          await new QualityControlAgent().output(
            this.storage.resolve(render.outputKey),
            {
              ...renderQuality(p.config.quality),
              fps: p.config.fps,
              duration: totalFrames(p.scenes) / p.config.fps,
              audioStreams: p.audio.mode === "off" ? 0 : 1,
            },
          );
          event(
            "QualityControlAgent",
            "FFprobe y decodificación completa aprobados. La revisión de rostros y anatomía corresponde al usuario.",
          );
          return checkpoint({ state: "READY_FOR_REVIEW", progress: 1 });
        }
        default:
          return checkpoint({});
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = job.attempts + 1;
      const retry =
        attempts < job.maxAttempts &&
        !(e instanceof ConflictError) &&
        job.state !== "RENDERING";
      event("QualityControlAgent", `Error registrado: ${message}`);
      return checkpoint({
        state: retry ? job.state : "FAILED",
        resumeState: job.state,
        error: message,
        attempts,
        retryAt: Date.now() + 1000 * 2 ** attempts,
      });
    }
  }
}
