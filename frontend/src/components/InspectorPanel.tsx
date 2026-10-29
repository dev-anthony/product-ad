"use client";

import { Palette, Volume2, Mic, Plus, X } from "lucide-react";
import type { Recipe, Scene, Music } from "@/remotion/types";

const PRESETS: [string, string][] = [
  ["#0f172a", "#1e293b"],
  ["#000000", "#16161a"],
  ["#1e1b4b", "#4c1d95"],
  ["#052e2b", "#0f766e"],
  ["#3b0764", "#be185d"],
  ["#0b1020", "#1d4ed8"],
];

const VOICES: [string, string][] = [
  ["en-US-AriaNeural", "Aria (US, female)"],
  ["en-US-GuyNeural", "Guy (US, male)"],
  ["en-GB-RyanNeural", "Ryan (UK, male)"],
  ["en-NG-EzinneNeural", "Ezinne (Nigeria, female)"],
  ["en-NG-AbeoNeural", "Abeo (Nigeria, male)"],
];

export function InspectorPanel({
  tab,
  scene,
  sel,
  recipe,
  setLen,
  bg,
  setBg,
  commitBg,
  voice,
  setVoice,
  music,
  setMusic,
  selAudio,
  setSelAudio,
  patchMusic,
  onPickAudio,
}: {
  tab: string;
  scene?: Scene;
  sel: number;
  recipe: Recipe | null;
  setLen: (i: number, v: number) => void;
  bg?: { from: string; to: string };
  setBg: (k: "from" | "to", v: string) => void;
  commitBg: (r: Recipe) => void;
  voice: string;
  setVoice: (v: string) => void;
  music: Music[];
  setMusic: React.Dispatch<React.SetStateAction<Music[]>>;
  selAudio: string;
  setSelAudio: (id: string) => void;
  patchMusic: (id: string, patch: Partial<Music>) => void;
  onPickAudio: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#18181b] overflow-auto p-3">
      {tab === "edit" && (
        scene ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5 rounded-xl border border-[#2e2e34] bg-[#212125] p-3 text-white">
              <div className="flex justify-between"><span>Scene</span><b>{sel + 1} of {recipe?.scenes.length}</b></div>
              <div className="flex justify-between items-center">
                <span>Length (s)</span>
                <input
                  className="w-[90px] rounded-lg border border-[#2e2e34] bg-[#0a0a0b] px-2 py-1.5 outline-none text-white text-right"
                  type="number"
                  min={2}
                  max={30}
                  step={0.1}
                  defaultValue={scene.duration}
                  onBlur={(e) => setLen(sel, Number(e.target.value))}
                />
              </div>
            </div>
            <div className="rounded-[10px] bg-[#212125] p-3 italic text-[#d6d7db]">“{scene.voiceover}”</div>
          </div>
        ) : <div className="text-center text-[#8b8b94] py-10">Select a scene to edit</div>
      )}

      {tab === "color" && (
        recipe && bg ? (
          <div className="flex flex-col gap-3">
            <div className="h-[90px] rounded-xl border border-[#2e2e34]" style={{ background: `linear-gradient(135deg, ${bg.from}, ${bg.to})` }} />
            {(["from", "to"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span>{k === "from" ? "Start color" : "End color"}</span>
                <input type="color" className="h-[30px] w-[46px] cursor-pointer rounded bg-transparent" value={bg[k]} onChange={(e) => setBg(k, e.target.value)} />
              </div>
            ))}
            <div className="grid grid-cols-6 gap-2 mt-2">
              {PRESETS.map(([a, b]) => (
                <button
                  key={a + b}
                  className="aspect-square rounded-lg border border-[#2e2e34]"
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                  onClick={() => commitBg({ ...recipe, video: { ...recipe.video, background: { from: a, to: b } } })}
                />
              ))}
            </div>
          </div>
        ) : <div className="text-center text-[#8b8b94] py-10">Generate ad first</div>
      )}

      {tab === "sound" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-xl border border-[#2e2e34] bg-[#212125] p-3">
            <span className="text-xs text-[#8b8b94]">Narrator voice</span>
            <select className="w-full rounded-lg border border-[#2e2e34] bg-[#0a0a0b] px-2.5 py-2 text-white outline-none" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {VOICES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2e2e34] bg-[#212125] py-2 text-white hover:bg-[#2a2a30]" onClick={onPickAudio}>
            <Plus size={16} /> Add custom audio
          </button>

          {music.map((m, k) => (
            <div key={m.id} className={`flex flex-col gap-2 rounded-xl border bg-[#212125] p-3 ${m.id === selAudio ? "border-[#f5c518]" : "border-[#2e2e34]"}`} onClick={() => setSelAudio(m.id)}>
              <div className="flex justify-between items-center">
                <b className="truncate text-white">Music {k + 1} · {m.name}</b>
                <button onClick={() => setMusic((all) => all.filter((x) => x.id !== m.id))}><X size={14} /></button>
              </div>
              <div className="flex justify-between items-center text-xs text-[#8b8b94]">
                <span>Start (s)</span>
                <input className="w-[80px] rounded bg-black px-2 py-1 text-white text-right" type="number" value={m.start} onChange={(e) => patchMusic(m.id, { start: Number(e.target.value) })} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}