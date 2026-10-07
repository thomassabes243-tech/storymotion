import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFmpegService, runProcess } from "../src/lib/render/FFmpegService";

test("fractional-second segments retain every frame on a constant 30 FPS timeline", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storymotion-fps-"));
  const service = new FFmpegService();
  const durationFrames = [143, 99, 98, 55, 55];
  const files: string[] = [];
  try {
    for (const [i, frames] of durationFrames.entries()) {
      const file = path.join(dir, `${i}.mp4`);
      await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=goldenrod:s=64x64:r=30",
        "-frames:v",
        String(frames),
        "-c:v",
        "libx264",
        "-video_track_timescale",
        "90000",
        "-an",
        file,
      ]);
      files.push(file);
    }
    const output = path.join(dir, "combined.mp4");
    await service.concat(files, output, { fps: 30, durationFrames });
    const probe = JSON.parse(
      await runProcess(process.env.FFPROBE_PATH || "ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_frames",
        "-of",
        "json",
        output,
      ]),
    );
    const total = durationFrames.reduce((sum, n) => sum + n, 0);
    assert.equal(probe.streams.length, 1);
    assert.equal(probe.streams[0].codec_name, "h264");
    assert.equal(probe.streams[0].avg_frame_rate, "30/1");
    assert.equal(probe.frames.length, total);
    for (const [i, frame] of probe.frames.entries())
      assert.ok(
        Math.abs(Number(frame.best_effort_timestamp_time) - i / 30) < 0.00002,
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
