import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AudioAssetSchema } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { runProcess } from "../render/FFmpegService";
type Loudness = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};
export function parseLoudness(log: string): Loudness {
  const json = log.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (!json) throw Error("No se pudo medir la sonoridad del audio.");
  const result = JSON.parse(json) as Loudness;
  if (
    ![
      "input_i",
      "input_tp",
      "input_lra",
      "input_thresh",
      "target_offset",
    ].every((k) => Number.isFinite(Number(result[k as keyof Loudness])))
  )
    throw Error("El audio no contiene señal audible suficiente.");
  return result;
}
export class ImportedAudio {
  constructor(
    private repo: SQLiteRepository,
    private storage = new FileSystemStorage(),
  ) {}
  async import(
    bytes: Uint8Array,
    name: string,
    denoise = true,
    processing: "clean" | "preserve" = "preserve",
  ) {
    if (!bytes.length || bytes.length > 50 * 1024 * 1024)
      throw Error("Selecciona un audio de hasta 50 MB.");
    const fingerprint = createHash("sha256")
        .update(bytes)
        .update(`voice-import-v2:${denoise}:${processing}`)
        .digest("hex"),
      cached = this.repo.findAudio(fingerprint);
    if (cached && (await this.storage.exists(cached.storageKey))) return cached;
    const id = randomUUID(),
      key = `audio/${id}.m4a`,
      output = this.storage.resolve(key),
      input = output + ".input";
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(input, bytes);
    try {
      const info = JSON.parse(
        await runProcess(
          process.env.FFPROBE_PATH || "ffprobe",
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            input,
          ],
          { timeoutMs: 30000 },
        ),
      );
      const duration = Number(info.format.duration);
      if (
        !info.streams.some(
          (s: { codec_type: string }) => s.codec_type === "audio",
        ) ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 600
      )
        throw Error("El audio debe durar como máximo diez minutos.");
      const originalKey = `audio/${id}.original`;
      const originalMime = info.streams.some(
        (s: { codec_name: string }) => s.codec_name === "mp3",
      )
        ? "audio/mpeg"
        : info.streams.some(
              (s: { codec_name: string }) => s.codec_name === "aac",
            )
          ? "audio/mp4"
          : "application/octet-stream";
      const base = [
        "-y",
        "-v",
        "info",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-vn",
      ];
      const prefix = `highpass=f=70,lowpass=f=12000,${denoise ? "afftdn=nf=-25:tn=1," : ""}acompressor=threshold=0.125:ratio=2.5:attack=20:release=150,`;
      if (processing === "preserve") {
        const aac =
          info.streams.find(
            (s: { codec_type: string }) => s.codec_type === "audio",
          )?.codec_name === "aac";
        await runProcess(
          process.env.FFMPEG_PATH || "ffmpeg",
          [
            ...base,
            "-c:a",
            aac ? "copy" : "aac",
            ...(!aac ? ["-b:a", "192k", "-ar", "48000"] : []),
            "-movflags",
            "+faststart",
            output + ".partial.m4a",
          ],
          { timeoutMs: 180000 },
        );
        await fs.rename(output + ".partial.m4a", output);
        await this.storage.put(originalKey, bytes);
        return this.repo.putAudio(
          AudioAssetSchema.parse({
            id,
            name: name.slice(0, 120),
            storageKey: key,
            mime: "audio/mp4",
            duration,
            source: "imported",
            fingerprint,
            cues: [],
            originalKey,
            originalMime,
            originalName: name.slice(0, 120),
          }),
        );
      }
      const first = parseLoudness(
        await runProcess(
          process.env.FFMPEG_PATH || "ffmpeg",
          [
            ...base,
            "-af",
            prefix + "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
          ],
          { captureStderr: true, timeoutMs: 180000 },
        ),
      );
      const filter =
        prefix +
        `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${Number(first.input_i)}:measured_TP=${Number(first.input_tp)}:measured_LRA=${Number(first.input_lra)}:measured_thresh=${Number(first.input_thresh)}:offset=${Number(first.target_offset)}:linear=true`;
      await runProcess(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          ...base,
          "-af",
          filter,
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          output + ".partial.m4a",
        ],
        { timeoutMs: 180000 },
      );
      const measured = parseLoudness(
        await runProcess(
          process.env.FFMPEG_PATH || "ffmpeg",
          [
            "-v",
            "info",
            "-i",
            output + ".partial.m4a",
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
          ],
          { captureStderr: true, timeoutMs: 180000 },
        ),
      );
      await fs.rename(output + ".partial.m4a", output);
      await this.storage.put(originalKey, bytes);
      return this.repo.putAudio(
        AudioAssetSchema.parse({
          id,
          name: name.slice(0, 120),
          storageKey: key,
          mime: "audio/mp4",
          duration,
          source: "imported",
          fingerprint,
          cues: [],
          originalKey,
          originalMime,
          originalName: name.slice(0, 120),
          qualityReport: {
            integratedLufs: Number(measured.input_i),
            truePeakDb: Number(measured.input_tp),
            processing: [
              "voice_eq",
              ...(denoise ? ["spectral_denoise"] : []),
              "compression",
              "two_pass_loudness",
              "aac_192k_48khz",
            ],
            warnings: [
              "La limpieza no reconstruye una señal ya saturada.",
              ...(Math.abs(Number(measured.input_i) + 16) > 2
                ? ["Sonoridad fuera de ±2 LU del objetivo; revisar."]
                : []),
              ...(Number(measured.input_tp) > -0.5
                ? ["Pico cercano a saturación: revisar mezcla."]
                : []),
            ],
          },
        }),
      );
    } finally {
      await fs.rm(input, { force: true });
      await fs.rm(output + ".partial.m4a", { force: true });
    }
  }
}
