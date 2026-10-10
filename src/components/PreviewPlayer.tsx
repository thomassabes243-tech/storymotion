"use client";
import React from "react";
import { Player } from "@remotion/player";
import { StoryComposition } from "../remotion/compositions/StoryComposition";
import { totalFrames, type Project } from "../lib/domain";
export default function PreviewPlayer({
  project,
  sceneId,
}: {
  project: Project;
  sceneId?: string;
}) {
  const selected = sceneId
    ? {
        ...project,
        scenes: project.scenes.filter((s) => s.sceneId === sceneId),
      }
    : project;
  const sources = Object.fromEntries(
    project.assets.map((a) => [a.id, `/api/assets/${a.id}/data`]),
  );
  for (const s of project.scenes)
    if (s.clipAssetId)
      sources[s.clipAssetId] = `/api/clips/${s.clipAssetId}/video`;
  if (!selected.scenes.length)
    return <div className="empty">Todavía no hay planos.</div>;
  return (
    <Player
      component={StoryComposition}
      inputProps={{ project: selected, assetSources: sources }}
      durationInFrames={totalFrames(selected.scenes)}
      fps={project.config.fps}
      compositionWidth={1080}
      compositionHeight={1920}
      controls
      loop
      style={{
        width: "100%",
        aspectRatio: "9 / 16",
        borderRadius: 10,
        overflow: "hidden",
      }}
      acknowledgeRemotionLicense
    />
  );
}
