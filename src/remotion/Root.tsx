import React from "react";
import { Composition, registerRoot } from "remotion";
import { StoryComposition } from "./compositions/StoryComposition";
import { defaultConfig, totalFrames, type RenderProps } from "../lib/domain";
const empty: RenderProps = {
  project: {
    schemaVersion: 1,
    id: "empty",
    revision: 0,
    name: "StoryMotion",
    story: "",
    createdAt: "",
    updatedAt: "",
    config: defaultConfig,
    scenes: [],
    assets: [],
    warnings: [],
    state: "DRAFT",
  },
  assetSources: {},
};
function Root() {
  return (
    <Composition
      id="StoryMotion"
      component={StoryComposition}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={empty}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, totalFrames(props.project.scenes)),
        fps: props.project.config.fps,
        width: props.project.config.width,
        height: props.project.config.height,
      })}
    />
  );
}
registerRoot(Root);
