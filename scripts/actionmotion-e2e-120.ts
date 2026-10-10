import assert from "node:assert/strict";
import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { AudioManager } from "../src/lib/audio/AudioManager";
import { narrationGroups } from "../src/lib/audio/AudioTiming";
import {
  PiperSpeechProvider,
  availableVoices,
} from "../src/lib/audio/providers/SpeechProvider";
import { CharacterBible } from "../src/lib/characters/CharacterBible";
import { ContinuityEngine } from "../src/lib/story/ContinuityEngine";
import { FFmpegService, runProcess } from "../src/lib/render/FFmpegService";
import { QualityControlAgent } from "../src/lib/director/Specialists";
import { parseLoudness } from "../src/lib/audio/ImportedAudio";
import {
  ProjectSchema,
  totalFrames,
  type Project,
  type AudioConfig,
} from "../src/lib/domain";

const base = process.env.ACTIONMOTION_E2E_BASE_URL || "http://localhost:3103";
const root = path.resolve(
  process.env.STORYMOTION_DATA_DIR || "data/actionmotion-e2e-120",
);
const prefix = "docs/actionmotion-e2e-120";
const output = `${prefix}.mp4`;
const stateFile = path.join(root, "e2e-run.json");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (event: string, data: unknown = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, data }));
async function api(route: string, method = "GET", body?: unknown) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      `${method} ${route}: ${response.status} ${JSON.stringify(data)}`,
    );
  return data;
}
async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 60000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (done(value)) return value;
    await pause(1500);
  }
  throw Error("Se agotó el tiempo de espera.");
}
async function fullDecode(file: string, logFile: string) {
  const stream = createWriteStream(logFile);
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-hide_banner",
        "-v",
        "info",
        "-xerror",
        "-i",
        file,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        "freezedetect=n=-50dB:d=1.5,blackdetect=d=0.8:pix_th=0.03",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr.pipe(stream);
    child.on("error", reject);
    child.on("close", (code) => {
      stream.end(() =>
        code === 0
          ? resolve()
          : reject(Error(`Decodificación FFmpeg: ${code}`)),
      );
    });
  });
  const text = await fs.readFile(logFile, "utf8");
  return {
    passed: true,
    elapsedMs: Date.now() - started,
    freezeThreshold: "-50 dB / 1.5 segundos",
    blackThreshold: "0.8 segundos / pix_th 0.03",
    freezeEvents: text
      .split(/\r?\n/)
      .filter((line) => /freeze_(start|duration|end):/.test(line)),
    blackEvents: text
      .split(/\r?\n/)
      .filter((line) => /black_start:/.test(line)),
    logFile,
    decodedFrames: Number(
      [...text.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] || 0,
    ),
  };
}
async function main() {
  await fs.mkdir(root, { recursive: true });
  const story = (await fs.readFile(`${prefix}-story.txt`, "utf8")).trim();
  const health = await api("/api/health");
  const capabilities = await api("/api/agent/capabilities");
  assert.equal(health.storyAnalyzer, "local");
  assert.equal(health.imageProvider, false);
  assert.equal(capabilities.agent.externalPaidCalls, false);
  assert.equal(capabilities.narrativeEngine, "local_rules");
  let state:
    | { projectId: string; agentId: string; started: number; audio?: unknown }
    | undefined;
  try {
    state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {}
  const pageErrors: string[] = [];
  if (!state) {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_EXECUTABLE || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(base);
      await page
        .getByRole("button", { name: "Nuevo proyecto", exact: true })
        .click();
      await page
        .getByLabel("Nombre del proyecto")
        .fill("El mensaje del valle · prueba completa 120 s");
      await page.getByTestId("story-input").fill(story);
      await page
        .getByRole("combobox", { name: "Duración", exact: true })
        .selectOption("target");
      await page.getByLabel("Duración objetivo (segundos)").fill("120");
      await page.getByLabel("Calidad de producción").selectOption("balanced");
      await page.getByLabel("Motor de movimiento").selectOption("cutout");
      await page.getByLabel("Fotogramas por segundo").selectOption("30");
      // Audio is calibrated locally before approving, without changing the narrative input.
      await page
        .getByRole("combobox", { name: "Narración", exact: true })
        .selectOption("off");
      const started = Date.now();
      await page
        .getByRole("button", { name: "Analizar historia", exact: true })
        .click();
      await page.waitForURL(/\/projects\/.+tab=director/);
      const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
      const agent = await waitFor(
        () => api(`/api/projects/${projectId}/director`),
        (jobs: any[]) => jobs[0]?.state === "STORYBOARD",
      );
      state = { projectId, agentId: agent[0].id, started };
      await fs.writeFile(stateFile, JSON.stringify(state));
      assert.equal(pageErrors.length, 0);
      log("storyboard", { projectId, agentId: state.agentId });
    } finally {
      await browser.close();
    }
  }
  let agent = await api(`/api/agent-jobs/${state.agentId}`);
  if (agent.state === "STORYBOARD") {
    let project = ProjectSchema.parse(
      await api(`/api/projects/${state.projectId}`),
    );
    assert.equal(project.config.quality, "balanced");
    assert.equal(project.config.motionMode, "cutout");
    assert.equal(totalFrames(project.scenes), 3600);
    assert(project.scenes.length > 10);
    const bible = new CharacterBible(project.analysis!.characters);
    for (const scene of project.scenes)
      for (const id of scene.characters) assert.equal(bible.get(id).id, id);
    assert.deepEqual(
      new ContinuityEngine().validate(project.scenes, project.analysis!),
      [],
    );
    const repo = new SQLiteRepository(root);
    const storage = new FileSystemStorage(root);
    try {
      const voices = availableVoices();
      let rate = 0.96;
      let audio: AudioConfig = {
        ...project.audio,
        mode: "automatic",
        voice: voices.includes("es_MX-claude-high")
          ? "es_MX-claude-high"
          : "es_MX-ald-medium",
        delivery: "narrator",
        rate,
      };
      if (health.automaticVoice && voices.length) {
        const manager = new AudioManager(
          repo,
          storage,
          new PiperSpeechProvider(),
        );
        let generated;
        const calibration = [];
        for (let attempt = 0; attempt < 4; attempt++) {
          audio = { ...audio, rate };
          generated = await manager.narration(
            { ...project, audio },
            (progress) => log("tts", { attempt, progress }),
          );
          calibration.push({ rate, duration: generated.duration });
          if (Math.abs(generated.duration - 120) <= 0.5) break;
          const next = Math.max(
            0.8,
            Math.min(1.3, (rate * generated.duration) / 120),
          );
          if (Math.abs(next - rate) < 0.0001) break;
          rate = next;
        }
        assert(generated);
        assert(
          Math.abs(generated.duration - 120) <= 2,
          `Narración fuera de duración: ${generated.duration}`,
        );
        assert.equal(
          generated.cues.map((c) => c.text).join(" "),
          narrationGroups(project)
            .map((c) => c.text)
            .join(" "),
        );
        state.audio = {
          source: "real_local_tts",
          provider: "Piper",
          voice: audio.voice,
          delivery: audio.delivery,
          rate: audio.rate,
          duration: generated.duration,
          cues: generated.cues,
          calibration,
          placeholder: false,
        };
        project = ProjectSchema.parse(
          await api(`/api/projects/${project.id}/audio`, "PATCH", {
            revision: project.revision,
            audio,
          }),
        );
      } else {
        const placeholder = path.join(root, "placeholder-audio.wav");
        await runProcess("ffmpeg", [
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=120:sample_rate=48000",
          "-af",
          "volume=0.03",
          placeholder,
        ]);
        const data = new FormData();
        data.set(
          "file",
          new File(
            [await fs.readFile(placeholder)],
            "PLACEHOLDER-tono-de-prueba-NO-NARRACION.wav",
          ),
        );
        data.set("revision", String(project.revision));
        data.set("processing", "preserve");
        data.set("denoise", "false");
        const response = await fetch(
          base + `/api/projects/${project.id}/audio/import`,
          { method: "POST", body: data },
        );
        assert.equal(response.status, 201);
        project = ProjectSchema.parse((await response.json()).project);
        state.audio = {
          source: "placeholder",
          provider: "FFmpeg sine",
          placeholder: true,
          reason:
            "No configured local TTS is available. This is a test tone, not narration.",
        };
      }
      await fs.writeFile(stateFile, JSON.stringify(state));
      const browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
      });
      try {
        const page = await browser.newPage({
          viewport: { width: 390, height: 844 },
        });
        page.on("pageerror", (e) => pageErrors.push(e.message));
        await page.goto(`${base}/projects/${project.id}?tab=director`);
        await page
          .getByRole("button", { name: "Aprobar storyboard y producir" })
          .click();
      } finally {
        await browser.close();
      }
      log("approved", {
        scenes: project.scenes.length,
        characters: bible.all().map((c) => ({ id: c.id, name: c.name })),
        audio: state.audio,
      });
    } finally {
      repo.close();
    }
  }
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  let lastLog = 0;
  while (Date.now() < deadline) {
    agent = await api(`/api/agent-jobs/${state.agentId}`);
    if (agent.state === "READY_FOR_REVIEW") break;
    if (agent.state === "FAILED") {
      if (agent.attempts >= agent.maxAttempts) throw Error(agent.error);
      log("retry", { error: agent.error, attempts: agent.attempts });
      await api(`/api/agent-jobs/${agent.id}/retry`, "POST");
    }
    if (Date.now() - lastLog > 30000) {
      const render = agent.renderJobId
        ? await api(`/api/jobs/${agent.renderJobId}`)
        : undefined;
      log("progress", {
        state: agent.state,
        progress: render?.progress || agent.progress,
        scene: render?.currentScene || agent.currentScene,
        scenes: render?.sceneCount,
        phase: render?.phase,
      });
      lastLog = Date.now();
    }
    await pause(2000);
  }
  assert.equal(agent.state, "READY_FOR_REVIEW");
  const render = await api(`/api/jobs/${agent.renderJobId}`);
  const download = await fetch(
    base + `/api/jobs/${render.id}/video?download=1`,
  );
  assert.equal(download.status, 200);
  assert(download.headers.get("content-disposition")?.includes("attachment"));
  await fs.writeFile(output, new Uint8Array(await download.arrayBuffer()));
  const range = await fetch(base + `/api/jobs/${render.id}/video`, {
    headers: { Range: "bytes=0-1023" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  const repo = new SQLiteRepository(root);
  let project: Project;
  try {
    project =
      repo.getJob(render.id)!.renderedPlan || repo.get(state.projectId)!;
  } finally {
    repo.close();
  }
  const expected = {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: totalFrames(project.scenes) / 30,
    audioStreams: 1,
  };
  assert(Math.abs(expected.duration - 120) <= 2);
  const observedCrf = [
    ...new Set(
      [
        ...(await fs.readFile(output))
          .toString("latin1")
          .matchAll(/\bcrf=([0-9.]+)/g),
      ].map((match) => Number(match[1])),
    ),
  ];
  assert.deepEqual(observedCrf, [20], "Los segmentos x264 deben usar CRF20.");
  const technical = await new QualityControlAgent().output(output, expected);
  const decode = await fullDecode(output, `${prefix}-decode.log`);
  assert.equal(decode.decodedFrames, totalFrames(project.scenes));
  const loudness = parseLoudness(
    await runProcess(
      "ffmpeg",
      [
        "-v",
        "info",
        "-i",
        output,
        "-map",
        "0:a:0",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
      ],
      { captureStderr: true },
    ),
  );
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let mobile;
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${base}/projects/${project.id}?tab=director`);
    await page.locator(".agent-result video").waitFor();
    await page.waitForFunction(
      () =>
        (document.querySelector(".agent-result video") as HTMLVideoElement)
          ?.readyState >= 2,
    );
    const metadata = await page
      .locator(".agent-result video")
      .evaluate(async (video: HTMLVideoElement) => {
        video.muted = true;
        await video.play();
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          playing: !video.paused,
        };
      });
    await page.waitForFunction(
      () => {
        const video = document.querySelector(
          ".agent-result video",
        ) as HTMLVideoElement;
        return (
          video?.currentTime > 0.75 &&
          video.getVideoPlaybackQuality().totalVideoFrames > 0
        );
      },
      {},
      { timeout: 30000 },
    );
    const decodedFrame = await page
      .locator(".agent-result video")
      .evaluate((video: HTMLVideoElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 28;
        const context = canvas.getContext("2d")!;
        context.drawImage(video, 0, 0, 16, 28);
        const pixels = context.getImageData(0, 0, 16, 28).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4)
          sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        return {
          currentTime: video.currentTime,
          frames: video.getVideoPlaybackQuality().totalVideoFrames,
          meanRgb: sum / (16 * 28),
        };
      });
    assert(
      decodedFrame.meanRgb > 8,
      "El reproductor debe mostrar un fotograma decodificado, no negro.",
    );
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    assert.equal(fits, true);
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1920);
    assert.equal(metadata.playing, true);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `${prefix}-mobile.png`, fullPage: true });
    await page
      .locator(".agent-result video")
      .screenshot({ path: `${prefix}-mobile-player.png` });
    mobile = {
      viewport: "390x844",
      fits,
      metadata,
      decodedFrame,
      errors: pageErrors,
    };
  } finally {
    await browser.close();
  }
  const warnings = [...technical.issues, ...agent.issues];
  const report = {
    status: "FUNCTIONAL_WITH_VISUAL_LIMITATIONS",
    scope:
      "Original story → mobile UI → local rule storyboard → CharacterBible → local Piper narration → persistent director → layered Remotion render → FFmpeg montage/AAC → technical QA → HTTP download/mobile playback",
    originalStory: story,
    wordCount: story.match(/[\p{L}\p{N}]+/gu)!.length,
    requested: {
      durationSeconds: 120,
      quality: "balanced",
      width: 1080,
      height: 1920,
      fps: 30,
      crf: 20,
      motionMode: "cutout",
    },
    projectId: project.id,
    agentId: agent.id,
    renderJobId: render.id,
    state: agent.state,
    elapsedMs: Date.now() - state.started,
    audio: state.audio,
    probe: technical.probe,
    frames: totalFrames(project.scenes),
    sceneCount: project.scenes.length,
    qa: {
      encoder: {
        observedCrf,
        evidence: "x264 encoder options embedded in segment SEI",
      },
      decode,
      loudness: {
        integratedLufs: Number(loudness.input_i),
        truePeakDb: Number(loudness.input_tp),
        loudnessRange: Number(loudness.input_lra),
      },
      technicalIssues: technical.issues,
      warnings,
      warningCounts: warnings.reduce(
        (counts: Record<string, number>, issue: any) => {
          counts[issue.code] = (counts[issue.code] || 0) + 1;
          return counts;
        },
        {},
      ),
    },
    mobile,
    http: {
      downloadStatus: download.status,
      contentDisposition: download.headers.get("content-disposition"),
      rangeStatus: range.status,
    },
    characters: project.analysis!.characters,
    scenes: project.scenes.map((scene) => ({
      id: scene.sceneId,
      duration: scene.duration,
      action: scene.action,
      camera: scene.camera,
      characters: scene.characters,
      status: scene.status,
      visualPlan: scene.visualPlan,
    })),
    limitations: [
      "Illustrations are procedural placeholders; no generative provider was used.",
      "Animation is schematic 2.5D, not photorealistic human performance.",
      "Narrative analysis uses local rules, not an installed language model.",
      "QA verifies definitions and technical video/audio properties, not face identity or anatomy in pixels.",
      "No production deployment or paid service calls.",
    ],
    output,
    bytes: (await fs.stat(output)).size,
    sha256: createHash("sha256")
      .update(await fs.readFile(output))
      .digest("hex"),
    events: agent.events,
  };
  await fs.writeFile(
    `${prefix}-verification.json`,
    JSON.stringify(report, null, 2),
  );
  await fs.writeFile(
    `${prefix}-project.json`,
    JSON.stringify(project, null, 2),
  );
  log("complete", {
    output,
    probe: report.probe,
    frames: report.frames,
    scenes: report.sceneCount,
    durationMs: report.elapsedMs,
    audio: (state.audio as any)?.source,
    qa: { freezeEvents: decode.freezeEvents, blackEvents: decode.blackEvents },
    bytes: report.bytes,
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
