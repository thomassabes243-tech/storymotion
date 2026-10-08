import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectSchema, totalFrames } from "../src/lib/domain";
import { ProjectService } from "../src/lib/story/ProjectService";
import { StoryAnalyzer } from "../src/lib/story/StoryAnalyzer";
import { ScenePlanner } from "../src/lib/story/ScenePlanner";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { AudioManager } from "../src/lib/audio/AudioManager";
import {
  narrationGroups,
  alignToNarration,
} from "../src/lib/audio/AudioTiming";
import { FFmpegService, runProcess } from "../src/lib/render/FFmpegService";
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storymotion-audio-"));
  const repo = new SQLiteRepository(dir),
    storage = new FileSystemStorage(dir);
  const draft = new ProjectService(repo).create(
    "Elena",
    "Elena caminó por el bosque. Elena encontró un libro.",
  );
  const analysis = await new StoryAnalyzer().analyze(draft.story);
  const project = {
    ...draft,
    analysis,
    scenes: new ScenePlanner().plan(draft.story, analysis, draft.config).scenes,
  };
  return { dir, repo, storage, project };
}
test("old projects remain silent; optional audio and resources persist across reopen", async () => {
  const f = await fixture();
  try {
    const legacy = { ...f.project } as Partial<typeof f.project>;
    delete legacy.audio;
    assert.equal(ProjectSchema.parse(legacy).audio.mode, "off");
    const saved = f.repo.save(
      {
        ...f.project,
        audio: { ...f.project.audio, mode: "automatic", rate: 1.15 },
      },
      f.project.revision,
    );
    f.repo.close();
    const reopened = new SQLiteRepository(f.dir);
    assert.deepEqual(reopened.get(saved.id)?.audio, saved.audio);
    reopened.close();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("each narrative excerpt is spoken once; reordered or edited shots preserve the complete original story", async () => {
  const f = await fixture();
  try {
    const groups = narrationGroups(f.project);
    assert.equal(groups.length, 2);
    assert.equal(
      groups.flatMap((g) => g.indices).length,
      f.project.scenes.length,
    );
    assert.equal(groups.map((g) => g.text).join(" "), f.project.story);
    const reordered = { ...f.project, scenes: [...f.project.scenes].reverse() };
    assert.equal(narrationGroups(reordered).length, 1);
    assert.equal(narrationGroups(reordered)[0].text, f.project.story);
    const edited = structuredClone(f.project);
    edited.scenes[0].sourceText = "Texto cambiado";
    assert.equal(narrationGroups(edited)[0].text, f.project.story);
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("actual voice cues align visual beats on the frame grid and retain characters and animation", async () => {
  const f = await fixture();
  try {
    const before = structuredClone(f.project),
      groups = narrationGroups(before);
    const cues = groups.map((g, i) => ({
      text: g.text,
      duration: i === 0 ? 3.07 : 4.19,
    }));
    const aligned = alignToNarration(before, cues);
    assert.equal(totalFrames(aligned.scenes), Math.ceil(7.26 * 30));
    const secondStart = aligned.scenes[groups[1].indices[0]].start;
    assert.ok(Math.abs(secondStart - cues[0].duration) <= 1 / 30);
    assert.deepEqual(aligned.analysis?.characters, before.analysis?.characters);
    assert.deepEqual(f.project, before);
    assert.ok(aligned.scenes.every((s) => s.durationFrames > 0));
    assert.throws(
      () => alignToNarration(before, [{ text: "Wrong", duration: 1 }]),
      /no coincide/,
    );
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("narration cache survives reopening and camera edits, but regenerates for a voice speed change", async () => {
  const f = await fixture();
  let calls = 0;
  const provider = {
    version: "test-voice",
    synthesize: async ({
      texts,
      output,
    }: {
      texts: string[];
      output: string;
    }) => {
      calls++;
      await runProcess("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        output,
      ]);
      return texts.map((text) => ({ text, duration: 2 / texts.length }));
    },
  };
  try {
    const manager = new AudioManager(f.repo, f.storage, provider);
    const first = await manager.narration(f.project);
    f.project.scenes[0].camera.movement = "pan_left";
    assert.equal((await manager.narration(f.project)).id, first.id);
    assert.equal(calls, 1);
    f.repo.close();
    const reopened = new SQLiteRepository(f.dir);
    assert.equal(
      (
        await new AudioManager(reopened, f.storage, provider).narration(
          f.project,
        )
      ).id,
      first.id,
    );
    f.project.audio.rate = 1.15;
    assert.notEqual(
      (
        await new AudioManager(reopened, f.storage, provider).narration(
          f.project,
        )
      ).id,
      first.id,
    );
    assert.equal(calls, 2);
    reopened.close();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test("real mux exports H.264/AAC with narration and ducked looping music; invalid music does not lose data", async () => {
  const f = await fixture();
  try {
    const video = path.join(f.dir, "silent.mp4"),
      voiceFile = path.join(f.dir, "voice.wav"),
      musicFile = path.join(f.dir, "music.wav");
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=gold:s=1080x1920:r=30",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      video,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      voiceFile,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=0.5",
      musicFile,
    ]);
    const manager = new AudioManager(f.repo, f.storage, {
      version: "test",
      synthesize: async ({ texts, output }) => {
        await f.storage.put(path.basename(output), await readFile(voiceFile));
        return texts.map((text) => ({ text, duration: 2 / texts.length }));
      },
    });
    const music = await manager.importMusic(
      await readFile(musicFile),
      "music.wav",
    );
    const voice = {
      ...music,
      storageKey: "voice.wav",
      source: "narration" as const,
    };
    const output = path.join(f.dir, "audio.mp4");
    await manager.mux(video, voice, output, 2, music);
    const service = new FFmpegService();
    const probe = await service.probe(output);
    service.validate(probe, {
      width: 1080,
      height: 1920,
      fps: 30,
      duration: 2,
      audioStreams: 1,
    });
    assert.equal(probe.audioCodec, "aac");
    assert.throws(
      () => service.validate(probe, { width: 1080, height: 1920, fps: 30 }),
      /Salida inválida/,
    );
    service.validate(await service.probe(video), {
      width: 1080,
      height: 1920,
      fps: 30,
    });
    await assert.rejects(() =>
      manager.importMusic(Buffer.from("not audio"), "bad.mp3"),
    );
    assert.ok(f.repo.getAudio(music.id));
    assert.equal(f.repo.get(f.project.id)?.story, f.project.story);
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      output,
      "-f",
      "null",
      "-",
    ]);
  } finally {
    f.repo.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
