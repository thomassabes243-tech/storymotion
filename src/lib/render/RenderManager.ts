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
import { totalFrames } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { FFmpegService } from "./FFmpegService";
import { RenderQueue } from "./RenderQueue";
import { sceneCacheKey } from "./SceneCache";
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
      job = { ...job, ...patch, updatedAt: new Date().toISOString() };
      this.repo.putJob(job);
    };
    try {
      const project = job.snapshot,
        assetSources: Record<string, string> = {};
      const required = new Set(
        project.scenes.flatMap((s) =>
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
      const inputProps: RenderProps = { project, assetSources };
      const signature = await rendererSignature();
      if (rendererBuild?.signature !== signature)
        rendererBuild = {
          signature,
          url: bundle({
            entryPoint: path.resolve("src/remotion/Root.tsx"),
            publicDir: null,
          }),
        };
      const url = await rendererBuild.url;
      const browserExecutable =
        process.env.CHROME_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
      browser = await openBrowser("chrome", { browserExecutable });
      const composition = await selectComposition({
        serveUrl: url,
        id: "StoryMotion",
        inputProps,
        browserExecutable,
        puppeteerInstance: browser,
      });
      const files: string[] = [];
      let from = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        const hash = sceneCacheKey(project, i, assetHashes, signature);
        const key = `cache/${hash}.mp4`,
          outputLocation = this.storage.resolve(key);
        await fs.mkdir(path.dirname(outputLocation), { recursive: true });
        update({
          currentScene: i + 1,
          progress: (i / project.scenes.length) * 0.95,
        });
        if (!(await this.storage.exists(key))) {
          let lastUpdate = 0;
          await renderMedia({
            serveUrl: url,
            composition,
            inputProps,
            codec: "h264",
            pixelFormat: "yuv420p",
            crf: 20,
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
                  progress: ((i + progress) / project.scenes.length) * 0.95,
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
      update({ progress: 0.96 });
      const outputKey = `renders/${job.id}.mp4`,
        output = this.storage.resolve(outputKey);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await this.ffmpeg.concat(files, `${output}.partial.mp4`, {
        fps: project.config.fps,
        durationFrames: project.scenes.map((scene) => scene.durationFrames),
      });
      const probe = this.ffmpeg.validate(
        await this.ffmpeg.probe(`${output}.partial.mp4`),
        {
          ...project.config,
          duration: totalFrames(project.scenes) / project.config.fps,
        },
      );
      await fs.rename(`${output}.partial.mp4`, output);
      update({
        state: "COMPLETE",
        progress: 1,
        outputKey,
        probe,
        ownerPid: undefined,
        error: undefined,
      });
      return job;
    } catch (error) {
      update({
        state: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        ownerPid: undefined,
      });
      return job;
    } finally {
      if (browser) await browser.close({ silent: true }).catch(() => {});
    }
  }
}
