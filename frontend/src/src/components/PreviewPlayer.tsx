"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Ad } from "@/remotion/Ad";
import { Play, Pause, Film, Plus, Sparkles } from "lucide-react";
import type { Recipe } from "@/remotion/types";

export function PreviewPlayer({
  player,
  recipe,
  preview,
  total,
  fps,
  playing,
  toggle,
  has,
  onPickFiles,
  runAI,
  busy,
  setTab,
}: {
  player: React.RefObject<PlayerRef | null>;
  recipe: Recipe | null;
  preview: Recipe | null;
  total: number;
  fps: number;
  playing: boolean;
  toggle: () => void;
  has: boolean;
  onPickFiles: () => void;
  runAI: () => void;
  busy: boolean;
  setTab: (t: any) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#141416]">
      <div className="grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 border-b border-[#232327]">
        <div className="overflow-hidden text-center col-span-3 sm:col-span-1">
          <b className="text-[14px] font-semibold text-white">Timeline 1 - {has ? `${recipe!.scenes.length} scenes` : "Empty"}</b>
          <span className="ml-2.5 text-[#8b8b94]">1080p ‖ {fps} fps</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {preview && recipe ? (
          <>
            <Player
              ref={player}
              component={Ad}
              inputProps={{ recipe: preview }}
              durationInFrames={Math.max(1, total)}
              fps={fps}
              compositionWidth={recipe.video.width}
              compositionHeight={recipe.video.height}
              clickToPlay
              style={{ width: "100%", height: "100%" }}
            />
            {!playing && (
              <button
                className="absolute left-1/2 top-1/2 grid h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 pl-1 text-white backdrop-blur hover:bg-black/70 transition"
                onClick={toggle}
              >
                <Play size={34} fill="currentColor" />
              </button>
            )}
          </>
        ) : (
          <div className="flex max-w-[420px] flex-col items-center gap-3 p-6 text-center">
            <div className="grid h-[72px] w-[72px] place-items-center rounded-2xl border border-[#2e2e34] bg-gradient-to-br from-[#1c1c22] to-[#26262e] text-[#f5c518]">
              <Film size={32} />
            </div>
            <h2 className="text-xl font-semibold text-white">Start your first ad</h2>
            <p className="text-[#8b8b94] text-sm">Add product screenshots, then press Generate. AI plans zooms, clicks & voiceover automatically.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2.5">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#2e2e34] bg-[#212125] px-4 py-2 font-medium text-white hover:bg-[#2a2a30]"
                onClick={onPickFiles}
              >
                <Plus size={16} /> Add screenshots
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[#f5c518] px-4 py-2 font-bold text-[#111] disabled:opacity-40 hover:bg-[#f6cb2f]"
                disabled={busy}
                onClick={runAI}
              >
                <Sparkles size={16} /> Generate ad
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}