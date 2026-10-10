import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import type { Asset, Project, Scene, Layer } from "../domain";
import { SQLiteRepository } from "../storage/ProjectRepository";
import {
  FileSystemStorage,
  type StorageProvider,
} from "../storage/StorageProvider";
import { placeholder } from "./PlaceholderFactory";
import { VisualPromptBuilder } from "./VisualPromptBuilder";
import type { ImageProvider } from "./providers/ImageProvider";
export class AssetManager {
  constructor(
    private repo: SQLiteRepository,
    private storage: StorageProvider = new FileSystemStorage(),
    private provider?: ImageProvider,
  ) {}
  async import(
    bytes: Uint8Array,
    name: string,
    kind: Asset["kind"],
    source: Asset["source"] = "upload",
    extras: Partial<Asset> = {},
  ): Promise<Asset> {
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error("Máximo 20 MB por imagen");
    const image = sharp(bytes, { limitInputPixels: 40000000 });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format || ""))
      throw new Error("Solo se permiten PNG, JPG y WebP");
    const png = await image
      .rotate()
      .resize({
        width: 2160,
        height: 3840,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const asset: Asset = {
      ...extras,
      id: randomUUID(),
      name,
      kind,
      mime: "image/png",
      storageKey: "",
      source,
      width: png.info.width,
      height: png.info.height,
    };
    asset.storageKey = `assets/${asset.id}.png`;
    await this.storage.put(asset.storageKey, png.data);
    this.repo.putAsset(asset);
    return asset;
  }
  private async fallback(
    project: Project,
    scene: Scene,
    kind: Asset["kind"],
    characterId?: string,
    pose?: string,
  ): Promise<Asset> {
    const character = project.analysis?.characters.find(
      (c) => c.id === characterId,
    );
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          version: scene.location === "calle" ? 3 : 2,
          kind,
          location: scene.location,
          time: scene.timeOfDay,
          character,
          pose,
          style: project.config.style,
        }),
      )
      .digest("hex");
    const existing = this.repo.findAsset(fingerprint);
    if (existing && (await this.storage.exists(existing.storageKey)))
      return existing;
    const svg = placeholder(
      kind,
      scene.location,
      scene.timeOfDay,
      character,
      pose,
    );
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return this.import(
      png,
      `${character?.name || scene.location} · ${pose || kind}`,
      kind,
      "placeholder",
      { characterId, locationId: scene.location, pose, fingerprint },
    );
  }
  async compose(project: Project, scene: Scene): Promise<Scene> {
    const result = structuredClone(scene);
    result.layers = [];
    const add = async (
      kind: Asset["kind"],
      depth: number,
      characterId?: string,
    ) => {
      const pose = ["draw_bow"].includes(scene.action)
        ? "drawing"
        : scene.action === "raise_bow"
          ? "raising"
          : scene.action === "fire_arrow"
            ? "firing"
            : scene.action === "reaction"
              ? "defending"
              : scene.action === "advance"
                ? "walking"
                : "standing";
      const asset = await this.fallback(
        project,
        scene,
        kind,
        characterId,
        characterId ? pose : undefined,
      );
      if (!project.assets.some((a) => a.id === asset.id))
        project.assets.push(asset);
      const layer: Layer = {
        id: randomUUID(),
        assetId: asset.id,
        kind,
        characterId,
        x:
          kind === "character" && scene.characters.length > 1
            ? (scene.characters.indexOf(characterId!) -
                (scene.characters.length - 1) / 2) *
              Math.min(300, 760 / (scene.characters.length - 1))
            : 0,
        y: 0,
        scale:
          (kind === "character" && scene.camera.shot === "close" ? 1.4 : 1) *
          (kind === "character"
            ? Math.max(0.5, 1 - (scene.characters.length - 1) * 0.1)
            : 1),
        rotation: 0,
        opacity: 1,
        depth,
        blur: 0,
        startFrame: 0,
        endFrame: scene.durationFrames,
        keyframes: [],
        poses: [],
      };
      if (kind === "character" && scene.action === "advance")
        layer.keyframes = [
          { frame: 0, x: layer.x - 80 },
          { frame: scene.durationFrames - 1, x: layer.x + 100 },
        ];
      if (kind === "character" && characterId === "mysterious_figure") {
        layer.x = 40;
        layer.y = -250;
        layer.scale = 0.4;
        layer.depth = 0.32;
      }
      if (
        kind === "character" &&
        ["raise_bow", "draw_bow", "fire_arrow"].includes(scene.action)
      ) {
        const before = await this.fallback(
          project,
          scene,
          kind,
          characterId,
          "standing",
        );
        if (!project.assets.some((a) => a.id === before.id))
          project.assets.push(before);
        layer.poses = [
          { frame: 0, assetId: before.id },
          { frame: Math.round(scene.durationFrames * 0.38), assetId: asset.id },
        ];
      }
      if (kind === "object") {
        layer.scale = 0.65;
        layer.keyframes = [
          { frame: 0, x: -620, y: -330, rotation: -15, opacity: 0 },
          {
            frame: Math.round(scene.durationFrames * 0.15),
            x: -400,
            y: -260,
            rotation: -15,
            opacity: 1,
          },
          {
            frame: scene.durationFrames - 1,
            x: 600,
            y: 50,
            rotation: 15,
            opacity: 1,
          },
        ];
      }
      result.layers.push(layer);
    };
    await add("background", 0.05);
    await add("environment", 0.25);
    for (const id of scene.characters) await add("character", 0.5, id);
    if (["fire_arrow", "arrow_flight"].includes(scene.action))
      await add("object", 0.7);
    await add("foreground", 0.85);
    result.layers.push({
      id: randomUUID(),
      kind: "particles",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 0.35,
      depth: 0.9,
      blur: 0,
      startFrame: 0,
      endFrame: scene.durationFrames,
      keyframes: [],
      poses: [],
    });
    result.status = "READY";
    result.layers.sort((a, b) => a.depth - b.depth);
    delete result.error;
    return result;
  }
  async generate(
    project: Project,
    scene: Scene,
    kind: Asset["kind"],
    characterId?: string,
  ) {
    if (!this.provider)
      throw new Error(
        "Configura un proveedor de imágenes o importa un asset. Los placeholders siguen disponibles.",
      );
    const prompt = new VisualPromptBuilder().build(
      project,
      scene,
      kind,
      characterId,
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(prompt))
      .digest("hex");
    const existing = this.repo.findAsset(fingerprint);
    if (existing && (await this.storage.exists(existing.storageKey)))
      return existing;
    const references = project.assets
      .filter((a) =>
        characterId
          ? a.characterId === characterId
          : a.locationId === scene.location,
      )
      .slice(0, 2);
    const generated = await this.provider.generate({
      ...prompt,
      width: 1080,
      height: 1920,
      referenceAssets: await Promise.all(
        references.map(async (a) => ({
          mime: a.mime,
          base64: Buffer.from(await this.storage.get(a.storageKey)).toString(
            "base64",
          ),
        })),
      ),
    });
    return this.import(
      generated.bytes,
      `Generado · ${scene.description.slice(0, 40)}`,
      kind,
      "generated",
      {
        characterId,
        locationId: scene.location,
        prompt: prompt.prompt,
        fingerprint,
      },
    );
  }
}
