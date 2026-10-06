import {AbsoluteFill, Sequence} from "remotion";
import {SceneView} from "./Scene";
import type {Recipe} from "./types";

export const Ad: React.FC<{recipe: Recipe}> = ({recipe}) => {
  const {fps, background} = recipe.video;
  let offset = 0;
  return (
    <AbsoluteFill
      style={{background: `linear-gradient(135deg, ${background.from}, ${background.to})`}}
    >
      {recipe.scenes.map((scene) => {
        const from = offset;
        const frames = Math.round(scene.duration * fps);
        offset += frames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={frames}>
            <SceneView recipe={recipe} scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
