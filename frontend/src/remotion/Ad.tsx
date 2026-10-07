import {AbsoluteFill, Audio, Sequence, interpolate} from "remotion";
import {SceneView} from "./Scene";
import type {Recipe} from "./types";

const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

export const Ad: React.FC<{recipe: Recipe}> = ({recipe}) => {
  const {fps, background} = recipe.video;
  const sceneFrames = recipe.scenes.map((s) => Math.round(s.duration * fps));
  const totalFrames = sceneFrames.reduce((a, b) => a + b, 0);
  let offset = 0;
  return (
    <AbsoluteFill
      style={{background: `linear-gradient(135deg, ${background.from}, ${background.to})`}}
    >
      {recipe.scenes.map((scene, i) => {
        const from = offset;
        offset += sceneFrames[i];
        return (
          <Sequence key={scene.id} from={from} durationInFrames={sceneFrames[i]}>
            <SceneView recipe={recipe} scene={scene} />
          </Sequence>
        );
      })}

      {recipe.baseUrl &&
        (recipe.music ?? []).map((m) => {
          const from = Math.max(0, Math.round(m.start * fps));
          const len = Math.min(Math.round(m.duration * fps), totalFrames - from);
          if (len < 1) return null;
          return (
            <Sequence key={m.id} from={from} durationInFrames={len}>
              <Audio
                src={`${recipe.baseUrl}/${m.src}`}
                volume={(f) => m.volume * interpolate(f, [len - 30, len], [1, 0], clamp)}
              />
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
};
