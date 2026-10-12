"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { Music, Recipe, Scene } from "@/remotion/types";
import { OVERLAP, isShot } from "@/remotion/types";

import { TopNav } from "@/components/TopNav";
import { MediaPanel } from "@/components/MediaPanel";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { InspectorPanel } from "@/components/InspectorPanel";
import { Timeline } from "@/components/Timeline";
import { ClipToolbar } from "@/components/ClipToolbar";
import { ExportModal } from "@/components/ExportModal";

const API = "http://localhost:4000";
const PAD = 16;

type MediaItem = { id: string; file: File; url: string; server?: string; analyzed?: boolean; };
type Hist = { label: string; recipe: Recipe; };

export default function Home() {
  const [name, setName] = useState("My first ad");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [voice, setVoice] = useState("en-US-AriaNeural");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [past, setPast] = useState<Hist[]>([]);
  const [future, setFuture] = useState<Hist[]>([]);
  const [music, setMusic] = useState<Music[]>([]);
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [projectId, setProjectId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [sel, setSel] = useState(0);
  const [selAudio, setSelAudio] = useState("");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<"cut" | "edit" | "color" | "sound">("cut");
  const [pps, setPps] = useState(70);
  const [tlH, setTlH] = useState(250);
  const [markers, setMarkers] = useState<number[]>([]);
  const [dense, setDense] = useState(true);
  const [sortName, setSortName] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filterMode, setFilterMode] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const player = useRef<PlayerRef>(null);
  const picker = useRef<HTMLInputElement>(null);
  const audioPicker = useRef<HTMLInputElement>(null);

  const has = recipe !== null;
  const fps = recipe?.video.fps ?? 30;

  const frames = useMemo(() => {
    if (!recipe) return [];
    const ov = Math.round(OVERLAP * fps);
    const n = recipe.scenes.length;
    return recipe.scenes.map((s, i) => Math.round(s.duration * fps) - (i < n - 1 ? ov : 0));
  }, [recipe, fps]);

  const starts = useMemo(() => frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0)), [frames]);
  const total = frames.reduce((a, b) => a + b, 0);
  const totalSec = total / fps;
  const endSec = Math.max(10, totalSec, ...music.map((m) => m.start + m.duration));
  const innerW = PAD * 2 + endSec * pps + 120;

  const preview = useMemo(() => (recipe ? { ...recipe, music, baseUrl: `${API}/files` } : null), [recipe, music]);
  const scene = recipe?.scenes[sel];
  const bg = recipe?.video.background;

  const sceneAt = (f: number) => {
    const i = starts.findIndex((s, k) => f >= s && f < s + frames[k]);
    return i < 0 ? Math.max(0, frames.length - 1) : i;
  };

  const post = async <T,>(path: string, body: BodyInit, json = true): Promise<T> => {
    const res = await fetch(API + path, { method: "POST", headers: json ? { "Content-Type": "application/json" } : undefined, body });
    const response = await res.text();
    let data: any;
    try { data = response ? JSON.parse(response) : {}; } catch { data = { error: response }; }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data as T;
  };

  const addFiles = (files: File[]) => {
    const add = files.filter((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type.toLowerCase())).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    if (add.length) setMedia((m) => [...m, ...add]);
  };

  const run = async () => {
    if (!media.length || busy) return;
    setBusy(true);
    try {
      const names: string[] = [];
      for (const item of media) {
        let server = item.server;
        if (!server) {
          const form = new FormData();
          form.append("screenshot", item.file);
          const up = await post<{ filename: string }>("/api/upload", form, false);
          server = up.filename;
        }
        await post("/api/analyze", JSON.stringify({ filename: server }));
        names.push(server);
      }
      const rc = await post<{ id: string; recipe: Recipe }>("/api/recipe", JSON.stringify({ filenames: names, voice }));
      setRecipe(rc.recipe);
      setProjectId(rc.id);
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportVideo = async (full = false) => {
    if (!recipe || busy) return;
    setBusy(true);
    try {
      const d = await post<{ video: string }>("/api/render", JSON.stringify({ id: projectId, recipe: { ...recipe, music }, quality: full ? "full" : "fast" }));
      const blob = await (await fetch(d.video)).blob();
      setVideoUrl(URL.createObjectURL(blob));
      setShowExport(true);
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const commit = (label: string, next: Recipe) => {
    if (recipe) setPast((p) => [...p, { label, recipe }]);
    setRecipe(next);
    setFuture([]);
  };

  const setLen = (i: number, v: number) => {
    if (!recipe || !Number.isFinite(v)) return;
    const s = recipe.scenes[i];
    const len = Math.min(30, Math.max(2, Math.round(v * 10) / 10));
    commit("Scene length", { ...recipe, scenes: recipe.scenes.map((x, k) => (k === i ? { ...x, duration: len } : x)) });
  };

  const moveClip = (d: number) => {
    if (!recipe || selAudio) return;
    const j = sel + d;
    if (j < 0 || j >= recipe.scenes.length) return;
    const scenes = [...recipe.scenes];
    [scenes[sel], scenes[j]] = [scenes[j], scenes[sel]];
    commit("Move scene", { ...recipe, scenes });
    setSel(j);
  };

  const dup = () => {
    if (!recipe || selAudio) return;
    const s = recipe.scenes[sel];
    const scenes = [...recipe.scenes];
    scenes.splice(sel + 1, 0, { ...s, id: `${s.id}-c${Date.now()}` });
    commit("Duplicate scene", { ...recipe, scenes });
    setSel(sel + 1);
  };

  const del = () => {
    if (selAudio) {
      setMusic((m) => m.filter((k) => k.id !== selAudio));
      setSelAudio("");
      return;
    }
    if (!recipe || recipe.scenes.length < 2) return;
    commit("Delete scene", { ...recipe, scenes: recipe.scenes.filter((_, k) => k !== sel) });
    setSel(Math.max(0, sel - 1));
  };

  return (
    <div className="fixed inset-0 flex select-none bg-[#0a0a0b] font-sans text-[13px] text-[#eceff1]">
      <input ref={picker} type="file" multiple hidden accept="image/*" onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
      <input ref={audioPicker} type="file" multiple hidden accept="audio/*" onChange={(e) => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border border-[#232327] bg-[#141416]">
        <TopNav
          name={name}
          setName={setName}
          onExport={exportVideo}
          hasRecipe={has}
          busy={busy}
          onReset={() => setRecipe(null)}
          undo={() => {}}
          redo={() => {}}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
        />

        <div className="flex min-h-0 flex-1 gap-px bg-[#232327]">
          <section className="flex min-w-0 flex-[1.5] flex-col bg-[#141416]">
            <PreviewPlayer
              player={player}
              recipe={recipe}
              preview={preview}
              total={total}
              fps={fps}
              playing={playing}
              toggle={() => player.current?.toggle()}
              has={has}
              onPickFiles={() => picker.current?.click()}
              runAI={run}
              busy={busy}
              setTab={setTab}
            />
          </section>

          <aside className="flex min-w-[300px] max-w-[430px] flex-1 flex-col bg-[#18181b]">
            {tab === "cut" ? (
              <MediaPanel
                media={media}
                onPickFiles={() => picker.current?.click()}
                runAI={run}
                busy={busy}
                dense={dense}
                setDense={setDense}
                sortName={sortName}
                setSortName={setSortName}
                search={search}
                setSearch={setSearch}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                filterMode={filterMode}
                setFilterMode={setFilterMode}
                selectMode={selectMode}
                setSelectMode={setSelectMode}
                picked={picked}
                setPicked={setPicked}
                removePicked={() => setMedia((m) => m.filter((x) => !picked.includes(x.id)))}
                selectScene={(i) => setSel(i)}
                recipe={recipe}
              />
            ) : (
              <InspectorPanel
                tab={tab}
                scene={scene}
                sel={sel}
                recipe={recipe}
                setLen={setLen}
                bg={bg}
                setBg={(k, v) => setRecipe(recipe ? { ...recipe, video: { ...recipe.video, background: { ...recipe.video.background, [k]: v } } } : null)}
                commitBg={(r) => commit("Background", r)}
                voice={voice}
                setVoice={setVoice}
                music={music}
                setMusic={setMusic}
                selAudio={selAudio}
                setSelAudio={setSelAudio}
                patchMusic={(id, p) => setMusic((all) => all.map((m) => m.id === id ? { ...m, ...p } : m))}
                onPickAudio={() => audioPicker.current?.click()}
              />
            )}
          </aside>
        </div>

        <Timeline
          recipe={recipe}
          music={music}
          peaks={peaks}
          sel={sel}
          selAudio={selAudio}
          frame={frame}
          fps={fps}
          pps={pps}
          tlH={tlH}
          setTlH={setTlH}
          onSeek={(f: number) => { player.current?.seekTo(f); setFrame(f); }}
          selectScene={(i: number) => setSel(i)}
          setSelAudio={setSelAudio}
          endSec={endSec}
          innerW={innerW}
          PAD={PAD}
        />

        <ClipToolbar
          sel={sel}
          selAudio={selAudio}
          recipe={recipe}
          setTab={setTab}
          moveClip={moveClip}
          dup={dup}
          del={del}
          runAI={run}
          busy={busy}
          noScene={!has || !!selAudio}
        />
      </div>

      {showExport && <ExportModal videoUrl={videoUrl} onClose={() => setShowExport(false)} name={name} />}
    </div>
  );
}