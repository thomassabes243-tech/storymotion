import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import type { VideoProbe } from "../domain";
export function runProcess(binary: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      error = "";
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      error = (error + b.toString()).slice(-6000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${binary} terminó con ${code}: ${error}`)),
    );
  });
}
export class FFmpegService {
  async probe(file: string): Promise<VideoProbe> {
    const result = JSON.parse(
      await runProcess(process.env.FFPROBE_PATH || "ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ]),
    );
    const video = result.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    if (!video) throw new Error("El archivo no tiene video");
    const [num, den] = video.avg_frame_rate.split("/").map(Number);
    return {
      width: video.width,
      height: video.height,
      codec: video.codec_name,
      fps: num / den,
      duration: Number(result.format.duration),
      audioStreams: result.streams.filter(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ).length,
      audioCodec: result.streams.find(
        (s: { codec_type: string }) => s.codec_type === "audio",
      )?.codec_name,
    };
  }
  validate(
    probe: VideoProbe,
    expected: {
      width: number;
      height: number;
      fps: number;
      duration?: number;
      audioStreams?: number;
    },
  ) {
    if (
      probe.width !== expected.width ||
      probe.height !== expected.height ||
      probe.codec !== "h264" ||
      Math.abs(probe.fps - expected.fps) > 0.01 ||
      probe.audioStreams !== (expected.audioStreams ?? 0) ||
      ((expected.audioStreams ?? 0) > 0 && probe.audioCodec !== "aac")
    )
      throw new Error(`Salida inválida: ${JSON.stringify(probe)}`);
    if (
      expected.duration !== undefined &&
      Math.abs(probe.duration - expected.duration) > 2 / expected.fps
    )
      throw new Error("La duración exportada no coincide con el storyboard");
    return probe;
  }
  async concat(
    files: string[],
    output: string,
    timing: { fps: number; durationFrames: number[] },
  ) {
    const list = `${output}.concat.txt`;
    if (files.some((f) => /[\n\r']/.test(f)))
      throw new Error("Ruta de render no válida");
    if (
      !files.length ||
      !Number.isInteger(timing.fps) ||
      timing.fps <= 0 ||
      timing.durationFrames.length !== files.length ||
      timing.durationFrames.some((n) => !Number.isInteger(n) || n <= 0)
    )
      throw new Error("Duraciones de render no válidas");
    // MP4 container durations can be rounded to milliseconds. Derive each
    // segment boundary from its frame count so concatenation stays on the grid.
    await fs.writeFile(
      list,
      files
        .map(
          (file, i) =>
            `file '${file}'\nduration ${(timing.durationFrames[i] / timing.fps).toFixed(12)}`,
        )
        .join("\n"),
    );
    try {
      await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-c:v",
        "copy",
        "-bsf:v",
        `setts=pts=round(PTS*TB*${timing.fps})/(${timing.fps}*TB):dts=round(DTS*TB*${timing.fps})/(${timing.fps}*TB):duration=1/(${timing.fps}*TB)`,
        "-video_track_timescale",
        "90000",
        "-an",
        "-movflags",
        "+faststart",
        output,
      ]);
    } finally {
      await fs.rm(list, { force: true });
    }
  }
}
