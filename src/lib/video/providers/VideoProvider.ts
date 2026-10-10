export type VideoGenerationRequest = {
  idempotencyKey: string;
  prompt: string;
  negativePrompt: string;
  firstFramePath: string;
  lastFramePath?: string;
  characterReferences: string[];
  duration: number;
  fps: 24 | 30;
  seed: number;
  outputPath: string;
};
export type GeneratedVideo = {
  path: string;
  provider: string;
  motionKind: "generated_video";
};
export interface VideoProvider {
  readonly id: string;
  readonly billing: "local" | "paid";
  generate(request: VideoGenerationRequest): Promise<GeneratedVideo>;
}
