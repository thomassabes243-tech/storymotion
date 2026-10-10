import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { FFmpegService, runProcess } from "../render/FFmpegService";
import { renderQuality } from "../director/Capabilities";
export const ClipSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  storageKey: z.string(),
  fingerprint: z.string(),
  duration: z.number().positive(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  sourceWidth: z.number(),
  sourceHeight: z.number(),
  sourceFps: z.number(),
  firstFrameKey: z.string(),
  lastFrameKey: z.string(),
  interpolated: z.boolean(),
  warnings: z.array(z.string()),
  source: z.enum(["upload", "generated"]).default("upload"),
});
export type ClipAsset = z.infer<typeof ClipSchema>;
export class ClipManager {
  constructor(
    private repo: SQLiteRepository,
    private storage = new FileSystemStorage(),
  ) {
    repo.db.exec(
      "CREATE TABLE IF NOT EXISTS video_assets(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,document TEXT NOT NULL)",
    );
  }
  get(id: string) {
    const row = this.repo.db
      .prepare("SELECT document FROM video_assets WHERE id=?")
      .get(id) as { document: string } | undefined;
    return row ? ClipSchema.parse(JSON.parse(row.document)) : undefined;
  }
  async import(
    bytes: Uint8Array,
    name: string,
    interpolate = false,
    source: ClipAsset["source"] = "upload",
  ) {
    if (!bytes.length || bytes.length > 50 * 1024 * 1024)
      throw Error("El clip debe ocupar entre 1 byte y 50 MB.");
    const fingerprint = createHash("sha256")
      .update(bytes)
      .update(String(interpolate))
      .digest("hex");
    const old = this.repo.db
      .prepare("SELECT id FROM video_assets WHERE fingerprint=?")
      .get(fingerprint) as { id: string } | undefined;
    if (old) {
      const clip = this.get(old.id)!;
      if (await this.storage.exists(clip.storageKey)) return clip;
    }
    const id = randomUUID(),
      key = `clips/${id}.mp4`,
      output = this.storage.resolve(key),
      input = output + ".input";
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(input, bytes);
    try {
      const ffmpeg = new FFmpegService();
      const original = await ffmpeg.probe(input);
      if (
        !Number.isFinite(original.duration) ||
        original.duration <= 0 ||
        original.duration > 120 ||
        !Number.isFinite(original.fps) ||
        original.fps <= 0 ||
        original.width * original.height > 17000000
      )
        throw Error(
          "Selecciona un clip válido de hasta 120 segundos y 17 megapíxeles.",
        );
      const frames = Math.max(1, Math.floor(original.duration * 30));
      const filter = `${interpolate ? "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1," : "fps=30,"}scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,tpad=stop_mode=clone:stop_duration=${interpolate ? (3 / original.fps).toFixed(4) : "0.1"}`;
      await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
        "-y",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        filter,
        "-frames:v",
        String(frames),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output + ".partial.mp4",
      ]);
      const probe = ffmpeg.validate(
        await ffmpeg.probe(output + ".partial.mp4"),
        { width: 1080, height: 1920, fps: 30, duration: frames / 30 },
      );
      await fs.rename(output + ".partial.mp4", output);
      const firstFrameKey = `clips/${id}-first.png`,
        lastFrameKey = `clips/${id}-last.png`;
      for (const [key, time] of [
        [firstFrameKey, 0],
        [lastFrameKey, Math.max(0, probe.duration - 1 / 30)],
      ] as const)
        await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
          "-y",
          "-v",
          "error",
          "-ss",
          String(time),
          "-i",
          output,
          "-frames:v",
          "1",
          this.storage.resolve(key),
        ]);
      const clip = ClipSchema.parse({
        id,
        name: name.slice(0, 120),
        storageKey: key,
        fingerprint,
        duration: frames / 30,
        width: 1080,
        height: 1920,
        fps: 30,
        sourceWidth: original.width,
        sourceHeight: original.height,
        sourceFps: original.fps,
        firstFrameKey,
        lastFrameKey,
        interpolated: interpolate,
        source,
        warnings: [
          ...(original.width < 1080 || original.height < 1920
            ? [
                "Fuente menor que la salida; el reescalado no crea detalle nuevo.",
              ]
            : []),
          ...(Math.abs(original.width / original.height - 9 / 16) > 0.01
            ? ["Recorte central a 9:16; revisa el encuadre."]
            : []),
          ...(interpolate
            ? ["Interpolación óptica: revisar artefactos y movimiento."]
            : []),
        ],
      });
      this.repo.db
        .prepare("INSERT OR REPLACE INTO video_assets VALUES(?,?,?)")
        .run(id, fingerprint, JSON.stringify(clip));
      return clip;
    } catch (e) {
      await Promise.all(
        [
          output,
          output + ".partial.mp4",
          this.storage.resolve(`clips/${id}-first.png`),
          this.storage.resolve(`clips/${id}-last.png`),
        ].map((f) => fs.rm(f, { force: true })),
      );
      throw e;
    } finally {
      await fs.rm(input, { force: true });
    }
  }
  async render(
    clip: ClipAsset,
    output: string,
    frames: number,
    fps: number,
    quality: string,
    start = 0,
  ) {
    if (start < 0 || start + frames / fps > clip.duration + 1 / 60)
      throw Error(
        "El clip no cubre la duración del plano. Recórtalo o reduce su duración.",
      );
    const q = renderQuality(quality);
    await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(start),
      "-i",
      this.storage.resolve(clip.storageKey),
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      `scale=${q.width}:${q.height}:flags=lanczos,fps=${fps},setsar=1`,
      "-frames:v",
      String(frames),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      String(q.crf),
      "-pix_fmt",
      "yuv420p",
      "-video_track_timescale",
      "90000",
      "-movflags",
      "+faststart",
      output,
    ]);
  }
}
