"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {Player, type PlayerRef} from "@remotion/player";
import {Ad} from "@/remotion/Ad";
import type {Music, Recipe, Scene} from "@/remotion/types";
import {OVERLAP, isShot} from "@/remotion/types";
import {Icon} from "./icons";

const API = "http://localhost:4000";
const PAD = 16;
const AH = 26;

const VOICES: [string, string][] = [
  ["en-US-AriaNeural", "Aria (US, female)"],
  ["en-US-GuyNeural", "Guy (US, male)"],
  ["en-GB-RyanNeural", "Ryan (UK, male)"],
  ["en-NG-EzinneNeural", "Ezinne (Nigeria, female)"],
  ["en-NG-AbeoNeural", "Abeo (Nigeria, male)"],
];

const PRESETS: [string, string][] = [
  ["#0f172a", "#1e293b"],
  ["#000000", "#16161a"],
  ["#1e1b4b", "#4c1d95"],
  ["#052e2b", "#0f766e"],
  ["#3b0764", "#be185d"],
  ["#0b1020", "#1d4ed8"],
];

const FILTERS = ["All media", "Used in ad", "Unused"];

type Tab = "cut" | "edit" | "color" | "sound";

const TABS: {k: Tab; label: string; icon: string}[] = [
  {k: "cut", label: "Cut", icon: "scissors"},
  {k: "edit", label: "Edit", icon: "curve"},
  {k: "color", label: "Color", icon: "drop"},
  {k: "sound", label: "Sound", icon: "speaker"},
];

const PANEL_TITLE: Record<Tab, string> = {
  cut: "Media",
  edit: "Scene",
  color: "Background",
  sound: "Audio",
};

type MediaItem = {
  id: string;
  file: File;
  url: string;
  server?: string;
};

type Hist = {
  label: string;
  recipe: Recipe;
};

