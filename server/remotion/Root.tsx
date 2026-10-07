import {Composition} from "remotion";
import {Ad} from "./Ad";
import sample from "./recipe.sample.json";
import type {Recipe} from "./types";
import {sceneLayout} from "./types";

export const Root: React.FC = () => (
  <Composition
    id="Ad"
    component={Ad}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{recipe: sample as Recipe}}
    calculateMetadata={({props}) => {
      const {video, scenes} = props.recipe;
      return {
        durationInFrames: Math.max(1, sceneLayout(scenes, video.fps).total),
        fps: video.fps,
        width: video.width,
        height: video.height,
      };
    }}
  />
);