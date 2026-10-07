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
    };
  }
  validate(
    probe: VideoProbe,
    expected: { width: number; height: number; fps: number; duration?: number },
  ) {
    if (
      probe.width !== expected.width ||
      probe.height !== expected.height ||
      probe.codec !== "h264" ||
      Math.abs(probe.fps - expected.fps) > 0.01 ||
      probe.audioStreams !== 0
    )
      throw new Error(`Salida inválida: ${JSON.stringify(probe)}`);
    if (
      expected.duration !== undefined &&
      Math.abs(probe.duration - expected.duration) > 2 / expected.fps
    )
      throw new Error("La duración exportada no coincide con el storyboard");
    return probe;
  }
  async concat(files: string[], output: string) {
    const list = `${output}.concat.txt`;
    if (files.some((f) => /[\n\r']/.test(f)))
      throw new Error("Ruta de render no válida");
    await fs.writeFile(list, files.map((file) => `file '${file}'`).join("\n"));
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
