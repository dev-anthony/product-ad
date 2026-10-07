import {
  AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import type {Recipe, Scene} from "./types";

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

const getView = (r: Recipe, s: Scene, id: string) => {
  if (id === "full") return {cx: 0.5, cy: 0.5, z: 1};
  const b = r.targets[s.source][id];
  const z = Math.min(3.2, Math.max(1.5, 0.35 / Math.max(b.w, b.h)));
  return {cx: b.x + b.w / 2, cy: b.y + b.h / 2, z};
};

const center = (r: Recipe, s: Scene, id: string) => {
  const b = r.targets[s.source][id];
  return {x: b.x + b.w / 2, y: b.y + b.h / 2};
};

export const SceneView: React.FC<{recipe: Recipe; scene: Scene}> = ({recipe, scene}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = frame / fps;

  // image placement (contain, 86% of frame)
  const {w: iw, h: ih} = recipe.assets[scene.source];
  const sc = Math.min((W * 0.86) / iw, (H * 0.86) / ih);
  const dw = iw * sc, dh = ih * sc;
  const left = (W - dw) / 2, top = (H - dh) / 2;

  // camera
  const a = getView(recipe, scene, scene.camera.from);
  const b = getView(recipe, scene, scene.camera.to);
  const p = interpolate(t, [scene.camera.start, scene.camera.end], [0, 1], {easing: ease, ...clamp});
  const cx = a.cx + (b.cx - a.cx) * p;
  const cy = a.cy + (b.cy - a.cy) * p;
  const z = a.z * Math.pow(b.z / a.z, p);

  // cursor keyframes
  const moves = scene.actions.filter((x) => x.type === "cursor_move").sort((m, n) => m.at - n.at);
  const times = [0], xs = [0.85], ys = [0.95];
  moves.forEach((m) => {
    const c = center(recipe, scene, m.target);
    const last = times[times.length - 1];
    const start = Math.max(m.at, last + 0.001);
    times.push(start, start + (m.duration ?? 1));
    xs.push(xs[xs.length - 1], c.x);
    ys.push(ys[ys.length - 1], c.y);
  });
  const curX = interpolate(t, times, xs, {easing: ease, ...clamp});
  const curY = interpolate(t, times, ys, {easing: ease, ...clamp});

  const clicks = scene.actions.filter((x) => x.type === "click");
  const clickPulse = clicks.reduce((acc, c) => {
    const l = t - c.at;
    return l >= 0 && l < 0.25 ? Math.min(acc, interpolate(l, [0, 0.12, 0.25], [1, 0.82, 1])) : acc;
  }, 1);

  const fade = Math.min(
    interpolate(t, [0, 0.3], [0, 1], clamp),
    interpolate(t, [scene.duration - 0.3, scene.duration], [1, 0], clamp)
  );

  const px = (n: number) => left + n * dw;
  const py = (n: number) => top + n * dh;

  return (
    <AbsoluteFill style={{opacity: fade}}>
      {scene.audio && recipe.baseUrl && (
        <Sequence from={Math.round(0.3 * fps)}>
          <Audio src={`${recipe.baseUrl}/${scene.audio}`} />
        </Sequence>
      )}
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-px(cx)}px, ${-py(cy)}px)`,
        }}
      >
        <Img
          src={recipe.baseUrl ? `${recipe.baseUrl}/${scene.source}` : staticFile(scene.source)}
          style={{
            position: "absolute", left, top, width: dw, height: dh,
            borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          }}
        />

        {/* highlights */}
        {scene.actions.filter((x) => x.type === "highlight").map((h, i) => {
          const box = recipe.targets[scene.source][h.target];
          const d = h.duration ?? 2;
          const o = interpolate(t, [h.at, h.at + 0.3, h.at + d - 0.3, h.at + d], [0, 1, 1, 0], clamp);
          return (
            <div key={i} style={{
              position: "absolute",
              left: px(box.x) - 6, top: py(box.y) - 6,
              width: box.w * dw + 12, height: box.h * dh + 12,
              border: "3px solid #38bdf8", borderRadius: 10,
              boxShadow: "0 0 24px #38bdf8", opacity: o,
            }} />
          );
        })}

        {/* click ripples */}
        {clicks.map((c, i) => {
          const l = t - c.at;
          if (l < 0 || l > 0.6) return null;
          const pos = center(recipe, scene, c.target);
          const size = interpolate(l, [0, 0.6], [10, 90]) / z;
          return (
            <div key={i} style={{
              position: "absolute",
              left: px(pos.x) - size / 2, top: py(pos.y) - size / 2,
              width: size, height: size, borderRadius: "50%",
              border: `${3 / z}px solid #38bdf8`,
              opacity: interpolate(l, [0, 0.6], [0.9, 0]),
            }} />
          );
        })}

        {/* cursor (counter-scaled so it keeps constant screen size) */}
        <div style={{
          position: "absolute", left: px(curX), top: py(curY),
          transform: `scale(${clickPulse / z})`, transformOrigin: "0 0",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24">
            <path d="M3 2 L3 19 L8 14.5 L11.5 22 L14 21 L10.6 13.6 L17 13 Z"
                  fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
