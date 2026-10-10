export type Box = {x: number; y: number; w: number; h: number};

export type Action = {
  type: "cursor_move" | "click" | "highlight";
  target: string;
  at: number;
  duration?: number;
};

export type Scene = {
  id: string;
  source: string;
  duration: number;
  camera: {from: string; to: string; start: number; end: number};
  actions: Action[];
  voiceover?: string;
  audio?: string;
  audioSecs?: number;
  audioStart?: number;
};

export type Music = {
  id: string;
  src: string;
  name: string;
  start: number;
  duration: number;
  volume: number;
};

export type Recipe = {
  video: {
    fps: number;
    width: number;
    height: number;
    background: {from: string; to: string};
  };
  assets: Record<string, {w: number; h: number}>;
  targets: Record<string, Record<string, Box>>;
  scenes: Scene[];
  music?: Music[];
  baseUrl?: string;
  captions?: boolean; // burned-in subtitles of the voiceover, on unless false
};

export const OVERLAP = 0.5; // seconds neighbouring scenes overlap

// ONE source of truth for the timeline. Ad.tsx, Root.tsx and the editor all use it.
export const sceneLayout = (scenes: Scene[], fps: number) => {
  const ov = Math.round(OVERLAP * fps);
  const full = scenes.map((s) => Math.round(s.duration * fps));
  const froms: number[] = [];
  let total = 0;
  full.forEach((f, i) => {
    froms.push(total);
    total += f - (i < scenes.length - 1 ? ov : 0);
  });
  return {full, froms, total};
};

// Narration starts with its scene and runs up to the next narration without overlap.
export const voiceWindows = (scenes: Scene[], fps: number) => {
  const {full, froms, total} = sceneLayout(scenes, fps);
  const starts = scenes.map((s, i) => (s.audio ? froms[i] : -1));
  return scenes.map((s, i) => {
    if (!s.audio) return null;
    const from = starts[i];
    const secs = s.audioSecs ?? s.duration;
    let end = Math.min(from + Math.ceil(secs * fps), froms[i] + full[i], total);
    const next = starts.find((st, k) => k > i && st >= 0);
    if (next !== undefined) end = Math.min(end, next);
    return end - from >= 1 ? {from, len: end - from} : null;
  });
};