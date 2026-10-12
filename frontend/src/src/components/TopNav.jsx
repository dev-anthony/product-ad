"use client";

import { useState } from "react";
import { ArrowLeft, CloudUpload, MoreHorizontal } from "lucide-react";

export function TopNav({
  name,
  setName,
  onExport,
  hasRecipe,
  busy,
  onReset,
  undo,
  redo,
  canUndo,
  canRedo,
}: {
  name: string;
  setName: (v: string) => void;
  onExport: (full: boolean) => void;
  hasRecipe: boolean;
  busy: boolean;
  onReset: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const [openMenu, setOpenMenu] = useState("");

  return (
    <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#232327] px-3 bg-[#141416] z-50">
      <div className="flex items-center gap-2">
        <button
          className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] bg-transparent text-[#d9dadf] hover:bg-[#212125]"
          onClick={onReset}
          title="New project"
        >
          <ArrowLeft size={18} />
        </button>

        <input
          className="w-[190px] rounded-lg border-0 bg-transparent px-2 py-1.5 text-[13px] outline-none focus:bg-[#212125] text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
      </div>

      <nav className="flex items-center gap-1">
        <div className="relative">
          <button
            className="px-3 py-1.5 rounded-lg text-[#c9cace] hover:text-white hover:bg-[#212125]"
            onClick={() => setOpenMenu(openMenu === "file" ? "" : "file")}
          >
            File
          </button>
          {openMenu === "file" && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[200px] rounded-xl border border-[#2e2e34] bg-[#1c1c20] p-1.5 shadow-2xl">
              <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#2a2a30]" onClick={() => { onReset(); setOpenMenu(""); }}>New project</button>
              <button disabled={!hasRecipe || busy} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#2a2a30] disabled:opacity-40" onClick={() => { onExport(false); setOpenMenu(""); }}>Export (720p)</button>
              <button disabled={!hasRecipe || busy} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#2a2a30] disabled:opacity-40" onClick={() => { onExport(true); setOpenMenu(""); }}>Export (1080p)</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            className="px-3 py-1.5 rounded-lg text-[#c9cace] hover:text-white hover:bg-[#212125]"
            onClick={() => setOpenMenu(openMenu === "edit" ? "" : "edit")}
          >
            Edit
          </button>
          {openMenu === "edit" && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-xl border border-[#2e2e34] bg-[#1c1c20] p-1.5 shadow-2xl">
              <button disabled={!canUndo} className="flex justify-between w-full px-3 py-2 rounded-lg hover:bg-[#2a2a30] disabled:opacity-40" onClick={() => { undo(); setOpenMenu(""); }}><span>Undo</span><em className="text-xs text-[#8b8b94]">Ctrl+Z</em></button>
              <button disabled={!canRedo} className="flex justify-between w-full px-3 py-2 rounded-lg hover:bg-[#2a2a30] disabled:opacity-40" onClick={() => { redo(); setOpenMenu(""); }}><span>Redo</span><em className="text-xs text-[#8b8b94]">Ctrl+Y</em></button>
            </div>
          )}
        </div>
      </nav>

      <div className="flex items-center justify-end gap-2.5">
        <button
          className="inline-flex items-center gap-2 rounded-full bg-[#f5c518] px-4 py-2 font-bold text-[#111] disabled:opacity-40 transition hover:bg-[#f6cb2f]"
          disabled={!hasRecipe || busy}
          onClick={() => onExport(false)}
        >
          <CloudUpload size={16} />
          Export
        </button>

        <div className="relative">
          <button
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-transparent text-[#d9dadf] hover:bg-[#212125]"
            onClick={() => setOpenMenu(openMenu === "more" ? "" : "more")}
          >
            <MoreHorizontal size={18} />
          </button>

          {openMenu === "more" && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[250px] rounded-xl border border-[#2e2e34] bg-[#1c1c20] p-3 text-[#cfd0d6] leading-loose shadow-2xl">
              <div><b className="text-white min-w-[80px] inline-block">Space</b> Play / Pause</div>
              <div><b className="text-white min-w-[80px] inline-block">← →</b> Step Frame</div>
              <div><b className="text-white min-w-[80px] inline-block">M</b> Add Marker</div>
              <div><b className="text-white min-w-[80px] inline-block">Del</b> Remove Clip</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}