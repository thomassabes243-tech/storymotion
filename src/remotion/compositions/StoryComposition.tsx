import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { SceneVisual } from "../scenes/SceneVisual";
import type { RenderProps, Scene, Project } from "../../lib/domain";
import { smooth } from "../../lib/animation/CameraMotion";
function Shot({
  scene,
  previous,
  sources,
  fps,
  last,
  project,
}: {
  project: Project;
  scene: Scene;
  previous?: Scene;
  sources: Record<string, string>;
  fps: number;
  last: boolean;
}) {
  const frame = useCurrentFrame(),
    length = Math.min(
      Math.round(fps * 0.36),
      Math.floor(scene.durationFrames / 3),
    ),
    p = length ? smooth(frame / length) : 1,
    type = previous?.transitionOut || "hard_cut";
  const transitioning = previous && frame < length && type !== "hard_cut";
  const opacity =
    transitioning &&
    (type === "crossfade" ||
      type === "fade" ||
      type === "camera_continuation" ||
      type === "match_pan")
      ? p
      : 1;
  let transform = "";
  if (transitioning && type === "zoom") transform = `scale(${1.3 - p * 0.3})`;
  if (transitioning && (type === "match_pan" || type === "camera_continuation"))
    transform = `translateX(${(1 - p) * 55}px)`;
  return (
    <AbsoluteFill>
      {transitioning && (
        <SceneVisual
          project={project}
          scene={previous}
          frame={previous.durationFrames + frame}
          sources={sources}
        />
      )}
      <AbsoluteFill
        style={{
          opacity,
          transform,
          filter:
            transitioning && type === "blur"
              ? `blur(${(1 - p) * 22}px)`
              : undefined,
          clipPath:
            transitioning && type === "foreground_wipe"
              ? `inset(0 ${100 - p * 100}% 0 0)`
              : undefined,
        }}
      >
        <SceneVisual
          project={project}
          scene={scene}
          frame={frame}
          sources={sources}
        />
      </AbsoluteFill>
      {transitioning && type === "light_flash" && (
        <AbsoluteFill style={{ background: "#fff1d7", opacity: 1 - p }} />
      )}
      {last &&
        scene.transitionOut === "fade" &&
        frame > scene.durationFrames - length && (
          <AbsoluteFill
            style={{
              background: "#1d1c19",
              opacity: smooth((frame - scene.durationFrames + length) / length),
            }}
          />
        )}
    </AbsoluteFill>
  );
}
export function StoryComposition({ project, assetSources }: RenderProps) {
  const fps = project.config.fps;
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#1d1c19" }}>
      {project.scenes.map((scene, i) => {
        const start = from;
        from += scene.durationFrames;
        return (
          <Sequence
            key={scene.sceneId}
            from={start}
            durationInFrames={scene.durationFrames}
          >
            <Shot
              project={project}
              scene={scene}
              previous={project.scenes[i - 1]}
              sources={assetSources}
              fps={fps}
              last={i === project.scenes.length - 1}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
