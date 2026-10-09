import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {OVERLAP} from "./types";
import type {Recipe, Scene} from "./types";

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const easeOut = Easing.bezier(0.33, 1, 0.68, 1);
const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

const getTarget = (r: Recipe, s: Scene, id: string) => {
  const b = r.targets[s.source]?.[id];
  if (!b) throw new Error(`Scene ${s.id} references missing target "${id}" on ${s.source}`);
  if (![b.x, b.y, b.w, b.h].every(Number.isFinite) ||
      b.x < 0 || b.y < 0 || b.w <= 0 || b.h <= 0 || b.x + b.w > 1 || b.y + b.h > 1)
    throw new Error(`Scene ${s.id} has invalid bounds for target "${id}" on ${s.source}`);
  return b;
};

const getView = (r: Recipe, s: Scene, id: string, W: number, H: number, dw: number, dh: number) => {
  if (id === "full") return {cx: 0.5, cy: 0.5, z: 1};
  const b = getTarget(r, s, id);
  const z = Math.min(3.2, Math.max(1.5, Math.min((W * 0.35) / (b.w * dw), (H * 0.35) / (b.h * dh))));
  return {cx: b.x + b.w / 2, cy: b.y + b.h / 2, z};
};

const center = (r: Recipe, s: Scene, id: string) => {
  const b = getTarget(r, s, id);
  return {x: b.x + b.w / 2, y: b.y + b.h / 2};
};

// Keep the camera inside the screenshot so no empty background shows at the edges.
const keepInside = (c: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, c)));

export const SceneView: React.FC<{
  recipe: Recipe;
  scene: Scene;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({recipe, scene, isFirst = false, isLast = false}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = frame / fps;

  // image placement (contain, 86% of frame)
  const {w: iw, h: ih} = recipe.assets[scene.source];
  const sc = Math.min((W * 0.86) / iw, (H * 0.86) / ih);
  const dw = iw * sc, dh = ih * sc;
  const left = (W - dw) / 2, top = (H - dh) / 2;

  // camera, with a slow push-in once it has arrived
  const a = getView(recipe, scene, scene.camera.from, W, H, dw, dh);
  const b = getView(recipe, scene, scene.camera.to, W, H, dw, dh);
  const p = interpolate(t, [scene.camera.start, scene.camera.end], [0, 1], {easing: ease, ...clamp});
  const drift = 1 + 0.015 * Math.max(0, t - scene.camera.end);
  const z = a.z * Math.pow(b.z / a.z, p) * drift;
  const cx = keepInside(a.cx + (b.cx - a.cx) * p, W / 2 / z / dw);
  const cy = keepInside(a.cy + (b.cy - a.cy) * p, H / 2 / z / dh);

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

  // transitions: incoming fades up and settles, outgoing keeps pushing in then dissolves
  const inP = interpolate(t, [0, isFirst ? 0.4 : OVERLAP], [0, 1], {easing: easeOut, ...clamp});
  const outP = isLast
    ? 0
    : interpolate(t, [scene.duration - OVERLAP, scene.duration], [0, 1], {easing: ease, ...clamp});
  let opacity = inP;
  let push = isFirst ? 1 : 1 + 0.05 * (1 - inP);
  if (!isLast) {
    opacity *= 1 - interpolate(outP, [0.4, 1], [0, 1], clamp);
    push *= 1 + 0.06 * outP;
  }

  const px = (n: number) => left + n * dw;
  const py = (n: number) => top + n * dh;

  return (
    <AbsoluteFill style={{opacity, transform: `scale(${push})`}}>
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

        {scene.actions.filter((x) => x.type === "highlight").map((h, i) => {
          const box = recipe.targets[scene.source]?.[h.target];
          if (!box) return null;
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