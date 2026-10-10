import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import type { VideoProbe } from "../domain";
export function runProcess(
  binary: string,
  args: string[],
  options: { captureStderr?: boolean; timeoutMs?: number } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      error = "";
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs)
      : undefined;
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      error = (error + b.toString()).slice(-6000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(options.captureStderr ? out + error : out)
        : reject(new Error(`${binary} terminó con ${code}: ${error}`));
    });
  });
}
export class FFmpegService {
  async probe(file: string): Promise<VideoProbe> {
    const result = JSON.parse(
      await runProcess(process.env.FFPROBE_PATH || "ffprobe", [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
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
    const normalized: string[] = [];
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
    try {
      // The concat demuxer interprets every segment using the first stream's
      // time base. Remotion uses 1/90000 while imported MP4s often use 1/15360.
      // Remux differing tracks without re-encoding; otherwise mixed clips
      // silently acquire incorrect timestamps even when each clip is 30 FPS.
      const bases = await Promise.all(
        files.map(
          async (file) =>
            JSON.parse(
              await runProcess(process.env.FFPROBE_PATH || "ffprobe", [
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=time_base",
                "-of",
                "json",
                file,
              ]),
            ).streams[0]?.time_base,
        ),
      );
      const inputs: string[] = [];
      for (const [i, file] of files.entries()) {
        if (bases[i] === "1/90000") {
          inputs.push(file);
          continue;
        }
        const remuxed = `${output}.segment-${i}.mp4`;
        normalized.push(remuxed);
        await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
          "-y",
          "-v",
          "error",
          "-i",
          file,
          "-map",
          "0:v:0",
          "-c:v",
          "copy",
          "-an",
          "-video_track_timescale",
          "90000",
          remuxed,
        ]);
        inputs.push(remuxed);
      }
      await fs.writeFile(
        list,
        inputs
          .map(
            (file, i) =>
              `file '${file}'\nduration ${(timing.durationFrames[i] / timing.fps).toFixed(12)}`,
          )
          .join("\n"),
      );
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
      await Promise.all(normalized.map((file) => fs.rm(file, { force: true })));
    }
  }
}
