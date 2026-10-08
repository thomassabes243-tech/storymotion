import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
export type SpeechCue = { text: string; duration: number };
export interface SpeechProvider {
  readonly version: string;
  synthesize(request: {
    texts: string[];
    rate: number;
    output: string;
    onProgress?: (progress: number) => void;
  }): Promise<SpeechCue[]>;
}
export function speechAvailable() {
  const model = process.env.STORYMOTION_VOICE_MODEL;
  return (
    !!model &&
    existsSync(model) &&
    existsSync(model + ".json") &&
    !!process.env.STORYMOTION_VOICE_PYTHON
  );
}
export class PiperSpeechProvider implements SpeechProvider {
  readonly version = "piper-1.4.1-ald-019b3803-v1";
  async synthesize(request: Parameters<SpeechProvider["synthesize"]>[0]) {
    if (!speechAvailable())
      throw new Error(
        "La voz automática no está instalada en este servidor. Configura el motor de voz o elige exportar sin audio.",
      );
    return new Promise<SpeechCue[]>((resolve, reject) => {
      const child = spawn(
        process.env.STORYMOTION_VOICE_PYTHON!,
        [
          path.resolve("scripts/synthesize.py"),
          process.env.STORYMOTION_VOICE_MODEL!,
          request.output,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let buffer = "",
        error = "",
        cues: SpeechCue[] | undefined;
      const timeout = setTimeout(() => child.kill("SIGKILL"), 20 * 60 * 1000);
      child.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (typeof parsed.progress === "number")
              request.onProgress?.(parsed.progress);
            if (Array.isArray(parsed.cues)) cues = parsed.cues;
          } catch {
            error = "Respuesta inválida del motor de voz";
          }
        }
      });
      child.stderr.on("data", (data) => {
        error = (error + data.toString()).slice(-3000);
      });
      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (
          code === 0 &&
          cues?.length === request.texts.length &&
          cues.every((c) => Number.isFinite(c.duration) && c.duration > 0)
        )
          resolve(cues);
        else
          reject(
            new Error(
              `No se pudo generar la narración: ${error || "el proceso de voz se interrumpió"}`,
            ),
          );
      });
      child.stdin.on("error", () => {});
      child.stdin.end(
        JSON.stringify({ texts: request.texts, rate: request.rate }),
      );
    });
  }
}
