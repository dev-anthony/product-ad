"use client";

import { useRef, useEffect } from "react";
import type { Recipe, Music, Scene } from "@/remotion/types";
import { isShot } from "@/remotion/types";

const AH = 26;

function Wave({ peaks, w }: { peaks?: number[]; w: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = Math.max(1, Math.min(8000, Math.floor(w)));

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W;
    c.height = AH;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, W, AH);
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let x = 0; x < W; x += 3) {
      const v = peaks ? peaks[Math.min(peaks.length - 1, Math.floor((x / W) * peaks.length))] : 0.12;
      const bh = Math.max(2, v * (AH - 4));
      g.fillRect(x, (AH - bh) / 2, 2, bh);
    }
  }, [peaks, W]);

  return <canvas ref={ref} className="absolute bottom-0 left-0" style={{ width: W, height: AH }} />;
}

export function Timeline({
  recipe,
  music,
  peaks,
  sel,
  selAudio,
  frame,
  fps,
  pps,
  tlH,
  setTlH,
  onSeek,
  selectScene,
  setSelAudio,
  resizeScene,
  dragMusic,
  addMarker,
  markers,
  endSec,
  innerW,
  PAD,
}: any) {
  const tlRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);

  const scrubAt = (clientX: number) => {
    const el = scrubRef.current;
    if (!el) return;
    onSeek(((clientX - el.getBoundingClientRect().left - PAD) / pps) * fps);
  };

  const ruler = [];
  const sub = pps >= 60 ? 5 : 2;
  for (let s = 0; s <= Math.ceil(endSec) + 1; s++) {
    ruler.push(
      <div key={`M${s}`} className="absolute bottom-0 h-2.5 w-px bg-[#6c6c75]" style={{ left: PAD + s * pps }}>
        {(pps >= 45 || s % 2 === 0) && <span className="absolute bottom-0.5 left-[5px] text-[10.5px] text-[#8b8b94]">{s}s</span>}
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 border-t border-[#232327] bg-[#101012]" style={{ height: tlH }}>
      <div className="relative min-w-0 flex-1 overflow-auto" ref={tlRef}>
        <div className="relative min-h-full pb-3.5" style={{ width: innerW }}>
          <div
            className="cursor-pointer"
            ref={scrubRef}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e.clientX); }}
            onPointerMove={(e) => { if (e.buttons === 1) scrubAt(e.clientX); }}
          >
            <div className="relative h-[26px]">{ruler}</div>
          </div>

          {recipe && (
            <div className="relative mt-1.5 h-14">
              {recipe.scenes.map((s: Scene, i: number) => {
                const on = i === sel && !selAudio;
                return (
                  <div
                    key={s.id}
                    className={`absolute top-0 h-14 cursor-pointer rounded-[9px] ${on ? "bg-[#2f63d8]" : "bg-[#3d424f]"}`}
                    onClick={() => selectScene(i)}
                    style={{ left: PAD + (s.startFrame / fps || 0) * pps, width: 120 }}
                  >
                    <div className="absolute left-2 top-2 text-white text-xs truncate">Scene {i + 1}</div>
                    {on && (
                      <span
                        className="absolute -right-1 top-0 bottom-0 w-2 cursor-ew-resize bg-[#f5c518] rounded-r"
                        onPointerDown={(e) => resizeScene(e, i)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}