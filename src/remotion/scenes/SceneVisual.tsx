import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { Layer, Scene } from "../../lib/domain";
import { cameraMotion, smooth } from "../../lib/animation/CameraMotion";
import { parallax } from "../../lib/animation/Parallax";
import { sampleLayer } from "../../lib/animation/AnimationEngine";
function Cutout({
  layer,
  frame,
  sources,
}: {
  layer: Layer;
  frame: number;
  sources: Record<string, string>;
}) {
  const poses = layer.poses
      .filter((p) => p.frame <= frame)
      .sort((a, b) => a.frame - b.frame),
    active = poses.at(-1),
    before = poses.at(-2);
  const src = active?.assetId || layer.assetId;
  const opacity = active && before ? smooth((frame - active.frame) / 8) : 1;
  return (
    <>
      {before && opacity < 1 && sources[before.assetId] && (
        <Img
          src={sources[before.assetId]}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 1 - opacity,
          }}
        />
      )}
      {src && sources[src] && (
        <Img
          src={sources[src]}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity }}
        />
      )}
    </>
  );
}
export function SceneVisual({
  scene,
  frame,
  sources,
}: {
  scene: Scene;
  frame: number;
  sources: Record<string, string>;
}) {
  const camera = cameraMotion(frame, scene.durationFrames, scene.camera);
  return (
    <AbsoluteFill style={{ background: "#d7c097", overflow: "hidden" }}>
      {scene.layers.map((layer) => {
        if (frame < layer.startFrame || frame >= layer.endFrame + 14)
          return null;
        const values = sampleLayer(layer, frame),
          p = parallax(camera, layer.depth);
        return (
          <AbsoluteFill
            key={layer.id}
            style={{
              transform: `translate(${values.x + p.x}px,${values.y + p.y}px) scale(${values.scale * p.scale}) rotate(${values.rotation + p.rotation}deg)`,
              opacity: values.opacity,
              filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
            }}
          >
            {layer.kind === "particles" ? (
              <Particles frame={frame} />
            ) : (
              <Cutout layer={layer} frame={frame} sources={sources} />
            )}
          </AbsoluteFill>
        );
      })}
      {scene.action === "arrow_rain" && <ArrowRain frame={frame} />}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "repeating-linear-gradient(87deg,transparent 0px,rgba(65,44,22,.018) 1px,transparent 3px)",
          boxShadow: "inset 0 0 180px rgba(41,32,24,.27)",
          mixBlendMode: "multiply",
        }}
      />
    </AbsoluteFill>
  );
}
function Particles({ frame }: { frame: number }) {
  return (
    <AbsoluteFill>
      {Array.from({ length: 28 }, (_, i) => {
        const x = ((i * 177 + frame * (0.35 + (i % 4) * 0.2)) % 1200) - 60,
          y = (((i * 313 - frame * 0.18) % 2000) + 2000) % 2000;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 3 + (i % 5),
              height: 3 + (i % 5),
              borderRadius: "50%",
              background: "#f9e4b5",
              opacity: 0.3 + Math.sin(frame * 0.02 + i) * 0.15,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}
function ArrowRain({ frame }: { frame: number }) {
  return (
    <AbsoluteFill>
      {Array.from({ length: 24 }, (_, i) => {
        const y = ((frame * 22 + i * 111) % 2400) - 300,
          x = ((i * 67) % 1200) - 130 + y * 0.22;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 120,
              height: 3,
              background: "#3c342b",
              transform: "rotate(67deg)",
              boxShadow: "-24px -6px 0 -1px #6b5540",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}
