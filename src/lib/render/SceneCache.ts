import { createHash } from "node:crypto";
import type { Project } from "../domain";
export function sceneCacheKey(
  project: Project,
  index: number,
  assetHashes: Record<string, string>,
  rendererSignature: string,
) {
  const scene = project.scenes[index],
    previous = project.scenes[index - 1];
  const used = new Set(
    [scene, previous]
      .filter(Boolean)
      .flatMap((s) =>
        s.layers
          .flatMap((l) => [l.assetId, ...l.poses.map((p) => p.assetId)])
          .filter(Boolean),
      ),
  );
  return createHash("sha256")
    .update(
      JSON.stringify({
        rendererSignature,
        clips: [scene, previous]
          .filter(Boolean)
          .filter((s) => s.clipAssetId)
          .map((s) => [s.clipAssetId, assetHashes[s.clipAssetId!]]),
        scene: { ...scene, start: 0 },
        previous: previous ? { ...previous, start: 0 } : undefined,
        config: project.config,
        assets: project.assets
          .filter((a) => used.has(a.id))
          .map((a) => [a.id, assetHashes[a.id]]),
        last: index === project.scenes.length - 1,
      }),
    )
    .digest("hex");
}
