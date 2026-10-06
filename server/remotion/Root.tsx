import {Composition} from "remotion";
import {Ad} from "./Ad";
import sample from "./recipe.sample.json";
import type {Recipe} from "./types";

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
      const total = scenes.reduce((s, x) => s + x.duration, 0);
      return {
        durationInFrames: Math.round(total * video.fps),
        fps: video.fps,
        width: video.width,
        height: video.height,
      };
    }}
  />
);