type MenuItem = {
  label: string;
  hint?: string;
  run?: () => void;
  disabled?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

const tc = (frame: number, fps: number) => {
  const s = Math.floor(frame / fps);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frame % fps)}`;
};

const size = (n: number) =>
  n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

const isImageFile = (file: File) =>
  ["image/png", "image/jpeg", "image/webp"].includes(file.type.toLowerCase()) ||
  /\.(png|jpe?g|webp)$/i.test(file.name);

const sceneLabel = (s: Scene, i: number) =>
  isShot(s)
    ? `Scene ${i + 1} · ${s.camera.to}`
    : `Scene ${i + 1} · ${s.kind === "end" ? "End card" : s.kind === "title" ? "Title" : "Problem"}`;

const minLen = (s: Scene) =>
  Math.max(
    2,
    s.camera.end,
    ...s.actions.map((a) => a.at + (a.duration ?? 0)),
  ) + 0.5;

async function loadPeaks(url: string) {
  const buf = await (await fetch(url)).arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();

  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const N = 400;
    const step = Math.max(1, Math.floor(data.length / N));
    const peaks: number[] = [];

    for (let i = 0; i < N; i++) {
      let max = 0;
      const end = Math.min((i + 1) * step, data.length);

      for (let j = i * step; j < end; j += 8) {
        max = Math.max(max, Math.abs(data[j]));
      }

      peaks.push(max);
    }

    const top = Math.max(...peaks, 0.001);

    return {
      peaks: peaks.map((p) => p / top),
      duration: audio.duration,
    };
  } finally {
    ctx.close();
  }
}

function Wave({peaks, w}: {peaks?: number[]; w: number}) {
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
      const v = peaks
        ? peaks[Math.min(peaks.length - 1, Math.floor((x / W) * peaks.length))]
        : 0.12;

      const bh = Math.max(2, v * (AH - 4));
      g.fillRect(x, (AH - bh) / 2, 2, bh);
    }
  }, [peaks, W]);

  return (
    <canvas
      ref={ref}
      className="absolute bottom-0 left-0"
      style={{width: W, height: AH}}
    />
  );
}

function Meter({active}: {active: boolean}) {
  const [lv, setLv] = useState([0, 0]);

  useEffect(() => {
    if (!active) {
      setLv([0, 0]);
      return;
    }

    const t = setInterval(() => {
      const b = 0.4 + 0.25 * Math.sin(Date.now() / 260);

      setLv([
        Math.min(1, b + Math.random() * 0.3),
        Math.min(1, b + Math.random() * 0.3),
      ]);
    }, 90);

    return () => clearInterval(t);
  }, [active]);

  const N = 30;

  return (
    <div className="flex w-16 shrink-0 gap-1 border-l border-[#232327] bg-[#0f0f11] px-2 py-2.5 pl-1.5">
      <div className="flex flex-col justify-between pr-0.5 text-right text-[9.5px] text-[#8b8b94]">
        {[0, 10, 20, 30, 40, 50].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>

      {lv.map((v, c) => (
        <div key={c} className="flex w-[7px] flex-col gap-px">
          {Array.from({length: N}).map((_, i) => {
            const pos = 1 - i / N;
            const cls =
              pos > 0.82
                ? "bg-[#ef4444]"
                : pos > 0.6
                  ? "bg-[#e8d23a]"
                  : "bg-[#46d36a]";

            return (
              <i
                key={i}
                className={`min-h-0 flex-1 rounded-[1px] ${
                  pos <= v ? cls : "bg-[#222226]"
                }`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Pop({
  items,
  close,
  right,
  up,
}: {
  items: MenuItem[];
  close: () => void;
  right?: boolean;
  up?: boolean;
}) {
  return (
    <div
      className={`absolute z-[100] min-w-[210px] rounded-xl border border-[#2e2e34] bg-[#1c1c20] p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.6)] ${
        right ? "right-0 left-auto" : "left-0"
      } ${up ? "top-auto bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
    >
      {items.map((it, i) => (
        <button
          key={i}
          className="flex w-full items-center justify-between gap-5 rounded-lg px-2.5 py-2 text-left hover:bg-[#2a2a30] disabled:cursor-default disabled:opacity-[.38]"
          disabled={it.disabled}
          onClick={() => {
            it.run?.();
            close();
          }}
        >
          <span>{it.label}</span>
          {it.hint && (
            <em className="text-[11.5px] not-italic text-[#8b8b94]">
              {it.hint}
            </em>
          )}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [name, setName] = useState("My first ad");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [voice, setVoice] = useState("en-US-AriaNeural");
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState(false);
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
  const [tab, setTab] = useState<Tab>("cut");
  const [pps, setPps] = useState(70);
  const [tlH, setTlH] = useState(250);
  const [markers, setMarkers] = useState<number[]>([]);
  const [openMenu, setOpenMenu] = useState("");
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
  const tlRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const requested = useRef<Set<string>>(new Set());
  const bgSnap = useRef<Recipe | null>(null);
  const hk = useRef<any>({});

  const has = recipe !== null;
  const fps = recipe?.video.fps ?? 30;

  const frames = useMemo(() => {
    if (!recipe) return [];
    const ov = Math.round(OVERLAP * fps);
    const n = recipe.scenes.length;
    return recipe.scenes.map(
      (s, i) => Math.round(s.duration * fps) - (i < n - 1 ? ov : 0),
    );
  }, [recipe, fps]);

  const starts = useMemo(
    () => frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0)),
    [frames],
  );

  const total = frames.reduce((a, b) => a + b, 0);
  const totalSec = total / fps;
  const endSec = Math.max(
    10,
    totalSec,
    ...music.map((m) => m.start + m.duration),
  );

  const innerW = PAD * 2 + endSec * pps + 120;

  const preview = useMemo(
    () => (recipe ? {...recipe, music, baseUrl: `${API}/files`} : null),
    [recipe, music],
  );

  const scene = recipe?.scenes[sel];
  const bg = recipe?.video.background;

  const sceneAt = (f: number) => {
    const i = starts.findIndex((s, k) => f >= s && f < s + frames[k]);

    return i < 0 ? Math.max(0, frames.length - 1) : i;
  };

  const usedOf = (m: MediaItem) =>
    recipe && m.server
      ? recipe.scenes.some((s) => s.source === m.server)
      : undefined;

  useEffect(() => {
    const p = player.current;
    if (!p) return;

    const onFrame = (e: {detail: {frame: number}}) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);

    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  }, [has]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;

      if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;

      const h = hk.current;

      if (e.code === "Space") {
        if (t.tagName === "BUTTON") return;
        e.preventDefault();
        h.toggle();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        e.shiftKey ? h.redo() : h.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        h.redo();
      } else if (e.code === "Delete") {
        h.del();
      } else if (e.code === "KeyM") {
        h.marker();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        h.step(e.shiftKey ? -h.fps : -1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        h.step(e.shiftKey ? h.fps : 1);
      }
    };

    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    const f = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) {
        setOpenMenu("");
      }
    };

    window.addEventListener("pointerdown", f);
    return () => window.removeEventListener("pointerdown", f);
  }, []);

  useEffect(() => {
    if (!status) return;

    setToast(true);

    const t = setTimeout(() => setToast(false), 4500);

    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!recipe) return;

    recipe.scenes.forEach((s) => {
      const n = s.audio;

      if (!n || requested.current.has(n)) return;

      requested.current.add(n);

      loadPeaks(`${API}/files/${n}`)
        .then((r) => setPeaks((p) => ({...p, [n]: r.peaks})))
        .catch(() => {});
    });
  }, [recipe]);

  useEffect(() => {
    const el = tlRef.current;

    if (!el || !playing) return;

    const x = PAD + (frame / fps) * pps;

    if (x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = x - 40;
    } else if (x < el.scrollLeft) {
      el.scrollLeft = Math.max(0, x - 40);
    }
  }, [frame, playing, pps, fps]);

  const post = async <T,>(path: string, body: BodyInit, json = true): Promise<T> => {
    const res = await fetch(API + path, {
      method: "POST",
      headers: json ? {"Content-Type": "application/json"} : undefined,
      body,
    });

    const response = await res.text();
    let data: unknown;
    try {
      data = response ? JSON.parse(response) : {};
    } catch {
      data = {error: response};
    }

    if (!res.ok) {
      const message = typeof data === "object" && data !== null && "error" in data &&
        typeof data.error === "string" ? data.error : "Request failed";
      throw new Error(message);
    }

    return data as T;
  };

  const addFiles = (files: File[]) => {
    if (busy) {
      setStatus("Wait for the current generation to finish before adding screenshots.");
      return;
    }
    const add = files
      .filter(isImageFile)
      .map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        url: URL.createObjectURL(file),
      }));

    if (add.length) {
      setMedia((m) => [...m, ...add]);
    }
    const unsupported = files.filter((file) => !isImageFile(file) && !file.type.startsWith("audio/"));
    if (unsupported.length) {
      setStatus(`Skipped unsupported file${unsupported.length === 1 ? "" : "s"}: ${unsupported.map((f) => f.name).join(", ")}`);
    }
  };

  const addAudio = async (files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("audio/"))) {
      try {
        setStatus(`Uploading ${file.name}...`);

        const form = new FormData();
        form.append("audio", file);

        const up = await post<{filename: string}>("/api/upload-audio", form, false);

        const r = await loadPeaks(`${API}/files/${up.filename}`);

        setPeaks((p) => ({...p, [up.filename]: r.peaks}));

        const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        setMusic((m) => [
          ...m,
          {
            id,
            src: up.filename,
            name: file.name,
            start: 0,
            duration: r.duration,
            volume: 0.35,
          },
        ]);

        setStatus(`Added ${file.name}`);
      } catch (e: any) {
        setStatus(`Could not add ${file.name}: ${e.message}`);
      }
    }
  };

  const patchMusic = (id: string, patch: Partial<Music>) =>
    setMusic((all) => all.map((k) => (k.id === id ? {...k, ...patch} : k)));

  const run = async () => {
    if (!media.length || busy) return;

    setBusy(true);
    setRecipe(null);
    setPast([]);
    setFuture([]);
    setVideoUrl("");
    setProjectId("");
    setSel(0);
    setSelAudio("");
    setFrame(0);
    setMarkers([]);

    try {
      const names: string[] = [];
      const uploadedById: Record<string, string> = {};
      const failures: string[] = [];

      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        setStatus(`Uploading and analyzing ${i + 1}/${media.length}: ${item.file.name}`);
        try {
          const form = new FormData();
          form.append("screenshot", item.file);
          const up = await post<{filename: string}>("/api/upload", form, false);
          uploadedById[item.id] = up.filename;
          await post("/api/analyze", JSON.stringify({filename: up.filename}));
          names.push(up.filename);
        } catch (e) {
          failures.push(`${item.file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      setMedia((m) => m.map((x) => ({...x, server: uploadedById[x.id] || x.server})));
      if (failures.length) {
        throw new Error(
          `Analyzed ${names.length} of ${media.length} screenshots; generation stopped so none are silently omitted. ${failures.join("; ")}`,
        );
      }

      setStatus("Directing with Gemini and recording voiceover...");

      const rc = await post<{id: string; recipe: Recipe; voiceError: string}>(
        "/api/recipe",
        JSON.stringify({filenames: names, voice}),
      );

      setRecipe(rc.recipe);
      setProjectId(rc.id);

      setStatus(
        rc.voiceError
          ? `Ready, but voice failed: ${rc.voiceError}`
          : `Ready: ${rc.recipe.scenes.length} scenes`,
      );
    } catch (e: any) {
      setStatus(e.message || "Could not reach the server on port 4000.");
    } finally {
      setBusy(false);
    }
  };

  const exportVideo = async () => {
    if (!recipe || busy) return;

    setBusy(true);
    setStatus("Exporting (can take a few minutes)...");

    try {
      const d = await post<{video: string}>(
        "/api/render",
        JSON.stringify({id: projectId, recipe: {...recipe, music}}),
      );

      const blob = await (await fetch(d.video)).blob();

      setVideoUrl(URL.createObjectURL(blob));
      setShowExport(true);
      player.current?.pause();
      setStatus("Export done");
    } catch (e: any) {
      setStatus(e.message || "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const resetProject = () => {
    if (
      (has || media.length) &&
      !window.confirm("Start a new project? Unsaved changes will be lost.")
    ) {
      return;
    }

    player.current?.pause();

    setRecipe(null);
    setPast([]);
    setFuture([]);
    setMedia([]);
    setMusic([]);
    setMarkers([]);
    setVideoUrl("");
    setProjectId("");
    setSel(0);
    setSelAudio("");
    setFrame(0);
    setTab("cut");
    setStatus("");
  };

  const pushHistory = (label: string, snapshot: Recipe) => {
    setPast((p) => [...p, {label, recipe: snapshot}]);
    setFuture([]);
  };

  const commit = (label: string, next: Recipe) => {
    if (recipe) {
      pushHistory(label, recipe);
    }

    setRecipe(next);
  };

  const undoSteps = (n: number) => {
    if (!recipe || n < 1 || n > past.length) return;

    const take = past.slice(past.length - n);

    const afters = [...take.slice(1).map((t) => t.recipe), recipe];

    setFuture((f) => [
      ...take.map((t, i) => ({label: t.label, recipe: afters[i]})),
      ...f,
    ]);

    setPast(past.slice(0, past.length - n));
    setRecipe(take[0].recipe);

    setSel((s) => Math.min(s, take[0].recipe.scenes.length - 1));
  };

  const undo = () => undoSteps(1);

  const redo = () => {
    if (!recipe || !future.length) return;

    const [nx, ...rest] = future;

    setFuture(rest);

    setPast((p) => [...p, {label: nx.label, recipe}]);

    setRecipe(nx.recipe);

    setSel((s) => Math.min(s, nx.recipe.scenes.length - 1));
  };

  const seekTo = (f: number) => {
    if (!total) return;

    const c = Math.max(0, Math.min(total - 1, Math.round(f)));

    player.current?.seekTo(c);
    setFrame(c);
    setSel(sceneAt(c));
    setSelAudio("");
  };

  const selectScene = (i: number) => seekTo(starts[i]);

  const jump = (d: number) =>
    seekTo(
      starts[Math.max(0, Math.min(frames.length - 1, sceneAt(frame) + d))],
    );

  const toggle = () => player.current?.toggle();

  const stop = () => {
    player.current?.pause();
    seekTo(0);
  };

  const scrubAt = (clientX: number) => {
    const el = scrubRef.current;
    if (!el) return;

    seekTo(((clientX - el.getBoundingClientRect().left - PAD) / pps) * fps);
  };

  const zoom = (d: number) => setPps((v) => Math.max(20, Math.min(200, v + d)));

  const fit = () => {
    const w = tlRef.current?.clientWidth ?? 800;

    setPps(
      Math.max(
        20,
        Math.min(200, (w - PAD * 2 - 80) / Math.max(totalSec, 1)),
      ),
    );
  };

  const addMarker = () => {
    if (!has) return;

    const t = Math.round((frame / fps) * 10) / 10;

    setMarkers((m) => (m.includes(t) ? m : [...m, t].sort((a, b) => a - b)));

    setStatus(`Marker added at ${t}s`);
  };

  const moveClip = (d: number) => {
    if (!recipe || selAudio) return;

    const j = sel + d;

    if (j < 0 || j >= recipe.scenes.length) {
      return;
    }

    const scenes = [...recipe.scenes];

    [scenes[sel], scenes[j]] = [scenes[j], scenes[sel]];

    commit("Move scene", {...recipe, scenes});

    setSel(j);
  };

  const dup = () => {
    if (!recipe || selAudio) return;

    const s = recipe.scenes[sel];
    const scenes = [...recipe.scenes];

    scenes.splice(sel + 1, 0, {...s, id: `${s.id}-c${Date.now()}`});

    commit("Duplicate scene", {...recipe, scenes});

    setSel(sel + 1);
  };

  const del = () => {
    if (selAudio) {
      setMusic((m) => m.filter((k) => k.id !== selAudio));
      setSelAudio("");
      return;
    }

    if (!recipe || recipe.scenes.length < 2) {
      return;
    }

    commit("Delete scene", {
      ...recipe,
      scenes: recipe.scenes.filter((_, k) => k !== sel),
    });

    setSel(Math.max(0, sel - 1));
  };

  const setLen = (i: number, v: number) => {
    if (!recipe || !Number.isFinite(v)) {
      return;
    }

    const s = recipe.scenes[i];

    const len = Math.min(30, Math.max(minLen(s), Math.round(v * 10) / 10));

    if (len === s.duration) return;

    commit("Scene length", {
      ...recipe,
      scenes: recipe.scenes.map((x, k) => (k === i ? {...x, duration: len} : x)),
    });
  };

  const trimToPlayhead = () => {
    if (!recipe) return;

    const i = sceneAt(frame);

    setLen(i, (frame - starts[i]) / fps + (i < frames.length - 1 ? OVERLAP : 0));
  };

  const resizeScene = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (!recipe) return;

    const base = recipe;
    const x0 = e.clientX;
    const d0 = base.scenes[i].duration;
    const lo = minLen(base.scenes[i]);

    let latest = d0;

    const mv = (ev: PointerEvent) => {
      latest = Math.min(
        30,
        Math.max(lo, Math.round((d0 + (ev.clientX - x0) / pps) * 10) / 10),
      );

      setRecipe({
        ...base,
        scenes: base.scenes.map((s, k) =>
          k === i ? {...s, duration: latest} : s,
        ),
      });
    };

    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);

      if (latest !== d0) {
        pushHistory("Trim scene", base);
      }
    };

    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const dragMusic = (e: React.PointerEvent, m: Music) => {
    e.stopPropagation();

    setSelAudio(m.id);

    const x0 = e.clientX;
    const s0 = m.start;

    const mv = (ev: PointerEvent) =>
      patchMusic(m.id, {
        start: Math.max(0, Math.round((s0 + (ev.clientX - x0) / pps) * 10) / 10),
      });

    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const resizeTimeline = (e: React.PointerEvent) => {
    e.preventDefault();

    const y0 = e.clientY;
    const h0 = tlH;

    const mv = (ev: PointerEvent) =>
      setTlH(
        Math.max(
          150,
          Math.min(window.innerHeight * 0.6, h0 - (ev.clientY - y0)),
        ),
      );

    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const setBg = (k: "from" | "to", v: string) =>
    recipe &&
    setRecipe({
      ...recipe,
      video: {
        ...recipe.video,
        background: {...recipe.video.background, [k]: v},
      },
    });

  hk.current = {
    toggle,
    undo,
    redo,
    del,
    marker: addMarker,
    step: (n: number) => seekTo(frame + n),
    fps,
  };

  let visible = media
    .filter((m) => m.file.name.toLowerCase().includes(search.toLowerCase()))
    .filter((m) =>
      filterMode === 0
        ? true
        : filterMode === 1
          ? usedOf(m) === true
          : usedOf(m) !== true,
    );

  if (sortName) {
    visible = [...visible].sort((a, b) =>
      a.file.name.localeCompare(b.file.name),
    );
  }

  const totalBytes = media.reduce((a, m) => a + m.file.size, 0);

  const onThumb = (m: MediaItem) => {
    if (selectMode) {
      setPicked((p) =>
        p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id],
      );

      return;
    }

    if (recipe && m.server) {
      const i = recipe.scenes.findIndex((s) => s.source === m.server);

      if (i >= 0) {
        selectScene(i);
      }
    }
  };

  const removePicked = () => {
    setMedia((m) => m.filter((x) => !picked.includes(x.id)));

    setPicked([]);
    setSelectMode(false);
  };

  const noScene = !has || !!selAudio;

  const menus: [string, MenuItem[]][] = [
    [
      "File",
      [
        {label: "New project", run: resetProject},
        {label: "Export video", run: exportVideo, disabled: !has || busy},
      ],
    ],
    [
      "Edit",
      [
        {label: "Undo", hint: "Ctrl+Z", run: undo, disabled: !past.length},
        {label: "Redo", hint: "Ctrl+Y", run: redo, disabled: !future.length},
      ],
    ],
    [
      "Trim",
      [{label: "Trim end to playhead", run: trimToPlayhead, disabled: !has}],
    ],
    [
      "Clip",
      [
        {
          label: "Move earlier",
          run: () => moveClip(-1),
          disabled: noScene || sel === 0,
        },
        {
          label: "Move later",
          run: () => moveClip(1),
          disabled: noScene || !recipe || sel >= recipe.scenes.length - 1,
        },
        {label: "Duplicate", run: dup, disabled: noScene},
        {
          label: "Delete",
          hint: "Del",
          run: del,
          disabled: !selAudio && (!recipe || recipe.scenes.length < 2),
        },
      ],
    ],
    [
      "Mark",
      [
        {label: "Add marker", hint: "M", run: addMarker, disabled: !has},
        {
          label: "Clear markers",
          run: () => setMarkers([]),
          disabled: !markers.length,
        },
      ],
    ],
    [
      "View",
      [
        {label: "Zoom in", run: () => zoom(15)},
        {label: "Zoom out", run: () => zoom(-15)},
        {label: "Fit timeline", run: fit, disabled: !has},
      ],
    ],
  ];

  const clipItems: MenuItem[] = [
    ...(recipe?.scenes.map((s, i) => ({
      label: `Scene ${i + 1}`,
      hint: isShot(s) ? s.camera.to.slice(0, 16) : s.kind,
      run: () => selectScene(i),
    })) ?? []),

    ...music.map((m, k) => ({
      label: `Music ${k + 1}`,
      hint: m.name.slice(0, 14),
      run: () => setSelAudio(m.id),
    })),
  ];

  const histItems: MenuItem[] = past.length
    ? [...past].reverse().map((h, d) => ({
        label: h.label,
        hint: d === 0 ? "latest" : "",
        run: () => undoSteps(d + 1),
      }))
    : [{label: "No changes yet", disabled: true}];

  const ruler: React.ReactNode[] = [];
  const sub = pps >= 60 ? 5 : 2;

  for (let s = 0; s <= Math.ceil(endSec) + 1; s++) {
    ruler.push(
      <div
        key={`M${s}`}
        className="absolute bottom-0 h-2.5 w-px bg-[#6c6c75]"
        style={{left: PAD + s * pps}}
      >
        {(pps >= 45 || s % 2 === 0) && (
          <span className="absolute bottom-0.5 left-[5px] text-[10.5px] text-[#8b8b94]">
            {s}s
          </span>
        )}
      </div>,
    );

    for (let k = 1; k < sub; k++) {
      ruler.push(
        <div
          key={`m${s}-${k}`}
          className="absolute bottom-0 h-1.5 w-px bg-[#3f3f46]"
          style={{left: PAD + s * pps + (k * pps) / sub}}
        />,
      );
    }
  }

  return (
    <div
      className="fixed inset-0 flex select-none bg-[#0a0a0b] font-sans text-[13px] leading-[1.3] text-[#eceff1]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();

        const fs = Array.from(e.dataTransfer.files);

        addFiles(fs);
        addAudio(fs);
      }}
    >
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));

          e.target.value = "";
        }}
      />

      <input
        ref={audioPicker}
        type="file"
        multiple
        hidden
        accept="audio/*"
        onChange={(e) => {
          addAudio(Array.from(e.target.files ?? []));

          e.target.value = "";
        }}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden border border-[#232327] bg-[#141416]">
        {/* TOP BAR */}
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#232327] px-3">
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] bg-transparent text-[#d9dadf] hover:bg-[#212125] disabled:cursor-default disabled:opacity-[.38]"
              onClick={resetProject}
              title="New project"
            >
              <Icon n="back" />
            </button>

            <input
              className="w-[190px] rounded-lg border-0 bg-transparent px-2 py-1.5 text-[13px] outline-none focus:bg-[#212125]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
            />
          </div>

          <nav className="flex items-center">
            {menus.map(([label, items]) => (
              <div key={label} className="relative flex" data-menu>
                <button
                  className={`px-[18px] leading-[18px] text-[#c9cace] hover:text-white ${
                    openMenu === label ? "text-white" : ""
                  }`}
                  onClick={() => setOpenMenu(openMenu === label ? "" : label)}
                >
                  {label}
                </button>

                {openMenu === label && (
                  <Pop items={items} close={() => setOpenMenu("")} />
                )}
              </div>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-2.5">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[#f5c518] px-4 py-2 font-bold text-[#111] disabled:cursor-default disabled:opacity-[.38]"
              disabled={!has || busy}
              onClick={exportVideo}
            >
              <Icon n="cloudUp" size={16} />
              Export
            </button>

            <div className="relative flex" data-menu>
              <button
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-transparent text-[#d9dadf] hover:bg-[#212125]"
                onClick={() => setOpenMenu(openMenu === "more" ? "" : "more")}
              >
                <Icon n="more" sw={3} />
              </button>

              {openMenu === "more" && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[100] min-w-[250px] rounded-xl border border-[#2e2e34] bg-[#1c1c20] p-3 text-[#cfd0d6] leading-[1.9] shadow-[0_14px_40px_rgba(0,0,0,.6)]">
                  <div>
                    <b className="inline-block min-w-[92px] text-white">Space</b>
                    Play / pause
                  </div>
                  <div>
                    <b className="inline-block min-w-[92px] text-white">← →</b>
                    Step 1 frame (Shift: 1s)
                  </div>
                  <div>
                    <b className="inline-block min-w-[92px] text-white">M</b>
                    Add marker
                  </div>
                  <div>
                    <b className="inline-block min-w-[92px] text-white">
                      Delete
                    </b>
                    Remove clip
                  </div>
                  <div>
                    <b className="inline-block min-w-[92px] text-white">
                      Ctrl+Z / Y
                    </b>
                    Undo / redo
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="flex min-h-0 flex-1 gap-px bg-[#232327]">
          <section className="flex min-w-0 flex-[1.5] flex-col bg-[#141416]">
            <div className="grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-3">
              <button
                className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] hover:bg-[#2a2a30] disabled:cursor-default disabled:opacity-[.38]"
                onClick={fit}
                disabled={!has}
                title="Fit timeline"
              >
                <Icon n="frame" />
              </button>

              <div className="overflow-hidden text-center">
                <div className="truncate whitespace-nowrap">
                  <b className="text-[14px] font-semibold">
                    Timeline 1 -{" "}
                    {has ? `${recipe!.scenes.length} scenes` : "Empty"}
                  </b>
                  <span className="ml-2.5 text-[#8b8b94]">
                    1080p ‖ {fps} fps ▾
                  </span>
                </div>
              </div>

              <div className="flex overflow-hidden rounded-[10px] border border-[#2e2e34] bg-[#212125]">
                <button
                  className="inline-flex h-[34px] w-[42px] items-center justify-center text-[#d9dadf] hover:bg-[#2a2a30]"
                  onClick={() => setTab("edit")}
                  title="Scene"
                >
                  <Icon n="pen" />
                </button>

                <button
                  className="inline-flex h-[34px] w-[42px] items-center justify-center border-l border-[#2e2e34] text-[#d9dadf] hover:bg-[#2a2a30] disabled:cursor-default disabled:opacity-[.38]"
                  onClick={run}
                  disabled={!media.length || busy}
                  title="Generate ad"
                >
                  <Icon n="wand" />
                </button>

                <button
                  className="inline-flex h-[34px] w-[42px] items-center justify-center border-l border-[#2e2e34] text-[#d9dadf]"
                  onClick={() => setTab("color")}
                  title="Background"
                >
                  <span className="h-[18px] w-[18px] rounded-full bg-[radial-gradient(circle,#212125_0_40%,transparent_42%),conic-gradient(#ff4d4d,#ffd24d,#4dff88,#4dd2ff,#7a4dff,#ff4dd2,#ff4d4d)]" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
              {preview ? (
                <>
                  <Player
                    ref={player}
                    component={Ad}
                    inputProps={{recipe: preview}}
                    durationInFrames={Math.max(1, total)}
                    fps={fps}
                    compositionWidth={recipe!.video.width}
                    compositionHeight={recipe!.video.height}
                    clickToPlay
                    style={{width: "100%", height: "100%"}}
                  />

                  {!playing && (
                    <button
                      className="absolute left-1/2 top-1/2 grid h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(130,130,130,.5)] pl-1 text-white backdrop-blur hover:bg-[rgba(150,150,150,.6)]"
                      onClick={toggle}
                    >
                      <Icon n="play" fill size={34} />
                    </button>
                  )}
                </>
              ) : (
                <div className="flex max-w-[420px] flex-col items-center gap-3 p-6 text-center">
                  <div className="grid h-[72px] w-[72px] place-items-center rounded-[20px] border border-[#2e2e34] bg-gradient-to-br from-[#1c1c22] to-[#26262e] text-[#f5c518]">
                    <Icon n="film" size={32} />
                  </div>

                  <h2 className="text-xl font-semibold">Start your first ad</h2>

                  <p className="leading-[1.55] text-[#8b8b94]">
                    Add your product screenshots, then press Generate. The AI
                    plans the zooms, clicks and voiceover for you.
                  </p>

                  <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-[#2e2e34] bg-[#212125] px-4 py-2 font-medium text-[#e6e7ea]"
                      onClick={() => picker.current?.click()}
                    >
                      <Icon n="plus" size={16} />
                      Add screenshots
                    </button>

                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[#f5c518] px-4 py-2 font-bold text-[#111] disabled:cursor-default disabled:opacity-[.38]"
                      disabled={!media.length || busy}
                      onClick={run}
                    >
                      <Icon n="sparkle" size={16} />
                      Generate ad
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-[34px] w-[46px] items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={() => seekTo(frame - fps)}
                >
                  <Icon n="rew" />
                </button>

                <div className="rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3.5 py-2 font-mono text-[13px]">
                  {tc(frame, fps)}
                </div>

                <button
                  className="inline-flex h-[34px] w-[46px] items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={() => seekTo(frame + fps)}
                >
                  <Icon n="fwd" />
                </button>
              </div>

              <div className="flex overflow-hidden rounded-xl border border-[#2e2e34] bg-[#212125]">
                <button
                  className="grid h-10 w-[54px] place-items-center text-[#d9dadf] hover:bg-[#33333a] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={() => jump(-1)}
                >
                  <Icon n="prev" fill />
                </button>

                <button
                  className="grid h-10 w-[54px] place-items-center border-l border-[#2e2e34] text-[#d9dadf] hover:bg-[#33333a] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={stop}
                >
                  <Icon n="stop" fill />
                </button>

                <button
                  className="grid h-10 w-16 place-items-center border-l border-[#2e2e34] bg-[#2d2d34] text-[#d9dadf] hover:bg-[#33333a] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={toggle}
                >
                  <Icon n={playing ? "pause" : "play"} fill />
                </button>

                <button
                  className="grid h-10 w-[54px] place-items-center border-l border-[#2e2e34] text-[#d9dadf] hover:bg-[#33333a] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={() => jump(1)}
                >
                  <Icon n="next" fill />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3 py-2 text-[#cfd0d6]">
                  Fit to screen
                  <Icon n="chev" size={14} />
                </div>

                <button
                  className="inline-flex h-[34px] w-[46px] items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={() => player.current?.requestFullscreen()}
                >
                  <Icon n="expand" />
                </button>
              </div>
            </div>
          </section>

          {/* SIDE PANEL */}
          <aside className="flex min-w-[300px] max-w-[430px] flex-1 flex-col bg-[#18181b]">
            {tab === "cut" ? (
              <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2.5">
                <div className="flex items-center">
                  <span className="mr-2.5 ml-1 inline-flex gap-[3px]">
                    <i className="h-[18px] w-0.5 rounded bg-[#55555d]" />
                    <i className="h-[18px] w-0.5 rounded bg-[#55555d]" />
                    <i className="h-[18px] w-0.5 rounded bg-[#55555d]" />
                  </span>

                  <button
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-2.5 py-1.5 font-medium text-[#f5c518]"
                    onClick={() => setFilterMode((f) => (f + 1) % 3)}
                  >
                    <Icon n="sliders" size={16} />
                    Filters
                  </button>
                </div>

                <h3 className="text-[15px] font-semibold">Media</h3>

                <div className="flex justify-end gap-0.5">
                  <button
                    className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125]"
                    onClick={() => setSortName((s) => !s)}
                    title="Sort by name"
                  >
                    <Icon n="sort" />
                  </button>

                  <button
                    className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125]"
                    onClick={() => setDense((d) => !d)}
                    title="Grid size"
                  >
                    <Icon n={dense ? "grid" : "list"} />
                  </button>

                  <button
                    className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125]"
                    onClick={() => setShowSearch((s) => !s)}
                    title="Search"
                  >
                    <Icon n="search" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-14 shrink-0 items-center justify-center px-2.5">
                <h3 className="text-[15px] font-semibold">
                  {PANEL_TITLE[tab]}
                </h3>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-1">
              {tab === "cut" && (
                <>
                  {showSearch && (
                    <input
                      className="mb-2.5 w-full rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3 py-2 outline-none"
                      placeholder="Search files..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  )}

                  {filterMode > 0 && (
                    <p className="mb-2 text-[11.5px] text-[#8b8b94]">
                      Showing: {FILTERS[filterMode]}
                    </p>
                  )}

                  {media.length === 0 ? (
                    <button
                      className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#3a3a42] bg-[rgba(255,255,255,.015)] text-[#8b8b94] hover:border-[#f5c518] hover:bg-[rgba(245,197,24,.04)]"
                      onClick={() => picker.current?.click()}
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[#2e2e34] bg-[#212125] text-[#f5c518]">
                        <Icon n="upload" size={26} />
                      </span>

                      <b className="text-[14px] font-semibold text-white">
                        Drop screenshots here
                      </b>

                      <small>or click to browse · PNG, JPG, WEBP</small>
                    </button>
                  ) : (
                    <div
                      className={`grid gap-x-2 gap-y-2.5 ${
                        dense ? "grid-cols-4" : "grid-cols-2"
                      }`}
                    >
                      {visible.map((m) => {
                        const used = usedOf(m);
                        const isPicked = picked.includes(m.id);
                        const active = !!m.server && scene?.source === m.server;

                        return (
                          <div
                            key={m.id}
                            className="relative min-w-0 cursor-pointer"
                            onClick={() => onThumb(m)}
                          >
                            <div
                              className={`relative overflow-hidden rounded-md border-[1.5px] bg-black bg-cover bg-left-top ${
                                dense ? "aspect-[1/1.05]" : "aspect-[16/10]"
                              } ${
                                active || isPicked
                                  ? "border-[#f5c518]"
                                  : "border-transparent"
                              }`}
                              style={{backgroundImage: `url(${m.url})`}}
                            >
                              <span className="absolute bottom-1 left-1 flex text-white drop-shadow-[0_1px_2px_#000]">
                                <Icon n="image" size={12} />
                              </span>

                              <span className="absolute bottom-[3px] right-1 rounded bg-[rgba(0,0,0,.7)] px-1.5 py-px text-[10px]">
                                {size(m.file.size)}
                              </span>

                              {isPicked && (
                                <span className="absolute right-1 top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#f5c518] text-black">
                                  <Icon n="check" size={12} sw={3} />
                                </span>
                              )}
                            </div>

                            <div
                              className={`mt-1 h-[3px] rounded-sm ${
                                used === true
                                  ? "bg-[#32c26a]"
                                  : used === false
                                    ? "w-[40%] bg-[#e5484d]"
                                    : "bg-transparent"
                              }`}
                            />

                            <div className="mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-[#8b8b94]">
                              {m.file.name}
                            </div>
                          </div>
                        );
                      })}

                      <button
                        className={`grid place-items-center rounded-md border border-dashed border-[#2e2e34] text-[#8b8b94] hover:border-[#f5c518] hover:text-[#f5c518] ${
                          dense ? "aspect-[1/1.05]" : "aspect-[16/10]"
                        }`}
                        onClick={() => picker.current?.click()}
                      >
                        <Icon n="plus" size={20} />
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === "edit" &&
                (scene ? (
                  <div className="flex flex-col gap-3 py-1.5">
                    {isShot(scene) ? (
                      <div
                        className="aspect-video rounded-[10px] border border-[#2e2e34] bg-cover bg-left-top"
                        style={{
                          backgroundImage: `url(${API}/files/${scene.source})`,
                        }}
                      />
                    ) : (
                      <div
                        className="grid aspect-video place-items-center rounded-[10px] border border-[#2e2e34] p-4 text-center text-lg font-semibold"
                        style={{
                          background: `linear-gradient(135deg, ${bg?.from}, ${bg?.to})`,
                        }}
                      >
                        {scene.title || scene.lines?.join(" · ")}
                      </div>
                    )}

                    <div className="flex flex-col gap-2.5 rounded-xl border border-[#2e2e34] bg-[#212125] p-3">
                      <div className="flex items-center justify-between gap-2.5">
                        <span>Scene</span>
                        <b>
                          {sel + 1} of {recipe!.scenes.length}
                        </b>
                      </div>

                      <div className="flex items-center justify-between gap-2.5">
                        <span>Target</span>

                        <span className="font-mono text-[#86efac]">
                          {isShot(scene) ? scene.camera.to : scene.kind}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2.5">
                        <span>Length (s)</span>

                        <input
                          key={`${scene.id}-${scene.duration}`}
                          className="w-[90px] rounded-lg border border-[#2e2e34] bg-[#0a0a0b] px-2 py-1.5 outline-none"
                          type="number"
                          min={2}
                          max={30}
                          step={0.1}
                          defaultValue={scene.duration}
                          onBlur={(e) => setLen(sel, Number(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-[10px] bg-[#212125] p-3 italic leading-[1.55] text-[#d6d7db]">
                      “{scene.voiceover}”
                    </div>

                    <p className="text-xs leading-[1.55] text-[#8b8b94]">
                      Tip: drag the yellow handle on the right edge of a clip to
                      change its length.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-[200px] h-full flex-col items-center justify-center gap-2.5 p-5 text-center text-[#8b8b94]">
                    <Icon n="curve" size={28} />
                    <p>Generate an ad to edit its scenes.</p>
                  </div>
                ))}

              {tab === "color" &&
                (recipe && bg ? (
                  <div className="flex flex-col gap-3 py-1.5">
                    <div
                      className="h-[90px] rounded-xl border border-[#2e2e34]"
                      style={{
                        background: `linear-gradient(135deg, ${bg.from}, ${bg.to})`,
                      }}
                    />

                    {(["from", "to"] as const).map((k) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-2.5"
                      >
                        <span>{k === "from" ? "Start colour" : "End colour"}</span>

                        <input
                          type="color"
                          className="h-[30px] w-[46px] cursor-pointer rounded-md border border-[#2e2e34] bg-transparent p-0"
                          value={bg[k]}
                          onFocus={() => {
                            bgSnap.current = recipe;
                          }}
                          onChange={(e) => setBg(k, e.target.value)}
                          onBlur={() => {
                            if (bgSnap.current && bgSnap.current !== recipe) {
                              pushHistory("Background", bgSnap.current);
                            }

                            bgSnap.current = null;
                          }}
                        />
                      </div>
                    ))}

                    <div className="text-xs leading-[1.55] text-[#8b8b94]">
                      Presets
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                      {PRESETS.map(([a, b]) => (
                        <button
                          key={a + b}
                          className="aspect-square rounded-lg border border-[#2e2e34]"
                          style={{
                            background: `linear-gradient(135deg, ${a}, ${b})`,
                          }}
                          onClick={() =>
                            commit("Background", {
                              ...recipe,
                              video: {
                                ...recipe.video,
                                background: {from: a, to: b},
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[200px] h-full flex-col items-center justify-center gap-2.5 p-5 text-center text-[#8b8b94]">
                    <Icon n="drop" size={28} />
                    <p>Generate an ad to change its background.</p>
                  </div>
                ))}

              {tab === "sound" && (
                <div className="flex flex-col gap-3 py-1.5">
                  <div className="flex flex-col gap-2.5 rounded-xl border border-[#2e2e34] bg-[#212125] p-3">
                    <div className="text-xs leading-[1.55] text-[#8b8b94]">
                      Narrator voice. Used the next time you press Generate.
                    </div>

                    <select
                      className="w-full rounded-lg border border-[#2e2e34] bg-[#0a0a0b] px-2.5 py-2.5 outline-none"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                    >
                      {VOICES.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-4 py-2 font-medium text-[#e6e7ea]"
                    onClick={() => audioPicker.current?.click()}
                  >
                    <Icon n="plus" size={16} />
                    Add your own audio
                  </button>

                  {music.length === 0 && (
                    <p className="text-xs leading-[1.55] text-[#8b8b94]">
                      Add background music or your own voice recording (MP3 or
                      WAV). Each file gets its own lane under the video. Drag it
                      on the timeline to position it.
                    </p>
                  )}

                  {music.map((m, k) => (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-2.5 rounded-xl border bg-[#212125] p-3 ${
                        m.id === selAudio
                          ? "border-[#f5c518]"
                          : "border-[#2e2e34]"
                      }`}
                      onClick={() => setSelAudio(m.id)}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <b className="overflow-hidden text-ellipsis whitespace-nowrap">
                          Music {k + 1} · {m.name}
                        </b>

                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125]"
                          onClick={(e) => {
                            e.stopPropagation();

                            setMusic((all) => all.filter((x) => x.id !== m.id));
                          }}
                        >
                          <Icon n="x" size={14} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2.5">
                        <span className="text-xs text-[#8b8b94]">Start (s)</span>

                        <input
                          className="w-[90px] rounded-lg border border-[#2e2e34] bg-[#0a0a0b] px-2 py-1.5 outline-none"
                          type="number"
                          min={0}
                          step={0.1}
                          value={m.start}
                          onChange={(e) =>
                            patchMusic(m.id, {
                              start: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2.5">
                        <span className="text-xs text-[#8b8b94]">Volume</span>

                        <input
                          className="flex-1 accent-[#f5c518]"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={m.volume}
                          onChange={(e) =>
                            patchMusic(m.id, {volume: Number(e.target.value)})
                          }
                        />

                        <span className="w-9 text-right">
                          {Math.round(m.volume * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {tab === "cut" && media.length > 0 && (
              <div className="flex shrink-0 items-center gap-2.5 border-t border-[#232327] p-2.5">
                <button
                  className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#f5c518] p-2.5 font-bold text-[#111] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={busy}
                  onClick={run}
                >
                  <Icon n="sparkle" size={16} />
                  Generate ad
                </button>
              </div>
            )}

            {tab === "cut" && (
              <div className="grid h-[46px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-[#232327] px-3">
                <button
                  className="inline-flex items-center gap-2 text-[#d4d5da] disabled:cursor-default disabled:opacity-[.38]"
                  disabled={!has}
                  onClick={addMarker}
                >
                  <Icon n="pin" size={16} />
                  Markers
                </button>

                <span className="text-xs text-[#8b8b94]">
                  {media.length} Items ‖ {size(totalBytes)}
                </span>

                {selectMode && picked.length > 0 ? (
                  <button
                    className="inline-flex items-center justify-self-end gap-2 text-[#ff7b7f]"
                    onClick={removePicked}
                  >
                    <Icon n="trash" size={16} />
                    Remove ({picked.length})
                  </button>
                ) : (
                  <button
                    className={`inline-flex items-center justify-self-end gap-2 ${
                      selectMode ? "text-[#f5c518]" : "text-[#d4d5da]"
                    } disabled:cursor-default disabled:opacity-[.38]`}
                    disabled={!media.length}
                    onClick={() => {
                      setSelectMode((s) => !s);
                      setPicked([]);
                    }}
                  >
                    <Icon n="checkc" size={16} />
                    {selectMode ? "Done" : "Select"}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* RESIZER */}
        <div
          className="grid h-4 shrink-0 cursor-row-resize place-items-center border-t border-[#232327] bg-[#141416]"
          onPointerDown={resizeTimeline}
        >
          <i className="h-1 w-11 rounded bg-[#3a3a41]" />
        </div>

        {/* CLIP TOOLBAR */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2.5 bg-[#141416] px-3">
          <div className="flex items-center gap-2">
            <div className="relative flex" data-menu>
              <button
                className="flex h-10 items-center gap-2.5 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-2.5 text-[#cfd0d6]"
                onClick={() => setOpenMenu(openMenu === "clip" ? "" : "clip")}
              >
                <Icon n="layers" size={20} />

                <span className="text-left">
                  <small className="block text-[10px] text-[#8b8b94]">
                    Select
                  </small>

                  <b className="text-[13px] font-semibold text-white">
                    {selAudio ? "Music" : has ? `Scene ${sel + 1}` : "Clip"}
                  </b>
                </span>

                <Icon n="updown" size={14} />
              </button>

              {openMenu === "clip" && (
                <Pop
                  items={
                    clipItems.length
                      ? clipItems
                      : [{label: "No clips yet", disabled: true}]
                  }
                  close={() => setOpenMenu("")}
                />
              )}
            </div>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3.5 text-[#cfd0d6] disabled:cursor-default disabled:opacity-[.38]"
              disabled
              title="Coming soon"
            >
              <Icon n="multicam" />
              Multicam
            </button>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3.5 text-[#cfd0d6]"
              onClick={() => setTab("sound")}
            >
              <Icon n="bars" />
              Volume
            </button>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3.5 text-[#cfd0d6] disabled:cursor-default disabled:opacity-[.38]"
              disabled
              title="Coming soon"
            >
              <Icon n="anim" />
              Animation
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b8b94]">Actions with the clip:</span>

            <button
              className="inline-flex h-10 w-11 items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
              title="Move earlier"
              disabled={noScene || sel === 0}
              onClick={() => moveClip(-1)}
            >
              <Icon n="left" />
            </button>

            <button
              className="inline-flex h-10 w-11 items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
              title="Move later"
              disabled={noScene || !recipe || sel >= recipe.scenes.length - 1}
              onClick={() => moveClip(1)}
            >
              <Icon n="right" />
            </button>

            <button
              className="inline-flex h-10 w-11 items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
              title="Duplicate"
              disabled={noScene}
              onClick={dup}
            >
              <Icon n="copy" />
            </button>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3.5 text-[#cfd0d6] disabled:cursor-default disabled:opacity-[.38]"
              disabled={!selAudio && (!recipe || recipe.scenes.length < 2)}
              onClick={del}
            >
              <Icon n="trash" />
              Delete
            </button>

            <button
              className={`inline-flex h-10 w-11 items-center justify-center rounded-[10px] border border-[#2e2e34] bg-[#212125] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38] ${
                busy ? "animate-spin" : ""
              }`}
              title="Generate ad"
              disabled={!media.length || busy}
              onClick={run}
            >
              <Icon n="loader" />
            </button>
          </div>
        </div>

        {/* TIMELINE */}
        <div
          className="relative flex shrink-0 border-t border-[#232327] bg-[#101012]"
          style={{height: tlH}}
        >
          <div className="relative min-w-0 flex-1 overflow-auto" ref={tlRef}>
            <div
              className="relative min-h-full pb-3.5"
              style={{width: innerW}}
            >
              <div
                className="cursor-pointer"
                ref={scrubRef}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  scrubAt(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) {
                    scrubAt(e.clientX);
                  }
                }}
              >
                <div className="relative h-[26px]">{ruler}</div>

                <div className="relative h-3.5">
                  {recipe?.scenes.map((s, i) => (
                    <i
                      key={s.id}
                      className="absolute top-[5px] h-[3px] rounded-sm bg-[rgba(138,63,212,.55)]"
                      style={{
                        left: PAD + (starts[i] / fps) * pps,
                        width: Math.min(40, (frames[i] / fps) * pps * 0.5),
                      }}
                    />
                  ))}

                  {markers.map((t) => (
                    <i
                      key={t}
                      className="absolute top-px h-3 w-[3px] rounded-sm bg-[#c58bff]"
                      style={{left: PAD + t * pps}}
                    />
                  ))}
                </div>
              </div>

              {recipe ? (
                <>
                  <div className="relative mt-1.5 h-7">
                    {recipe.scenes.map((s, i) => !isShot(s) ? null : (
                      <div
                        key={s.id}
                        className="absolute top-0 flex h-7 items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-b from-[#9a4de0] to-[#8a3fd4] px-1.5 text-[11.5px] whitespace-nowrap"
                        style={{
                          left: PAD + (starts[i] / fps + s.camera.start) * pps,
                          width: Math.max(
                            26,
                            (s.camera.end - s.camera.start) * pps - 2,
                          ),
                        }}
                      >
                        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-[#6a2bb0] text-white">
                          <Icon n="search" size={11} />
                        </span>

                        <span>Zoom · {s.camera.to}</span>

                        <span className="ml-auto grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-white/70">
                          <Icon n="link" size={9} />
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-1.5 h-14">
                    {recipe.scenes.map((s, i) => {
                      const on = i === sel && !selAudio;

                      return (
                        <div
                          key={s.id}
                          className={`absolute top-0 h-14 cursor-pointer rounded-[9px] ${
                            on ? "bg-[#2f63d8]" : "bg-[#3d424f]"
                          }`}
                          onClick={() => selectScene(i)}
                          style={{
                            left: PAD + (starts[i] / fps) * pps,
                            width: (frames[i] / fps) * pps - 2,
                          }}
                        >
                          <div
                            className="absolute bottom-0 left-0 top-0 grid w-12 place-items-center rounded-l-[9px] bg-cover bg-left-top"
                            style={
                              isShot(s)
                                ? {backgroundImage: `url(${API}/files/${s.source})`}
                                : {background: "#26262e"}
                            }
                          >
                            {!isShot(s) && <Icon n="sparkle" size={16} />}
                          </div>

                          <div className="absolute left-14 right-2 top-1.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px]">
                            <Icon n="film" size={13} />
                            {sceneLabel(s, i)}
                          </div>

                          <div
                            className="absolute bottom-3.5 h-px bg-white/75"
                            style={{
                              left: s.camera.start * pps,
                              width: (s.camera.end - s.camera.start) * pps,
                            }}
                          />

                          <div
                            className="absolute bottom-[11px] h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-white"
                            style={{left: s.camera.start * pps}}
                          />

                          <div
                            className="absolute bottom-[11px] h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-white"
                            style={{left: s.camera.end * pps}}
                          />

                          {s.actions.map((a, k) => (
                            <div
                              key={k}
                              className="absolute bottom-[3px] h-[7px] w-[7px] -translate-x-1/2 rounded-sm bg-[#f5c518]"
                              title={a.type}
                              style={{left: a.at * pps}}
                            />
                          ))}

                          {on && (
                            <>
                              <span className="absolute -left-1 top-[-2px] bottom-[-2px] z-[3] grid w-[11px] place-items-center rounded-[7px] bg-[#f5c518] after:h-4 after:w-0.5 after:rounded-sm after:bg-black/55 after:content-['']" />

                              <span
                                className="absolute -right-1 top-[-2px] bottom-[-2px] z-[3] grid w-[11px] cursor-ew-resize place-items-center rounded-[7px] bg-[#f5c518] after:h-4 after:w-0.5 after:rounded-sm after:bg-black/55 after:content-['']"
                                onPointerDown={(e) => resizeScene(e, i)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="relative mt-1.5 h-11">
                    {recipe.scenes.map((s, i) => {
                      if (!s.audio) return null;

                      const w = (s.audioSecs ?? s.duration) * pps - 2;

                      return (
                        <div
                          key={s.id}
                          className="absolute top-0 h-11 overflow-hidden rounded-lg bg-[#52ad97]"
                          style={{
                            left: PAD + (starts[i] / fps) * pps,
                            width: w,
                          }}
                        >
                          <div className="absolute left-1 top-1 z-[2] flex items-center gap-1.5 whitespace-nowrap text-[11.5px]">
                            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-[#2f7d6b] text-white">
                              <Icon n="mic" size={11} />
                            </span>
                            Voiceover {i + 1}
                          </div>

                          <Wave peaks={peaks[s.audio]} w={w} />
                        </div>
                      );
                    })}
                  </div>

                  {music.length === 0 && (
                    <div className="relative mt-1.5 h-11">
                      <div className="mx-4 flex h-full items-center rounded-lg border border-dashed border-[rgba(82,173,151,.5)] px-3 text-[11.5px] text-[#5d5d66]">
                        Add background music or your own audio in the Sound tab
                      </div>
                    </div>
                  )}

                  {music.map((m) => {
                    const w = Math.max(30, m.duration * pps);

                    return (
                      <div key={m.id} className="relative mt-1.5 h-11">
                        <div
                          className={`absolute top-0 h-11 overflow-hidden rounded-lg bg-[#52ad97] ${
                            m.id === selAudio
                              ? "shadow-[0_0_0_2px_#f5c518]"
                              : ""
                          } cursor-grab`}
                          onPointerDown={(e) => dragMusic(e, m)}
                          style={{left: PAD + m.start * pps, width: w}}
                        >
                          <div className="absolute left-1 top-1 z-[2] flex items-center gap-1.5 whitespace-nowrap text-[11.5px]">
                            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-[#2f7d6b] text-white">
                              <Icon n="music" size={11} />
                            </span>
                            {m.name}
                          </div>

                          <Wave peaks={peaks[m.src]} w={w} />
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="relative mt-1.5 h-7">
                    <div className="mx-4 flex h-full items-center rounded-lg border border-dashed border-[rgba(138,63,212,.5)] px-3 text-[11.5px] text-[#5d5d66]">
                      Zoom and focus effects appear here
                    </div>
                  </div>

                  <div className="relative mt-1.5 h-14">
                    <div className="mx-4 flex h-full items-center rounded-lg border border-dashed border-[rgba(47,99,216,.5)] px-3 text-[11.5px] text-[#5d5d66]">
                      Your clips appear here. Add screenshots, then press
                      Generate.
                    </div>
                  </div>

                  <div className="relative mt-1.5 h-11">
                    <div className="mx-4 flex h-full items-center rounded-lg border border-dashed border-[rgba(82,173,151,.5)] px-3 text-[11.5px] text-[#5d5d66]">
                      Voiceover and music appear here
                    </div>
                  </div>
                </>
              )}

              <div
                className="pointer-events-none absolute bottom-0 top-0 z-[30] w-0"
                style={{left: PAD + (frame / fps) * pps}}
              >
                <div
                  className="pointer-events-auto absolute left-[-8px] top-0 flex h-6 w-4 cursor-ew-resize items-center justify-center gap-0.5 rounded-[5px] bg-white"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    scrubAt(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) {
                      scrubAt(e.clientX);
                    }
                  }}
                >
                  <i className="h-2.5 w-[1.5px] bg-[#888]" />
                  <i className="h-2.5 w-[1.5px] bg-[#888]" />
                </div>

                <div className="absolute bottom-0 left-[-.5px] top-[22px] w-px bg-white" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-2 right-[76px] z-40 flex gap-0.5 rounded-[10px] border border-[#2e2e34] bg-[rgba(20,20,22,.92)] p-[3px]">
            <button
              className="rounded-[7px] px-2.5 py-1 text-[#cfd0d6] hover:bg-[#212125]"
              onClick={() => zoom(-15)}
            >
              −
            </button>

            <button
              className="rounded-[7px] px-2.5 py-1 text-[#cfd0d6] hover:bg-[#212125]"
              onClick={() => zoom(15)}
            >
              +
            </button>

            <button
              className="rounded-[7px] px-2.5 py-1 text-[#cfd0d6] hover:bg-[#212125] disabled:cursor-default disabled:opacity-[.38]"
              onClick={fit}
              disabled={!has}
            >
              Fit
            </button>
          </div>

          <Meter active={playing} />
        </div>

        {/* BOTTOM BAR */}
        <div className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-[#232327] bg-[#141416] px-2">
          <div className="flex gap-2">
            <button
              className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125] disabled:cursor-default disabled:opacity-[.38]"
              title="Go to start"
              disabled={!has}
              onClick={() => seekTo(0)}
            >
              <Icon n="home" />
            </button>

            <button
              className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] disabled:cursor-default disabled:opacity-[.38]"
              title="Settings coming soon"
              disabled
            >
              <Icon n="gear" />
            </button>
          </div>

          <div className="flex h-full gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.k}
                className={`relative flex h-full items-center gap-2 px-[26px] ${
                  tab === t.k
                    ? "text-[#f5c518]"
                    : "text-[#b8b9bf] hover:text-white"
                }`}
                onClick={() => setTab(t.k)}
              >
                <Icon n={t.icon} size={18} />

                {t.label}

                {tab === t.k && (
                  <span className="absolute bottom-0 left-[12%] right-[12%] h-[3px] rounded-t-[3px] bg-gradient-to-r from-transparent via-[#f5c518] to-transparent shadow-[0_-4px_14px_rgba(245,197,24,.45)]" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            <div className="relative flex" data-menu>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#2e2e34] bg-[#212125] px-3 text-[#d9dadf]"
                onClick={() => setOpenMenu(openMenu === "hist" ? "" : "hist")}
              >
                <Icon n="clock" size={16} />
                History
                <Icon n="chev" size={14} />
              </button>

              {openMenu === "hist" && (
                <Pop
                  items={histItems}
                  close={() => setOpenMenu("")}
                  right
                  up
                />
              )}
            </div>

            <button
              className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125] disabled:cursor-default disabled:opacity-[.38]"
              title="Undo"
              disabled={!past.length}
              onClick={undo}
            >
              <Icon n="undo" />
            </button>

            <button
              className="inline-flex h-[34px] w-[38px] items-center justify-center rounded-[10px] text-[#d9dadf] hover:bg-[#212125] disabled:cursor-default disabled:opacity-[.38]"
              title="Redo"
              disabled={!future.length}
              onClick={redo}
            >
              <Icon n="redo" />
            </button>
          </div>
        </div>
      </div>

      {(busy || toast) && status && (
        <div
          className={`fixed bottom-[78px] left-1/2 z-[200] flex max-h-40 max-w-[80vw] -translate-x-1/2 items-start gap-2.5 overflow-y-auto whitespace-normal break-words rounded-xl border border-[#2e2e34] bg-[rgba(28,28,32,.97)] px-4 py-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,.5)] ${
            busy ? "[&_svg]:animate-spin" : ""
          }`}
        >
          {busy && <Icon n="loader" size={16} />}

          {status}
        </div>
      )}

      {showExport && (
        <div
          className="fixed inset-0 z-[300] grid place-items-center bg-[rgba(0,0,0,.7)]"
          onClick={() => setShowExport(false)}
        >
          <div
            className="flex w-[min(760px,92vw)] flex-col gap-3.5 rounded-2xl border border-[#2e2e34] bg-[#141416] p-[18px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base">Your ad is ready</h3>

            <video
              src={videoUrl}
              controls
              autoPlay
              className="max-h-[60vh] w-full rounded-[10px] bg-black"
            />

            <div className="flex justify-end gap-2.5">
              <a
                className="inline-flex items-center gap-2 rounded-full bg-[#f5c518] px-4 py-2 font-bold text-[#111] no-underline"
                href={videoUrl}
                download={`${name || "ad"}.mp4`}
              >
                Download MP4
              </a>

              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#2e2e34] bg-[#212125] px-4 py-2 font-medium text-[#e6e7ea]"
                onClick={() => setShowExport(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}