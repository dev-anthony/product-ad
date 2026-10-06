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
};
