import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { FFmpegService } from "../../render/FFmpegService";
import type { VideoProvider, VideoGenerationRequest } from "./VideoProvider";
// Operator-installed executable. No shell, downloaded code, or user-controlled command.
// This adapter is not itself an installed video generation model.
export class LocalCommandVideoProvider implements VideoProvider {
  readonly id = "local-command";
  readonly billing = "local" as const;
  constructor(
    private executable: string,
    private args: string[] = [],
  ) {
    if (!path.isAbsolute(executable) || !existsSync(executable))
      throw Error("Necesitas un ejecutable local instalado y su modelo.");
  }
  async generate(request: VideoGenerationRequest) {
    if (
      !/^[a-f0-9]{64}$/.test(request.idempotencyKey) ||
      !path.isAbsolute(request.outputPath) ||
      request.duration <= 0 ||
      request.duration > 30
    )
      throw Error("Solicitud de video no válida.");
    const manifestPath = `${request.outputPath}.request.json`;
    const signature = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    const validate = async () => {
      new FFmpegService().validate(
        await new FFmpegService().probe(request.outputPath),
        {
          width: 1080,
          height: 1920,
          fps: request.fps,
          duration: request.duration,
        },
      );
    };
    if (existsSync(request.outputPath)) {
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8").catch(() => "{}"),
      );
      if (
        manifest.signature !== signature ||
        manifest.idempotencyKey !== request.idempotencyKey
      )
        throw Error(
          "La salida existente no pertenece a esta solicitud. No se ejecutará de nuevo el motor sin revisar el resultado anterior.",
        );
      await validate();
      return {
        path: request.outputPath,
        provider: this.id,
        motionKind: "generated_video" as const,
      };
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.executable, this.args, {
        stdio: ["pipe", "ignore", "pipe"],
      });
      let error = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("El motor local agotó 20 minutos."));
      }, 1200000);
      child.stderr.on("data", (b) => {
        error = (error + b.toString()).slice(-2000);
      });
      child.stdin.on("error", () => {});
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(Error(`Motor local falló (${code}): ${error}`));
      });
      child.stdin.end(JSON.stringify(request));
    });
    await validate();
    await fs.writeFile(
      `${manifestPath}.partial`,
      JSON.stringify({ signature, idempotencyKey: request.idempotencyKey }),
    );
    await fs.rename(`${manifestPath}.partial`, manifestPath);
    return {
      path: request.outputPath,
      provider: this.id,
      motionKind: "generated_video" as const,
    };
  }
}
