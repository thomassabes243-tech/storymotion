import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { ClipManager } from "../src/lib/video/ClipManager";
import { FFmpegService, runProcess } from "../src/lib/render/FFmpegService";
import { LocalCommandVideoProvider } from "../src/lib/video/providers/LocalCommandVideoProvider";
import { ImportedAudio } from "../src/lib/audio/ImportedAudio";
import { RenderManager } from "../src/lib/render/RenderManager";
import { RenderQueue } from "../src/lib/render/RenderQueue";
import { ProjectService } from "../src/lib/story/ProjectService";
import { StoryAnalyzer } from "../src/lib/story/StoryAnalyzer";
import { ScenePlanner } from "../src/lib/story/ScenePlanner";
import { defaultConfig } from "../src/lib/domain";
test("real moving clip import strips audio, saves frame references, reuses content and rejects excessive duration", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "actionmotion-clip-"));
  const repo = new SQLiteRepository(dir),
    storage = new FileSystemStorage(dir);
  try {
    const source = path.join(dir, "source.mp4");
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=180x320:rate=24:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=400:duration=2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ]);
    const manager = new ClipManager(repo, storage);
    const bytes = await readFile(source);
    const clip = await manager.import(bytes, "motion.mp4");
    assert.equal((await manager.import(bytes, "same.mp4")).id, clip.id);
    assert.ok(clip.warnings.some((w) => w.includes("no crea detalle")));
    assert.notDeepEqual(
      await storage.get(clip.firstFrameKey),
      await storage.get(clip.lastFrameKey),
    );
    const ffmpeg = new FFmpegService();
    ffmpeg.validate(await ffmpeg.probe(storage.resolve(clip.storageKey)), {
      width: 1080,
      height: 1920,
      fps: 30,
      duration: 2,
    });
    const fast = path.join(dir, "fast.mp4");
    await manager.render(clip, fast, 24, 24, "fast");
    ffmpeg.validate(await ffmpeg.probe(fast), {
      width: 540,
      height: 960,
      fps: 24,
      duration: 1,
    });
    await assert.rejects(
      () => manager.render(clip, fast, 90, 30, "balanced"),
      /no cubre/,
    );
    await assert.rejects(() => manager.import(Buffer.from("bad"), "bad.mp4"));
    assert.ok(manager.get(clip.id));
    const request = {
      idempotencyKey: "a".repeat(64),
      prompt: "unused fixture",
      negativePrompt: "",
      firstFramePath: storage.resolve(clip.firstFrameKey),
      characterReferences: [],
      duration: 2,
      fps: 30 as const,
      seed: 1,
      outputPath: storage.resolve(clip.storageKey),
    };
    // Existing output path validates without executing the adapter. Not evidence of generative inference.
    const provider = new LocalCommandVideoProvider(process.execPath);
    await assert.rejects(() => provider.generate(request), /no pertenece/);
    await writeFile(
      `${request.outputPath}.request.json`,
      JSON.stringify({
        signature: createHash("sha256")
          .update(JSON.stringify(request))
          .digest("hex"),
        idempotencyKey: request.idempotencyKey,
      }),
    );
    assert.equal((await provider.generate(request)).path, request.outputPath);
    await assert.rejects(
      () => provider.generate({ ...request, prompt: "changed" }),
      /no pertenece/,
    );
    const project = new ProjectService(repo).create(
      "Clips only",
      "Un hombre camina por la calle.",
      defaultConfig,
    );
    project.analysis = await new StoryAnalyzer().analyze(
      project.story,
      project.config.style,
    );
    const shot = new ScenePlanner().plan(
      project.story,
      project.analysis,
      project.config,
    ).scenes[0];
    project.scenes = [
      {
        ...shot,
        start: 0,
        duration: 1,
        durationFrames: 30,
        clipAssetId: clip.id,
        layers: [],
        transitionOut: "hard_cut",
        status: "READY",
      },
    ];
    // Retain an old, deliberately missing illustration for rollback. It must not
    // prevent a valid clip from rendering, or require opening Chromium.
    const orphan = {
      id: "ab2772e5-e45a-431c-9342-2b9bc694ba6a",
      name: "old image",
      kind: "background" as const,
      mime: "image/png",
      storageKey: "assets/missing.png",
      source: "upload" as const,
      width: 1080,
      height: 1920,
    };
    project.assets = [orphan];
    project.scenes[0].layers = [
      {
        id: "old-layer",
        assetId: orphan.id,
        kind: "background",
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        depth: 0,
        blur: 0,
        startFrame: 0,
        endFrame: 30,
        keyframes: [],
        poses: [],
      },
    ];
    const queue = new RenderManager(repo, storage);
    const job = queue.enqueue(project);
    const browserBefore = process.env.CHROME_EXECUTABLE;
    process.env.CHROME_EXECUTABLE = "/no-browser-installed";
    try {
      const done = await queue.render(repo.claimJob(process.pid)!);
      assert.equal(done.state, "COMPLETE", done.error);
      assert.equal(done.id, job.id);
      ffmpeg.validate(await ffmpeg.probe(storage.resolve(done.outputKey!)), {
        width: 1080,
        height: 1920,
        fps: 30,
        duration: 1,
      });
    } finally {
      if (browserBefore === undefined) delete process.env.CHROME_EXECUTABLE;
      else process.env.CHROME_EXECUTABLE = browserBefore;
    }
    const incompatible = structuredClone(project);
    incompatible.scenes.push({
      ...incompatible.scenes[0],
      sceneId: "second",
      start: 1,
    });
    incompatible.scenes[0].transitionOut = "crossfade";
    assert.throws(
      () => new RenderQueue(repo).enqueue(incompatible),
      /cortes limpios/,
    );
    // Execute a fixture to verify the subprocess contract, not model inference.
    const fixture = path.join(dir, "fixture.cjs");
    await writeFile(
      fixture,
      `const fs = require("node:fs"); let text = ""; process.stdin.on("data", (chunk) => text += chunk); process.stdin.on("end", () => { const request = JSON.parse(text); fs.copyFileSync(process.argv[2], request.outputPath); });`,
    );
    const executableAdapter = new LocalCommandVideoProvider(process.execPath, [
      fixture,
      request.outputPath,
    ]);
    const fixtureRequest = {
      ...request,
      outputPath: path.join(dir, "fixture-output.mp4"),
    };
    await executableAdapter.generate(fixtureRequest);
    assert.equal(
      (await executableAdapter.generate(fixtureRequest)).path,
      fixtureRequest.outputPath,
    );
    assert.throws(
      () => new LocalCommandVideoProvider("/not-installed"),
      /instalado/,
    );
  } finally {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("imported noisy audio is measured, normalized, persisted and reused without mandatory TTS", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "actionmotion-audio-"));
  const repo = new SQLiteRepository(dir),
    storage = new FileSystemStorage(dir);
  try {
    const source = path.join(dir, "noisy.wav");
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=900:duration=2",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=color=white:amplitude=0.01:duration=2",
      "-filter_complex",
      "amix=inputs=2:duration=first",
      source,
    ]);
    const manager = new ImportedAudio(repo, storage);
    const bytes = await readFile(source);
    const audio = await manager.import(bytes, "noisy.wav", true, "clean");
    assert.equal(audio.source, "imported");
    assert.equal(
      (await manager.import(bytes, "same.wav", true, "clean")).id,
      audio.id,
    );
    assert.ok(audio.qualityReport!.processing.includes("two_pass_loudness"));
    assert.ok(Math.abs(audio.qualityReport!.integratedLufs + 16) < 2);
    assert.ok(audio.qualityReport!.truePeakDb < -0.5);
    const probe = JSON.parse(
      await runProcess("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        storage.resolve(audio.storageKey),
      ]),
    );
    assert.equal(probe.streams[0].codec_name, "aac");
    assert.equal(probe.streams[0].sample_rate, "48000");
    assert.ok(
      !probe.streams.some(
        (s: { codec_type: string }) => s.codec_type === "video",
      ),
    );
    await assert.rejects(() =>
      manager.import(Buffer.from("invalid"), "bad.mp3"),
    );
    assert.ok(repo.getAudio(audio.id));
    assert.deepEqual(await storage.get(audio.originalKey!), bytes);
    const preserved = await manager.import(
      bytes,
      "original.wav",
      false,
      "preserve",
    );
    assert.equal(preserved.qualityReport, undefined);
    assert.deepEqual(await storage.get(preserved.originalKey!), bytes);
    const interpolated = await new ClipManager(repo, storage).import(
      await readFile(path.join(dir, "motion-interpolation.mp4")).catch(
        async () => {
          const input = path.join(dir, "motion-interpolation.mp4");
          await runProcess("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=90x160:rate=24:duration=1",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            input,
          ]);
          return readFile(input);
        },
      ),
      "interpolation.mp4",
      true,
    );
    assert.equal(interpolated.interpolated, true);
  } finally {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  }
});
