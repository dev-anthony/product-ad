"use client";

import { Upload, Sparkles, Image as ImageIcon, Trash2, Search, SlidersHorizontal, ArrowUpDown, LayoutGrid, List } from "lucide-react";

export function MediaPanel({
  media,
  onPickFiles,
  runAI,
  busy,
  dense,
  setDense,
  sortName,
  setSortName,
  search,
  setSearch,
  showSearch,
  setShowSearch,
  filterMode,
  setFilterMode,
  selectMode,
  setSelectMode,
  picked,
  setPicked,
  removePicked,
  selectScene,
  recipe,
}: {
  media: any[];
  onPickFiles: () => void;
  runAI: () => void;
  busy: boolean;
  dense: boolean;
  setDense: (v: boolean | ((p: boolean) => boolean)) => void;
  sortName: boolean;
  setSortName: (v: boolean | ((p: boolean) => boolean)) => void;
  search: string;
  setSearch: (v: string) => void;
  showSearch: boolean;
  setShowSearch: (v: boolean | ((p: boolean) => boolean)) => void;
  filterMode: number;
  setFilterMode: (v: number | ((p: number) => number)) => void;
  selectMode: boolean;
  setSelectMode: (v: boolean | ((p: boolean) => boolean)) => void;
  picked: string[];
  setPicked: (v: string[] | ((p: string[]) => string[])) => void;
  removePicked: () => void;
  selectScene: (i: number) => void;
  recipe: any;
}) {
  const FILTERS = ["All media", "Used in ad", "Unused"];

  let visible = media
    .filter((m) => m.file.name.toLowerCase().includes(search.toLowerCase()))
    .filter((m) => {
      const used = recipe && m.server ? recipe.scenes.some((s: any) => s.source === m.server) : undefined;
      return filterMode === 0 ? true : filterMode === 1 ? used === true : used !== true;
    });

  if (sortName) {
    visible = [...visible].sort((a, b) => a.file.name.localeCompare(b.file.name));
  }

  return (
    <div className="flex flex-col h-full bg-[#18181b]">
      <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2.5 border-b border-[#232327]">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e2e34] bg-[#212125] px-2.5 py-1.5 text-xs text-[#f5c518] hover:bg-[#2a2a30]"
            onClick={() => setFilterMode((f) => (f + 1) % 3)}
          >
            <SlidersHorizontal size={14} />
            Filters
          </button>
        </div>

        <h3 className="text-[15px] font-semibold text-white">Media</h3>

        <div className="flex justify-end gap-1">
          <button className="h-[34px] w-[38px] grid place-init center rounded-lg hover:bg-[#212125] text-[#d9dadf]" onClick={() => setSortName((s) => !s)} title="Sort"><ArrowUpDown size={16} /></button>
          <button className="h-[34px] w-[38px] grid place-items-center rounded-lg hover:bg-[#212125] text-[#d9dadf]" onClick={() => setDense((d) => !d)} title="Layout"><LayoutGrid size={16} /></button>
          <button className="h-[34px] w-[38px] grid place-items-center rounded-lg hover:bg-[#212125] text-[#d9dadf]" onClick={() => setShowSearch((s) => !s)} title="Search"><Search size={16} /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 flex flex-col gap-2.5">
        {showSearch && (
          <input
            className="w-full rounded-lg border border-[#2e2e34] bg-[#212125] px-3 py-2 text-white outline-none"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {filterMode > 0 && <p className="text-[11.5px] text-[#8b8b94]">Showing: {FILTERS[filterMode]}</p>}

        {media.length === 0 ? (
          <button
            className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#3a3a42] bg-[rgba(255,255,255,.015)] text-[#8b8b94] hover:border-[#f5c518] hover:bg-[rgba(245,197,24,.04)] p-6"
            onClick={onPickFiles}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[#2e2e34] bg-[#212125] text-[#f5c518]">
              <Upload size={24} />
            </span>
            <b className="text-[14px] font-semibold text-white">Drop screenshots here</b>
            <small>or click to browse · PNG, JPG, WEBP</small>
          </button>
        ) : (
          <div className={`grid gap-2 ${dense ? "grid-cols-4" : "grid-cols-2"}`}>
            {visible.map((m) => {
              const used = recipe && m.server ? recipe.scenes.some((s: any) => s.source === m.server) : undefined;
              const isPicked = picked.includes(m.id);
              const active = !!m.server && recipe?.scenes[recipe.scenes.findIndex((s: any) => s.source === m.server)]?.source === m.server;

              return (
                <div
                  key={m.id}
                  className="relative min-w-0 cursor-pointer"
                  onClick={() => {
                    if (selectMode) {
                      setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
                    } else if (recipe && m.server) {
                      const i = recipe.scenes.findIndex((s: any) => s.source === m.server);
                      if (i >= 0) selectScene(i);
                    }
                  }}
                >
                  <div
                    className={`relative overflow-hidden rounded-md border-[1.5px] bg-black bg-cover bg-left-top ${
                      dense ? "aspect-[1/1.05]" : "aspect-[16/10]"
                    } ${active || isPicked ? "border-[#f5c518]" : "border-transparent"}`}
                    style={{ backgroundImage: `url(${m.url})` }}
                  >
                    <span className="absolute bottom-1 left-1 flex text-white drop-shadow"><ImageIcon size={12} /></span>
                    <span className="absolute bottom-[3px] right-1 rounded bg-black/70 px-1.5 py-px text-[10px] text-white">
                      {(m.file.size / 1048576).toFixed(1)} MB
                    </span>
                    {isPicked && (
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#f5c518] text-black">✓</span>
                    )}
                  </div>
                  <div className={`mt-1 h-[3px] rounded-sm ${used === true ? "bg-[#32c26a]" : used === false ? "bg-[#e5484d] w-[40%]" : "bg-transparent"}`} />
                  <div className="mt-1 truncate text-[10.5px] text-[#8b8b94]">{m.file.name}</div>
                </div>
              );
            })}

            <button
              className={`grid place-items-center rounded-md border border-dashed border-[#2e2e34] text-[#8b8b94] hover:border-[#f5c518] hover:text-[#f5c518] ${dense ? "aspect-[1/1.05]" : "aspect-[16/10]"}`}
              onClick={onPickFiles}
            >
              +
            </button>
          </div>
        )}
      </div>

      {media.length > 0 && (
        <div className="p-3 border-t border-[#232327]">
          <button
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#f5c518] p-3 font-bold text-[#111] hover:bg-[#f6cb2f] disabled:opacity-40"
            disabled={busy}
            onClick={runAI}
          >
            <Sparkles size={16} />
            Generate Ad Video
          </button>
        </div>
      )}
    </div>
  );
}