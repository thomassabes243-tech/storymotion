import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { AudioAssetSchema, type Project, type AudioAsset } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import { FileSystemStorage } from "../storage/StorageProvider";
import { runProcess } from "../render/FFmpegService";
import { narrationGroups } from "./AudioTiming";
import {
  PiperSpeechProvider,
  type SpeechProvider,
} from "./providers/SpeechProvider";
export class AudioManager {
  constructor(
    private repo: SQLiteRepository,
    private storage = new FileSystemStorage(),
    private provider: SpeechProvider = new PiperSpeechProvider(),
  ) {}
  async narration(
    project: Project,
    onProgress?: (n: number) => void,
  ): Promise<AudioAsset> {
    const texts = narrationGroups(project).map((g) => g.text);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          texts,
          rate: project.audio.rate,
          voice: project.audio.voice,
          delivery: project.audio.delivery,
          provider: this.provider.version,
        }),
      )
      .digest("hex");
    const cached = this.repo.findAudio(fingerprint);
    if (cached && (await this.storage.exists(cached.storageKey))) return cached;
    const id = randomUUID(),
      storageKey = `audio/${id}.m4a`;
    const output = this.storage.resolve(storageKey),
      wav = output + ".wav";
    await fs.mkdir(this.storage.resolve("audio"), { recursive: true });
    try {
      const cues = await this.provider.synthesize({
        texts,
        rate: project.audio.rate,
        voice: project.audio.voice,
        delivery: project.audio.delivery,
        output: wav,
        onProgress,
      });
      await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
        "-y",
        "-v",
        "error",
        "-i",
        wav,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        output + ".partial.m4a",
      ]);
      await fs.rename(output + ".partial.m4a", output);
      return this.repo.putAudio(
        AudioAssetSchema.parse({
          id,
          name: "Narración en español",
          storageKey,
          mime: "audio/mp4",
          source: "narration",
          fingerprint,
          duration: cues.reduce((a, c) => a + c.duration, 0),
          cues,
        }),
      );
    } finally {
      await fs.rm(wav, { force: true });
      await fs.rm(output + ".partial.m4a", { force: true });
    }
  }
  async importMusic(data: Uint8Array, name: string) {
    if (!data.length || data.length > 50 * 1024 * 1024)
      throw new Error("La música debe ocupar como máximo 50 MB");
    const fingerprint = createHash("sha256").update(data).digest("hex"),
      cached = this.repo.findAudio(fingerprint);
    if (cached && (await this.storage.exists(cached.storageKey))) return cached;
    const id = randomUUID(),
      key = `audio/${id}.m4a`,
      output = this.storage.resolve(key),
      input = output + ".input";
    await fs.mkdir(this.storage.resolve("audio"), { recursive: true });
    await fs.writeFile(input, data);
    try {
      const probe = JSON.parse(
        await runProcess(process.env.FFPROBE_PATH || "ffprobe", [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          input,
        ]),
      );
      const duration = Number(probe.format.duration);
      if (
        !probe.streams.some(
          (s: { codec_type: string }) => s.codec_type === "audio",
        ) ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 600
      )
        throw new Error("Selecciona un audio válido de hasta diez minutos");
      await runProcess(process.env.FFMPEG_PATH || "ffmpeg", [
        "-y",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-vn",
        "-af",
        "loudnorm=I=-20:TP=-2:LRA=11",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        output + ".partial.m4a",
      ]);
      await fs.rename(output + ".partial.m4a", output);
      return this.repo.putAudio(
        AudioAssetSchema.parse({
          id,
          name: name.slice(0, 120),
          storageKey: key,
          mime: "audio/mp4",
          duration,
          source: "music",
          fingerprint,
        }),
      );
    } finally {
      await fs.rm(input, { force: true });
      await fs.rm(output + ".partial.m4a", { force: true });
    }
  }
  async mux(
    video: string,
    narration: AudioAsset,
    output: string,
    duration: number,
    music?: AudioAsset,
    musicVolume = 0.12,
    offset = 0,
  ) {
    const args = [
      "-y",
      "-v",
      "error",
      "-i",
      video,
      "-i",
      this.storage.resolve(narration.storageKey),
    ];
    if (music && musicVolume > 0)
      args.push(
        "-stream_loop",
        "-1",
        "-i",
        this.storage.resolve(music.storageKey),
        "-filter_complex",
        `[1:a]adelay=${Math.round(offset * 1000)}:all=1,apad,asplit=2[voice][side];[2:a]volume=${musicVolume}[music];[music][side]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=350[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[audio]`,
      );
    else
      args.push(
        "-filter_complex",
        `[1:a]adelay=${Math.round(offset * 1000)}:all=1,apad[audio]`,
      );
    args.push(
      "-map",
      "0:v:0",
      "-map",
      "[audio]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      String(duration),
      "-movflags",
      "+faststart",
      output,
    );
    await runProcess(process.env.FFMPEG_PATH || "ffmpeg", args);
  }
}
