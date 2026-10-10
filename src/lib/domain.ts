import { z } from "zod";

export const cameraMovements = [
  "static",
  "slow_zoom_in",
  "slow_zoom_out",
  "pan_left",
  "pan_right",
  "pan_up",
  "pan_down",
  "push_in",
  "pull_out",
  "follow_subject",
  "camera_shake",
  "dramatic_zoom",
  "reveal",
] as const;
export const transitions = [
  "hard_cut",
  "fade",
  "crossfade",
  "camera_continuation",
  "match_pan",
  "foreground_wipe",
  "light_flash",
  "blur",
  "zoom",
] as const;
export const jobStates = [
  "DRAFT",
  "PLANNING",
  "ASSETS_PENDING",
  "ASSETS_READY",
  "RENDER_QUEUED",
  "RENDERING",
  "COMPLETE",
  "FAILED",
  "CANCELED",
] as const;
export const CameraSchema = z.object({
  shot: z.enum(["wide", "medium", "close", "detail"]),
  movement: z.enum(cameraMovements),
  direction: z.enum(["left_to_right", "right_to_left", "center"]),
  intensity: z.number().min(0).max(2),
  angle: z.enum(["frontal", "lateral", "over_shoulder"]).optional(),
});
export type Camera = z.infer<typeof CameraSchema>;
export const KeyframeSchema = z.object({
  frame: z.number().int().min(0),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().min(0.01).optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
});
export const LayerSchema = z.object({
  id: z.string(),
  assetId: z.string().optional(),
  kind: z.enum([
    "background",
    "environment",
    "character",
    "object",
    "foreground",
    "particles",
  ]),
  characterId: z.string().optional(),
  x: z.number(),
  y: z.number(),
  scale: z.number().min(0.01),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  depth: z.number().min(0).max(1),
  blur: z.number().min(0).max(50),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(1),
  keyframes: z.array(KeyframeSchema),
  poses: z
    .array(z.object({ frame: z.number().int().min(0), assetId: z.string() }))
    .default([]),
});
export type Layer = z.infer<typeof LayerSchema>;
export const SceneSchema = z.object({
  sceneId: z.string(),
  start: z.number().min(0),
  duration: z.number().positive(),
  durationFrames: z.number().int().positive(),
  sourceText: z.string(),
  description: z.string().min(1),
  location: z.string(),
  characters: z.array(z.string()),
  action: z.string(),
  emotion: z.string(),
  timeOfDay: z.string(),
  camera: CameraSchema,
  layers: z.array(LayerSchema),
  animation: z.array(z.string()),
  transitionOut: z.enum(transitions),
  status: z.enum(["READY", "GENERATING", "FAILED", "NEEDS_REVIEW"]),
  error: z.string().optional(),
  intentionalStill: z.boolean().default(false),
  continuityNotes: z.array(z.string()).default([]),
  clipAssetId: z.string().optional(),
  clipStart: z.number().min(0).default(0),
  illustration: z
    .object({
      profile: z.literal("biblical_cutout"),
      framing: z.enum([
        "wide",
        "pair",
        "face",
        "hands",
        "coins",
        "shadows",
        "kiss",
        "arrest",
      ]),
      setting: z.enum(["supper", "chamber", "street", "garden"]),
      focusId: z.string().optional(),
      variant: z.number().int().min(0),
      poses: z.record(z.string(), z.string()),
    })
    .optional(),
  environment: z
    .object({
      weather: z.enum(["clear", "rain"]),
      lighting: z.string(),
      objects: z.array(z.string()),
    })
    .optional(),
  narrativeState: z
    .object({
      initial: z.string(),
      final: z.string(),
      actorIds: z.array(z.string()),
      nextSceneId: z.string().optional(),
    })
    .optional(),
  visualPlan: z
    .object({
      previousSceneId: z.string().optional(),
      identityHashes: z.record(z.string(), z.string()),
      referenceAssetIds: z.array(z.string()),
      motionMode: z.enum(["cutout", "video"]),
      firstFrameKey: z.string().optional(),
      lastFrameKey: z.string().optional(),
      previousLastFrameKey: z.string().optional(),
      entry: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
      exit: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    })
    .optional(),
});
export type Scene = z.infer<typeof SceneSchema>;
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["main", "secondary", "group"]),
  description: z.string(),
  appearance: z.object({
    age: z.number().optional(),
    hair: z.string(),
    clothing: z.string(),
    accessories: z.array(z.string()),
    weapons: z.array(z.string()),
    colors: z.array(z.string()),
    face: z.string(),
    artStyle: z.string(),
  }),
  poses: z.array(z.string()),
  referenceAssetIds: z.array(z.string()).default([]),
});
export type Character = z.infer<typeof CharacterSchema>;
export const AnalysisSchema = z.object({
  title: z.string(),
  genre: z.string(),
  era: z.string(),
  visualStyle: z.string(),
  characters: z.array(CharacterSchema),
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      referenceAssetIds: z.array(z.string()).default([]),
    }),
  ),
  objects: z.array(z.string()),
  relationships: z.array(
    z.object({ from: z.string(), to: z.string(), relationship: z.string() }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      sourceText: z.string(),
      action: z.string(),
      subjects: z.array(z.string()),
      visibleCharacters: z.array(z.string()).default([]),
      location: z.string(),
      emotion: z.string(),
      timeOfDay: z.string(),
      visualImportance: z.number().min(1).max(3),
      temporalChange: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
  analyzer: z.enum(["local", "provider"]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export const SettingsSchema = z
  .object({
    wordsPerMinute: z.number().min(50).max(400),
    fast: z.tuple([z.number().min(0.5), z.number().max(30)]),
    normal: z.tuple([z.number().min(0.5), z.number().max(30)]),
    contemplative: z.tuple([z.number().min(0.5), z.number().max(30)]),
  })
  .refine(
    (v) => [v.fast, v.normal, v.contemplative].every((r) => r[0] <= r[1]),
    "El mínimo no puede superar el máximo",
  );
export const defaultSettings: z.infer<typeof SettingsSchema> = {
  wordsPerMinute: 150,
  fast: [2, 3],
  normal: [3, 6],
  contemplative: [5, 8],
};
export const ConfigSchema = z.object({
  style: z.enum(["historical_parchment"]),
  durationMode: z.enum(["auto", "target"]),
  targetDuration: z.number().min(2).max(600),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  width: z.literal(1080),
  height: z.literal(1920),
  settings: SettingsSchema,
  quality: z.enum(["fast", "balanced", "cinematic"]).default("balanced"),
  motionMode: z.enum(["cutout", "generative"]).default("cutout"),
  fixedTitle: z.string().max(180).optional(),
  motionBlur: z.enum(["off", "subtle"]).default("off"),
});
export type Config = z.infer<typeof ConfigSchema>;
export const defaultConfig: Config = {
  style: "historical_parchment",
  durationMode: "auto",
  targetDuration: 60,
  fps: 30,
  width: 1080,
  height: 1920,
  settings: defaultSettings,
  quality: "balanced",
  motionMode: "cutout",
  motionBlur: "off",
};
export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum([
    "background",
    "environment",
    "character",
    "object",
    "foreground",
    "particles",
  ]),
  mime: z.string(),
  storageKey: z.string(),
  source: z.enum(["local", "upload", "generated", "placeholder"]),
  characterId: z.string().optional(),
  locationId: z.string().optional(),
  pose: z.string().optional(),
  prompt: z.string().optional(),
  fingerprint: z.string().optional(),
  width: z.number(),
  height: z.number(),
});
export type Asset = z.infer<typeof AssetSchema>;
export const speechVoices = ["es_MX-ald-medium", "es_MX-claude-high"] as const;
export const AudioConfigSchema = z.object({
  mode: z.enum(["off", "automatic", "imported"]).default("off"),
  voice: z.enum(speechVoices).default("es_MX-ald-medium"),
  delivery: z.enum(["neutral", "narrator"]).default("neutral"),
  rate: z.number().min(0.8).max(1.3).default(1),
  musicAssetId: z.string().optional(),
  musicVolume: z.number().min(0).max(0.35).default(0.12),
  importedAssetId: z.string().optional(),
  offset: z.number().min(0).max(600).default(0),
});
export type AudioConfig = z.infer<typeof AudioConfigSchema>;
export const defaultAudio: AudioConfig = AudioConfigSchema.parse({});
export const narratorAudio: AudioConfig = {
  ...defaultAudio,
  mode: "automatic",
  voice: "es_MX-claude-high",
  delivery: "narrator",
};
export const AudioAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  storageKey: z.string(),
  mime: z.literal("audio/mp4"),
  duration: z.number().positive(),
  source: z.enum(["narration", "music", "imported"]),
  fingerprint: z.string(),
  cues: z
    .array(z.object({ text: z.string(), duration: z.number().positive() }))
    .default([]),
  qualityReport: z
    .object({
      integratedLufs: z.number(),
      truePeakDb: z.number(),
      processing: z.array(z.string()),
      warnings: z.array(z.string()),
    })
    .optional(),
  originalKey: z.string().optional(),
  originalMime: z.string().optional(),
  originalName: z.string().optional(),
});
export type AudioAsset = z.infer<typeof AudioAssetSchema>;
export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  revision: z.number().int().min(0),
  name: z.string().min(1).max(120),
  story: z.string().max(50000),
  createdAt: z.string(),
  updatedAt: z.string(),
  config: ConfigSchema,
  analysis: AnalysisSchema.optional(),
  scenes: z.array(SceneSchema),
  assets: z.array(AssetSchema),
  audio: AudioConfigSchema.default(defaultAudio),
  warnings: z.array(z.string()),
  state: z.enum(jobStates),
});
export type Project = z.infer<typeof ProjectSchema>;
export type RenderJob = {
  id: string;
  projectId: string;
  state: (typeof jobStates)[number];
  progress: number;
  currentScene: number;
  sceneCount: number;
  error?: string;
  outputKey?: string;
  createdAt: string;
  updatedAt: string;
  ownerPid?: number;
  ownerStartedAt?: string;
  attempts: number;
  snapshot: Project;
  probe?: VideoProbe;
  phase?: "NARRATION" | "VISUALS" | "MIXING" | "VALIDATING";
  narrationAssetId?: string;
  renderedPlan?: Project;
  requestKey?: string;
};
export type VideoProbe = {
  width: number;
  height: number;
  codec: string;
  fps: number;
  duration: number;
  audioStreams: number;
  audioCodec?: string;
};
export type RenderProps = {
  project: Project;
  assetSources: Record<string, string>;
};
export const totalFrames = (scenes: Scene[]) =>
  scenes.reduce((n, s) => n + s.durationFrames, 0);
export function reflow(scenes: Scene[], fps: number): Scene[] {
  let frame = 0;
  return scenes.map((scene) => {
    const durationFrames = Math.max(1, Math.round(scene.duration * fps)),
      ratio = (durationFrames - 1) / Math.max(1, scene.durationFrames - 1);
    const result = {
      ...scene,
      start: frame / fps,
      duration: durationFrames / fps,
      durationFrames,
      layers: scene.layers.map((l) => ({
        ...l,
        startFrame: Math.min(
          durationFrames - 1,
          Math.round(l.startFrame * ratio),
        ),
        endFrame: durationFrames,
        keyframes: l.keyframes.map((k) => ({
          ...k,
          frame: Math.round(k.frame * ratio),
        })),
        poses: l.poses.map((p) => ({
          ...p,
          frame: Math.round(p.frame * ratio),
        })),
      })),
    };
    frame += durationFrames;
    return result;
  });
}
