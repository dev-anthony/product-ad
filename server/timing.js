// Keep OVERLAP identical to remotion/types.ts
const OVERLAP = 0.5;

// Gemini picks the target. This decides when everything happens.
function retime(scene, audioSecs, isLast, fps = 30) {
  const target = scene.camera.to;
  const hasAudio = Number.isFinite(audioSecs) && audioSecs > 0;
  const overlapFrames = Math.round(OVERLAP * fps);
  const audioFrames = hasAudio ? Math.ceil(audioSecs * fps) : 0;
  const activeFrames = hasAudio ? audioFrames : Math.round(4.5 * fps);
  const durationFrames = activeFrames + (isLast ? 0 : overlapFrames);
  const activeDuration = activeFrames / fps;
  const cameraEnd = Math.min(1.45, activeDuration * 0.5);
  scene.duration = durationFrames / fps;
  if (scene.kind && scene.kind !== "shots") return scene;
  scene.camera = {from: "full", to: target, start: Math.min(0.35, cameraEnd * 0.2), end: cameraEnd};
  scene.actions = [
    {type: "highlight", target, at: activeDuration * 0.2, duration: activeDuration * 0.42},
    {type: "cursor_move", target, at: activeDuration * 0.48, duration: activeDuration * 0.22},
    {type: "click", target, at: activeDuration * 0.76},
  ];
  return scene;
}

module.exports = {retime, OVERLAP};