import { createHash } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  openBrowser,
} from "@remotion/renderer";
import type { Project, RenderJob, RenderProps } from "../domain";
import { totalFrames, ProjectSchema } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { FFmpegService } from "./FFmpegService";
import { RenderQueue } from "./RenderQueue";
import { sceneCacheKey } from "./SceneCache";
import { AudioManager } from "../audio/AudioManager";
import { alignToNarration } from "../audio/AudioTiming";
import { ClipManager } from "../video/ClipManager";
import { renderQuality } from "../director/Capabilities";
let rendererBuild: { signature: string; url: Promise<string> } | undefined;
async function rendererSignature() {
  const roots = ["src/remotion", "src/lib/animation"];
  const files = (
    await Promise.all(
      roots.map(async (root) =>
        (await fs.readdir(root, { recursive: true }))
          .filter((name) => /\.tsx?$/.test(name))
          .map((name) => path.join(root, name)),
      ),
    )
  )
    .flat()
    .sort();
  const source = await Promise.all(
    files.map(async (file) => file + "\n" + (await fs.readFile(file, "utf8"))),
  );
  return createHash("sha256").update(source.join("\n")).digest("hex");
}
export class RenderManager extends RenderQueue {
  constructor(
    repo: SQLiteRepository,
    private storage = new FileSystemStorage(),
    private ffmpeg = new FFmpegService(),
  ) {
    super(repo);
  }
  async render(job: RenderJob) {
    let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
    const update = (patch: Partial<RenderJob>) => {
      if (this.repo.getJob(job.id)?.state === "CANCELED")
        patch = {
          ...patch,
          state: "CANCELED",
          ownerPid: undefined,
          ownerStartedAt: undefined,
        };
      job = { ...job, ...patch, updatedAt: new Date().toISOString() };
      this.repo.putJob(job);
    };
    try {
      const checkCanceled = () => {
        if (this.repo.getJob(job.id)?.state === "CANCELED")
          throw new Error("Producción cancelada");
      };
      checkCanceled();
      let project = ProjectSchema.parse(job.snapshot);
      const audio = new AudioManager(this.repo, this.storage);
      let narration;
      if (project.audio.mode === "automatic") {
        update({ phase: "NARRATION", progress: 0 });
        narration = await audio.narration(project, (progress) =>
          update({ progress: progress * 0.08 }),
        );
        project = alignToNarration(project, narration.cues);
        update({ narrationAssetId: narration.id, renderedPlan: project });
      }
      if (project.audio.mode === "imported") {
        narration = project.audio.importedAssetId
          ? this.repo.getAudio(project.audio.importedAssetId)
          : undefined;
        if (!narration || narration.source !== "imported")
          throw new Error("Falta el audio importado del proyecto.");
        if (
          project.audio.offset + narration.duration >
          totalFrames(project.scenes) / project.config.fps +
            1 / project.config.fps
        )
          throw new Error(
            "El audio importado supera el video. Aumenta la duración del storyboard para conservarlo completo.",
          );
      }
      update({ phase: "VISUALS", progress: 0.08 });
      const assetSources: Record<string, string> = {};
      const required = new Set(
        project.scenes
          .filter((s) => !s.clipAssetId)
          .flatMap((s) =>
            s.layers
              .flatMap((l) => [l.assetId, ...l.poses.map((p) => p.assetId)])
              .filter(Boolean),
          ),
      );
      for (const asset of project.assets.filter((a) => required.has(a.id)))
        assetSources[asset.id] =
          `data:${asset.mime};base64,${Buffer.from(await this.storage.get(asset.storageKey)).toString("base64")}`;
      const assetHashes = Object.fromEntries(
        Object.entries(assetSources).map(([id, src]) => [
          id,
          createHash("sha256").update(src).digest("hex"),
        ]),
      );
      const quality = renderQuality(project.config.quality);
      const clips = new ClipManager(this.repo, this.storage);
      for (const scene of project.scenes)
        if (scene.clipAssetId) {
          const clip = clips.get(scene.clipAssetId);
          if (!clip) throw new Error("Clip desconocido");
          assetHashes[clip.id] = clip.fingerprint;
        }
      const inputProps: RenderProps = { project, assetSources };
      const signature = await rendererSignature();
      const hasIllustrations = project.scenes.some((s) => !s.clipAssetId);
      let url: string | undefined;
      let composition:
        Awaited<ReturnType<typeof selectComposition>> | undefined;
      const browserExecutable =
        process.env.CHROME_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
      if (hasIllustrations) {
        if (rendererBuild?.signature !== signature)
          rendererBuild = {
            signature,
            url: bundle({
              entryPoint: path.resolve("src/remotion/Root.tsx"),
              publicDir: null,
            }),
          };
        url = await rendererBuild.url;
        browser = await openBrowser("chrome", { browserExecutable });
        composition = await selectComposition({
          serveUrl: url,
          id: "StoryMotion",
          inputProps,
          browserExecutable,
          puppeteerInstance: browser,
        });
      }
      const files: string[] = [];
      let from = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        checkCanceled();
        const scene = project.scenes[i];
        const hash = sceneCacheKey(project, i, assetHashes, signature);
        const key = `cache/${hash}.mp4`,
          outputLocation = this.storage.resolve(key);
        await fs.mkdir(path.dirname(outputLocation), { recursive: true });
        update({
          currentScene: i + 1,
          progress: 0.08 + (i / project.scenes.length) * 0.85,
        });
        if (!(await this.storage.exists(key))) {
          let lastUpdate = 0;
          if (scene.clipAssetId) {
            const clip = clips.get(scene.clipAssetId)!;
            await clips.render(
              clip,
              `${outputLocation}.partial.mp4`,
              scene.durationFrames,
              project.config.fps,
              project.config.quality,
              scene.clipStart,
            );
          } else
            await renderMedia({
              serveUrl: url!,
              composition: composition!,
              inputProps,
              codec: "h264",
              pixelFormat: "yuv420p",
              crf: quality.crf,
              scale: quality.width / project.config.width,
              muted: true,
              outputLocation: `${outputLocation}.partial.mp4`,
              frameRange: [from, from + scene.durationFrames - 1],
              browserExecutable,
              puppeteerInstance: browser,
              concurrency: Math.max(
                1,
                Math.min(
                  4,
                  Number(process.env.STORYMOTION_RENDER_CONCURRENCY) || 2,
                ),
              ),
              chromiumOptions: { disableWebSecurity: false },
              onProgress: ({ progress }) => {
                if (Date.now() - lastUpdate > 1200) {
                  update({
                    progress:
                      0.08 + ((i + progress) / project.scenes.length) * 0.85,
                  });
                  lastUpdate = Date.now();
                }
              },
            });
          await fs.rename(`${outputLocation}.partial.mp4`, outputLocation);
        }
        files.push(outputLocation);
        from += scene.durationFrames;
      }
      update({ progress: 0.94, phase: "MIXING" });
      checkCanceled();
      const outputKey = `renders/${job.id}.mp4`,
        output = this.storage.resolve(outputKey);
      await fs.mkdir(path.dirname(output), { recursive: true });
      const visualOutput = narration
        ? `${output}.visual.mp4`
        : `${output}.partial.mp4`;
      await this.ffmpeg.concat(files, visualOutput, {
        fps: project.config.fps,
        durationFrames: project.scenes.map((scene) => scene.durationFrames),
      });
      if (narration) {
        const music = project.audio.musicAssetId
          ? this.repo.getAudio(project.audio.musicAssetId)
          : undefined;
        if (project.audio.musicAssetId && !music)
          throw new Error("No se encuentra la música del proyecto");
        await audio.mux(
          visualOutput,
          narration,
          `${output}.partial.mp4`,
          totalFrames(project.scenes) / project.config.fps,
          music,
          project.audio.musicVolume,
          project.audio.offset,
        );
        await fs.rm(visualOutput, { force: true });
      }
      update({ phase: "VALIDATING", progress: 0.98 });
      const probe = this.ffmpeg.validate(
        await this.ffmpeg.probe(`${output}.partial.mp4`),
        {
          ...quality,
          fps: project.config.fps,
          duration: totalFrames(project.scenes) / project.config.fps,
          audioStreams: narration ? 1 : 0,
        },
      );
      await fs.rename(`${output}.partial.mp4`, output);
      checkCanceled();
      update({
        state: "COMPLETE",
        progress: 1,
        outputKey,
        probe,
        ownerPid: undefined,
        ownerStartedAt: undefined,
        error: undefined,
      });
      return job;
    } catch (error) {
      update({
        state: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        ownerPid: undefined,
        ownerStartedAt: undefined,
      });
      return job;
    } finally {
      if (browser) await browser.close({ silent: true }).catch(() => {});
    }
  }
}
