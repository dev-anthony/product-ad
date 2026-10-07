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

export const LEAD = 0.25; // voiceover starts this far into a scene
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

// When each voiceover plays. A voice is cut at the end of its own scene and at the
// start of the next voice, so two voices can never be audible at the same time.
export const voiceWindows = (scenes: Scene[], fps: number) => {
  const {full, froms, total} = sceneLayout(scenes, fps);
  const starts = scenes.map((s, i) => (s.audio ? froms[i] + Math.round(LEAD * fps) : -1));
  return scenes.map((s, i) => {
    if (!s.audio) return null;
    const from = starts[i];
    const secs = s.audioSecs ?? Math.max(0.5, s.duration - LEAD - 0.5);
    let end = Math.min(from + Math.ceil(secs * fps) + 1, froms[i] + full[i], total);
    const next = starts.find((st, k) => k > i && st >= 0);
    if (next !== undefined) end = Math.min(end, next - 1);
    return end - from >= 1 ? {from, len: end - from} : null;
  });
};