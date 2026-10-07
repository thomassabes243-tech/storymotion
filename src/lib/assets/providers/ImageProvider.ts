export type ImageGenerationRequest = {
  prompt: string;
  negativePrompt: string;
  transparent: boolean;
  width: number;
  height: number;
  referenceAssets?: { mime: string; base64: string }[];
};
export type GeneratedAsset = {
  bytes: Uint8Array;
  mime: string;
  provider: string;
};
export interface ImageProvider {
  generate(request: ImageGenerationRequest): Promise<GeneratedAsset>;
}
// The gateway contract isolates all provider-specific response/authentication logic.
export class HttpImageProvider implements ImageProvider {
  constructor(
    private endpoint: string,
    private apiKey?: string,
  ) {}
  async generate(request: ImageGenerationRequest) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error(`Proveedor de imágenes: HTTP ${response.status}`);
    const data = (await response.json()) as { base64: string; mime: string };
    if (!data.base64 || !/^image\/(png|jpeg|webp)$/.test(data.mime))
      throw new Error("Respuesta de imagen inválida");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error("La imagen generada supera 20 MB");
    return { bytes, mime: data.mime, provider: "http" };
  }
}
