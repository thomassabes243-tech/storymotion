import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AssetManager } from "../src/lib/assets/AssetManager";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { biblicalBackdrop } from "../src/lib/illustration/BiblicalIllustrationFactory";
async function main() {
  const root = process.env.STORYMOTION_DATA_DIR!;
  const repo = new SQLiteRepository(root),
    storage = new FileSystemStorage(root);
  try {
    const state = JSON.parse(
      await fs.readFile(path.join(root, "e2e-run.json"), "utf8"),
    );
    const p = repo.get(state.projectId)!;
    const scene = p.scenes.find((s) => s.illustration?.setting === "street")!;
    const manager = new AssetManager(repo, storage);
    for (const [i, layer] of scene.layers.filter((l) => l.assetId).entries()) {
      const asset = await manager.import(
        await sharp(
          Buffer.from(
            biblicalBackdrop("street", scene.illustration!.variant, i),
          ),
        )
          .png()
          .toBuffer(),
        `Salida de Judas · arquitectura nocturna · capa ${i}`,
        layer.kind,
        "local",
        { locationId: "street" },
      );
      p.assets.push(asset);
      layer.assetId = asset.id;
    }
    repo.save(p, p.revision);
    console.log(
      "Corregido únicamente el fondo de la salida de Judas; otras tomas preservadas.",
    );
  } finally {
    repo.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
