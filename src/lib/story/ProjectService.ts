import { randomUUID } from "node:crypto";
import {
  type Project,
  type Config,
  AnalysisSchema,
  defaultConfig,
  ProjectSchema,
  type AudioConfig,
  defaultAudio,
} from "../domain";
import { StoryAnalyzer, type StoryAnalysisProvider } from "./StoryAnalyzer";
import { ScenePlanner } from "./ScenePlanner";
import { ActionMotionStoryEngine } from "./ActionMotionStoryEngine";
import { AssetManager } from "../assets/AssetManager";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { agentConfig } from "../director/contracts";
import { HttpImageProvider } from "../assets/providers/ImageProvider";
export const DEMO_STORY =
  "Al amanecer, un ejército romano avanzaba lentamente por un valle. Sobre las montañas, varios arqueros enemigos observaban el movimiento. Uno de ellos levantó su arco y lanzó la primera flecha. Segundos después, cientos de flechas comenzaron a caer sobre los soldados.";
class HttpStoryProvider implements StoryAnalysisProvider {
  async analyze(story: string, style: string) {
    const response = await fetch(process.env.STORY_ANALYZER_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.STORY_ANALYZER_KEY
          ? { Authorization: `Bearer ${process.env.STORY_ANALYZER_KEY}` }
          : {}),
      },
      body: JSON.stringify({ story, style, schemaVersion: 1 }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok)
      throw new Error(`Análisis externo: HTTP ${response.status}`);
    return AnalysisSchema.parse({
      ...(await response.json()),
      analyzer: "provider",
    });
  }
}
export function assetManager(repo: SQLiteRepository) {
  return new AssetManager(
    repo,
    undefined,
    process.env.IMAGE_PROVIDER_URL &&
      agentConfig().externalPaidCalls &&
      !agentConfig().requireApproval
      ? new HttpImageProvider(
          process.env.IMAGE_PROVIDER_URL,
          process.env.IMAGE_PROVIDER_KEY,
        )
      : undefined,
  );
}
export class ProjectService {
  constructor(private repo: SQLiteRepository) {}
  create(
    name: string,
    story: string,
    config: Config = defaultConfig,
    audio: AudioConfig = defaultAudio,
  ) {
    const now = new Date().toISOString();
    return this.repo.save(
      ProjectSchema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        revision: 0,
        name,
        story,
        createdAt: now,
        updatedAt: now,
        config,
        audio,
        scenes: [],
        assets: [],
        warnings: [],
        state: "DRAFT",
      }),
    );
  }
  async analyze(project: Project) {
    if (project.scenes.length)
      throw new Error(
        "Este proyecto ya tiene storyboard. Edita o regenera planos individuales para conservar el trabajo.",
      );
    const original = this.repo.save(
      { ...project, state: "PLANNING" },
      project.revision,
    );
    try {
      const analysis = await new StoryAnalyzer(
        process.env.STORY_ANALYZER_URL &&
          agentConfig().externalPaidCalls &&
          !agentConfig().requireApproval
          ? new HttpStoryProvider()
          : undefined,
      ).analyze(project.story, project.config.style);
      const plan = new ScenePlanner().plan(
        project.story,
        analysis,
        project.config,
      );
      let result = this.repo.save(
        new ActionMotionStoryEngine().enrich({
          ...original,
          analysis,
          scenes: plan.scenes,
          warnings: [...analysis.warnings, ...plan.warnings],
          state: "ASSETS_PENDING",
        }),
        original.revision,
      );
      const manager = assetManager(this.repo);
      for (let i = 0; i < result.scenes.length; i++) {
        try {
          result.scenes[i] = await manager.compose(result, result.scenes[i]);
        } catch (error) {
          result.scenes[i] = {
            ...result.scenes[i],
            status: "FAILED",
            error: String(error),
          };
        }
        result = this.repo.save(result, result.revision);
      }
      result = this.repo.save(
        {
          ...result,
          state: result.scenes.every((s) => s.status === "READY")
            ? "ASSETS_READY"
            : "ASSETS_PENDING",
        },
        result.revision,
      );
      return result;
    } catch (error) {
      const current = this.repo.get(project.id)!;
      this.repo.save(
        {
          ...current,
          state: "FAILED",
          warnings: [error instanceof Error ? error.message : String(error)],
        },
        current.revision,
      );
      throw error;
    }
  }
  async demo() {
    const existing = this.repo
      .list()
      .find((p) => p.name === "Emboscada en el valle · Demo");
    if (existing?.scenes.length) return existing;
    const draft =
      existing ||
      this.create("Emboscada en el valle · Demo", DEMO_STORY, {
        ...defaultConfig,
        durationMode: "target",
        targetDuration: 30,
      });
    return this.analyze(draft);
  }
}
