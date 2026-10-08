import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { z } from "zod";
import { FileSystemStorage } from "../storage/StorageProvider";
import { FFmpegService } from "../render/FFmpegService";
import type { VideoProbe } from "../domain";

export const deliveryChunkSize = 8 * 1024 * 1024;
export const DeliveryRequestSchema = z.object({
  title: z.string().min(1).max(120),
  filename: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+\.mp4$/)
    .max(160),
  bytes: z
    .number()
    .int()
    .positive()
    .max(300 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  duration: z.number().positive().max(7200),
  audioStreams: z.union([z.literal(0), z.literal(1)]),
});
const MetadataSchema = DeliveryRequestSchema.extend({
  id: z.string().uuid(),
  state: z.enum(["UPLOADING", "READY"]),
  createdAt: z.string(),
});
export type VideoDelivery = z.infer<typeof MetadataSchema> & {
  probe?: VideoProbe;
};

/** Durable, owner-protected delivery of finished videos without rerendering them. */
export class VideoDeliveryManager {
  constructor(
    private storage = new FileSystemStorage(),
    private ffmpeg = new FFmpegService(),
  ) {}
  private prefix(id: string) {
    return `deliveries/${z.string().uuid().parse(id)}`;
  }
  videoKey(id: string) {
    return `${this.prefix(id)}/video.mp4`;
  }
  async get(id: string): Promise<VideoDelivery> {
    const data = JSON.parse(
      Buffer.from(
        await this.storage.get(`${this.prefix(id)}/metadata.json`),
      ).toString(),
    );
    return { ...MetadataSchema.parse(data), probe: data.probe };
  }
  private async save(delivery: VideoDelivery) {
    await this.storage.put(
      `${this.prefix(delivery.id)}/metadata.json`,
      Buffer.from(JSON.stringify(delivery)),
    );
  }
  async begin(input: z.infer<typeof DeliveryRequestSchema>) {
    const request = DeliveryRequestSchema.parse(input);
    await fs.mkdir(this.storage.resolve("deliveries"), { recursive: true });
    const disk = await fs.statfs(this.storage.resolve("deliveries"));
    if (disk.bavail * disk.bsize < request.bytes * 2 + 32 * 1024 * 1024)
      throw new Error("No hay espacio suficiente para guardar este video");
    const delivery: VideoDelivery = {
      ...request,
      id: randomUUID(),
      state: "UPLOADING",
      createdAt: new Date().toISOString(),
    };
    await this.save(delivery);
    return delivery;
  }
  async missingParts(delivery: VideoDelivery) {
    if (delivery.state === "READY") return [];
    const indices = Array.from(
      { length: Math.ceil(delivery.bytes / deliveryChunkSize) },
      (_, i) => i,
    );
    const present = await Promise.all(
      indices.map((i) =>
        this.storage.exists(`${this.prefix(delivery.id)}/part-${i}`),
      ),
    );
    return indices.filter((_, i) => !present[i]);
  }
  async putPart(id: string, index: number, data: Uint8Array) {
    const delivery = await this.get(id);
    if (delivery.state === "READY")
      throw new Error("El video ya está preparado");
    const parts = Math.ceil(delivery.bytes / deliveryChunkSize);
    if (!Number.isInteger(index) || index < 0 || index >= parts)
      throw new Error("Parte de video inválida");
    const expected = Math.min(
      deliveryChunkSize,
      delivery.bytes - index * deliveryChunkSize,
    );
    if (data.byteLength !== expected)
      throw new Error("La parte de video está incompleta");
    await this.storage.put(`${this.prefix(id)}/part-${index}`, data);
  }
  async complete(id: string) {
    const delivery = await this.get(id);
    if (delivery.state === "READY") return delivery;
    const prefix = this.prefix(id);
    const temporary = this.storage.resolve(
      `${prefix}/${randomUUID()}.partial.mp4`,
    );
    const output = await fs.open(temporary, "wx");
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for (let i = 0; i < Math.ceil(delivery.bytes / deliveryChunkSize); i++) {
        for await (const chunk of createReadStream(
          this.storage.resolve(`${prefix}/part-${i}`),
        )) {
          const data = chunk as Buffer;
          hash.update(data);
          bytes += data.length;
          let offset = 0;
          while (offset < data.length) {
            const written = await output.write(
              data,
              offset,
              data.length - offset,
            );
            if (!written.bytesWritten)
              throw new Error("No se pudo guardar el video");
            offset += written.bytesWritten;
          }
        }
      }
      await output.close();
      if (bytes !== delivery.bytes || hash.digest("hex") !== delivery.sha256)
        throw new Error(
          "El video recibido no coincide con el archivo original. Reintenta las partes.",
        );
      const probe = this.ffmpeg.validate(await this.ffmpeg.probe(temporary), {
        width: 1080,
        height: 1920,
        fps: 30,
        duration: delivery.duration,
        audioStreams: delivery.audioStreams,
      });
      await fs.rename(temporary, this.storage.resolve(this.videoKey(id)));
      const ready: VideoDelivery = { ...delivery, state: "READY", probe };
      await this.save(ready);
      await Promise.all(
        Array.from(
          { length: Math.ceil(delivery.bytes / deliveryChunkSize) },
          (_, i) =>
            fs
              .rm(this.storage.resolve(`${prefix}/part-${i}`), { force: true })
              .catch(() => {}),
        ),
      );
      return ready;
    } catch (error) {
      const current = await this.get(id);
      if (current.state === "READY") return current;
      throw error;
    } finally {
      await output.close().catch(() => {});
      await fs.rm(temporary, { force: true });
    }
  }
}
