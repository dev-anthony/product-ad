// Keep LEAD and OVERLAP identical to remotion/types.ts
const LEAD = 0.25;
const OVERLAP = 0.5;
// Pause between one voice ending and the next starting = TAIL + LEAD - OVERLAP (0.30s)
const TAIL = 0.55;
const r = (n) => Math.round(n * 100) / 100;

// Gemini picks the target. This decides when everything happens.
function retime(scene, audioSecs) {
  const target = scene.camera.to;
  scene.duration = r(Math.max(3.6, audioSecs ? LEAD + audioSecs + TAIL : 4.5));
  scene.camera = {from: "full", to: target, start: 0.35, end: 1.45};
  scene.actions = [
    {type: "highlight", target, at: 1.0, duration: 1.6},
    {type: "cursor_move", target, at: 1.3, duration: 0.9},
    {type: "click", target, at: 2.35},
  ];
  return scene;
}

module.exports = {retime, LEAD, OVERLAP, TAIL};