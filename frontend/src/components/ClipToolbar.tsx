"use client";

import { Layers, Volume2, MoveLeft, MoveRight, Copy, Trash2, Sparkles } from "lucide-react";

export function ClipToolbar({
  sel,
  selAudio,
  recipe,
  setTab,
  moveClip,
  dup,
  del,
  runAI,
  busy,
  noScene,
}: any) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2.5 bg-[#141416] px-3 border-t border-[#232327]">
      <div className="flex items-center gap-2">
        <button className="flex h-10 items-center gap-2 rounded-xl border border-[#2e2e34] bg-[#212125] px-3 text-[#cfd0d6]" onClick={() => setTab("sound")}>
          <Volume2 size={16} /> Volume
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button disabled={noScene || sel === 0} className="h-10 w-11 grid place-items-center rounded-xl border border-[#2e2e34] bg-[#212125] text-white disabled:opacity-30" onClick={() => moveClip(-1)}><MoveLeft size={16} /></button>
        <button disabled={noScene || !recipe || sel >= recipe.scenes.length - 1} className="h-10 w-11 grid place-items-center rounded-xl border border-[#2e2e34] bg-[#212125] text-white disabled:opacity-30" onClick={() => moveClip(1)}><MoveRight size={16} /></button>
        <button disabled={noScene} className="h-10 w-11 grid place-items-center rounded-xl border border-[#2e2e34] bg-[#212125] text-white disabled:opacity-30" onClick={dup}><Copy size={16} /></button>
        <button disabled={!selAudio && (!recipe || recipe.scenes.length < 2)} className="h-10 px-3 flex items-center gap-2 rounded-xl border border-[#2e2e34] bg-[#212125] text-[#ff7b7f] disabled:opacity-30" onClick={del}><Trash2 size={16} /> Delete</button>
        <button disabled={busy} className="h-10 px-4 flex items-center gap-2 rounded-xl bg-[#f5c518] text-[#111] font-bold hover:bg-[#f6cb2f] disabled:opacity-40" onClick={runAI}><Sparkles size={16} /> Generate</button>
      </div>
    </div>
  );
}