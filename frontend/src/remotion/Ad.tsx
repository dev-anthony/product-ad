import {AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {SceneView} from "./Scene";
import {sceneLayout, voiceWindows} from "./types";
import type {Recipe} from "./types";

const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

const Caption: React.FC<{text: string; len: number}> = ({text, len}) => {
  const f = useCurrentFrame();
  const u = useVideoConfig().width / 1920; // scale text with the video size
  const k = Math.min(6, Math.floor(len / 3));
  const o = len < 4 ? 1 : interpolate(f, [0, k, len - k, len], [0, 1, 1, 0], clamp);
  const y = interpolate(f, [0, 8], [12, 0], clamp);
  return (
    <AbsoluteFill style={{justifyContent: "flex-end", alignItems: "center", paddingBottom: 64 * u, opacity: o}}>
      <div
        style={{
          transform: `translateY(${y}px)`,
          maxWidth: 1500 * u,
          padding: `${14 * u}px ${30 * u}px`,
          borderRadius: 16 * u,
          background: "rgba(0,0,0,0.58)",
          color: "#fff",
          fontSize: 46 * u,
          fontWeight: 600,
          lineHeight: 1.25,
          textAlign: "center",
          fontFamily: "Inter, system-ui, Segoe UI, sans-serif",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Ad: React.FC<{recipe: Recipe}> = ({recipe}) => {
  const {fps, background} = recipe.video;
  const n = recipe.scenes.length;
  const {full, froms, total} = sceneLayout(recipe.scenes, fps);
  const voices = voiceWindows(recipe.scenes, fps);

  return (
    <AbsoluteFill style={{background: `linear-gradient(135deg, ${background.from}, ${background.to})`}}>
      {recipe.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={froms[i]} durationInFrames={full[i]}>
          <SceneView recipe={recipe} scene={scene} isFirst={i === 0} isLast={i === n - 1} />
        </Sequence>
      ))}

      {/* Voices live at the top level, one window each, never overlapping */}
      {recipe.baseUrl &&
        recipe.scenes.map((scene, i) => {
          const w = voices[i];
          if (!w || !scene.audio) return null;
          return (
            <Sequence key={`v-${scene.id}`} from={w.from} durationInFrames={w.len} layout="none">
              <Audio src={`${recipe.baseUrl}/${scene.audio}`} />
            </Sequence>
          );
        })}

      {recipe.captions !== false &&
        recipe.scenes.map((scene, i) => {
          const w = voices[i];
          if (!w || !scene.voiceover) return null;
          return (
            <Sequence key={`c-${scene.id}`} from={w.from} durationInFrames={w.len}>
              <Caption text={scene.voiceover} len={w.len} />
            </Sequence>
          );
        })}

      {recipe.baseUrl &&
        (recipe.music ?? []).map((m) => {
          const from = Math.max(0, Math.round(m.start * fps));
          const len = Math.min(Math.round(m.duration * fps), total - from);
          if (len < 1) return null;
          return (
            <Sequence key={m.id} from={from} durationInFrames={len} layout="none">
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