const {GoogleGenAI} = require("@google/genai");
const fs = require("fs");
const path = require("path");

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash-lite"];
const fromEnv = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
// .env models are tried first, then the defaults as fallbacks (duplicates removed)
const MODELS = [...new Set([...fromEnv, ...DEFAULT_MODELS])];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCENE = 6;
const ALLOWED = ["cursor_move", "click", "highlight"];

const SYSTEM =
  "You are an expert SaaS product-ad editor. You direct a short ad from several screenshots using only the allowed actions. Return ONLY a JSON object. No prose, no code fences.";

const mimeOf = (f) => {
  const e = path.extname(f).toLowerCase();
  return e === ".png" ? "image/png" : e === ".webp" ? "image/webp" : "image/jpeg";
};

const usable = (e) => e.text.replace(/[^a-zA-Z0-9]/g, "").length >= 3;

const buildPrompt = (analyses) => `You are given ${analyses.length} screenshots of one product, labeled screen-1 to screen-${analyses.length}.

Detected text per screen (id | text | x,y,w,h as 0-1 fractions):
${analyses.map((a, i) =>
  `## screen-${i + 1} (${a.width}x${a.height})\n` +
  a.elements.filter(usable).map((e) => `${e.id} | ${e.text.slice(0, 40)} | ${e.x},${e.y},${e.w},${e.h}`).join("\n")
).join("\n\n")}

Create a short story-driven ad with this arc: PROBLEM, then PRODUCT REVEAL, then HOW IT SOLVES IT, then an END CARD.
Return exactly this JSON:
{
  "background": {"from": "#000000", "to": "#111111"},
  "problem": {
    "lines": ["<pain, max 6 words>", "<pain, max 6 words>", "<punchline, max 5 words>"],
    "voiceover": "<1-2 punchy sentences, max 20 words. The pain or frustration. Do NOT name the product>"
  },
  "product": {
    "name": "<product name, read from the screenshots>",
    "tagline": "<max 8 words, like 'The Screen Time alternative for Mac'>",
    "voiceover": "<one sentence, max 12 words, introduces the product by name>"
  },
  "scenes": [
    {
      "voiceover": "<2-3 short punchy sentences walking through ALL shots, max 12 words each>",
      "shots": [{"source": "screen-1", "target": "<id>", "label": "<only for a custom target>"}]
    }
  ],
  "cta": {
    "headline": "<max 6 words, e.g. 'Find out where your day went.'>",
    "url": "<website only if visible in a screenshot, else empty string>",
    "voiceover": "<one short sentence, max 12 words>"
  }
}

Rules:
- "scenes" has 1 to 3 scenes showing how the product solves the problem, one feature theme each. Group similar or related screens into the same scene. Every screen appears in exactly one shot, exactly once. Never skip a screen.
- Within a scene, shots play in order and the voiceover walks through them.
- Each shot's target: prefer an actionable control or key feature label. Never headings, browser chrome or decoration. Prefer a detected OCR id. If the control is a button/icon OCR cannot see, give a NEW id as target plus a short "label" describing it (no coordinates).
- Voiceover style: short, confident, plain spoken English. Fragments are fine ("No account." "Punch in."). No emojis, no repeated phrases. All voiceovers together read as one continuous ad.
- background: two hex colors from the first screen's dominant palette.`;

const parse = (text) => {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("No JSON in reply");
  return JSON.parse(text.slice(s, e + 1));
};

const validate = (r, analyses) => {
  const errs = [];
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!r.background || !hex.test(r.background.from) || !hex.test(r.background.to))
    errs.push("background must be two #rrggbb colors");
  const p = r.problem;
  if (!p || !Array.isArray(p.lines) || p.lines.length < 1 || p.lines.length > 3 ||
      p.lines.some((l) => typeof l !== "string" || !l.trim()) || !String(p.voiceover || "").trim())
    errs.push("problem needs 1-3 lines and a voiceover");
  const pr = r.product, c = r.cta;
  if (!pr || !String(pr.name || "").trim() || !String(pr.tagline || "").trim() || !String(pr.voiceover || "").trim())
    errs.push("product needs name, tagline and voiceover");
  if (!c || !String(c.headline || "").trim() || !String(c.voiceover || "").trim())
    errs.push("cta needs headline and voiceover");
  if (!Array.isArray(r.scenes) || !r.scenes.length || r.scenes.length > 3)
    return [...errs, "scenes must have 1-3 items"];
  const used = new Set();
  r.scenes.forEach((s, i) => {
    const k = `scene ${i + 1}`;
    if (!String(s.voiceover || "").trim()) errs.push(`${k}: voiceover missing`);
    if (!Array.isArray(s.shots) || !s.shots.length) return errs.push(`${k}: shots missing`);
    for (const sh of s.shots) {
      const idx = Number(/^screen-(\d+)$/.exec(sh.source || "")?.[1]);
      const a = analyses[idx - 1];
      if (!a) { errs.push(`${k}: unknown source ${sh.source}`); continue; }
      if (used.has(sh.source)) errs.push(`${k}: ${sh.source} used twice`);
      used.add(sh.source);
      const ids = new Set(a.elements.map((e) => e.id));
      if (sh.label) {
        if (typeof sh.target !== "string" || !sh.target || ids.has(sh.target))
          errs.push(`${k}: custom target on ${sh.source} needs a NEW id`);
        if (String(sh.label).trim().length < 3) errs.push(`${k}: label too short`);
      } else if (!ids.has(sh.target)) errs.push(`${k}: unknown target ${sh.target} on ${sh.source}`);
    }
  });
  const missing = analyses.map((_, i) => `screen-${i + 1}`).filter((s) => !used.has(s));
  if (missing.length) errs.push(`every screen must be used exactly once; missing: ${missing.join(", ")}`);
  return errs;
};

async function generate(contents, system = SYSTEM, extra = {}) {
  let lastErr;
  for (const model of MODELS) {
    for (let i = 0; i < 3; i++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: {systemInstruction: system, responseMimeType: "application/json", ...extra},
        });
      } catch (e) {
        lastErr = e;
        const status = e.status ?? e.code;
        if (!RETRYABLE.has(status)) throw e; // bad key, bad request etc: don't retry
        const wait = Math.min(15000, 1000 * 2 ** i) + Math.random() * 500;
        console.warn(`${model} returned ${status}, retry ${i + 1}/3 in ${Math.round(wait)}ms`);
        await sleep(wait);
      }
    }
    console.warn(`${model} still unavailable, trying next model`);
  }
  const err = new Error("The AI model is busy or rate-limited right now. Please try again in a minute.");
  err.status = 503;
  err.cause = lastErr;
  throw err;
}

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const r4 = (n) => Math.round(n * 10000) / 10000;

async function locate(file, label) {
  const parts = [
    {inlineData: {mimeType: mimeOf(file), data: fs.readFileSync(file).toString("base64")}},
    {text: `Find this UI element: "${label}". Return a JSON array with exactly one object: [{"label": "...", "box_2d": [ymin, xmin, ymax, xmax]}]. Coordinates are integers normalized to 0-1000 over the whole image. The box must tightly enclose the entire element, including a button's filled background or border, not just its text. If it is not visible, return [].`},
  ];
  const res = await generate(
    [{role: "user", parts}],
    "You are a precise UI element detector. Return only JSON.",
    {temperature: 0},
  );
  const text = res.text || "";
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < 0) return null;
  const b = JSON.parse(text.slice(s, e + 1))[0]?.box_2d;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)) return null;
  let [y0, x0, y1, x1] = b.map((n) => Math.min(1000, Math.max(0, n)) / 1000);
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  const x = r4(x0), y = r4(y0);
  const box = {x, y, w: Math.min(r4(x1 - x0), 1 - x), h: Math.min(r4(y1 - y0), 1 - y)};
  if (box.w < 0.01 || box.h < 0.008 || box.w * box.h > 0.35) return null; // junk or "whole screen"
  return box;
}

// Gemini's box, cross-checked against OCR where OCR saw the label.
async function resolveBox(a, file, label) {
  const l = norm(label);
  const match = a.elements.filter(usable)
    .filter((e) => { const t = norm(e.text); return t.length >= 3 && l.includes(t); })
    .sort((p, q) => q.text.length - p.text.length)[0];
  let box = null;
  for (let i = 0; i < 2 && !box; i++) {
    try { box = await locate(file, label); } catch (e) { console.warn("locate failed:", e.message); }
  }
  if (!match) return box;
  const cx = match.x + match.w / 2, cy = match.y + match.h / 2;
  const inside = box && cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  if (inside) return box;
  // OCR found the label but Gemini's box missed it: pad the text into a button-sized region
  const padPx = match.h * a.height * 0.8;
  const px = padPx / a.width, py = match.h * 0.48;
  const x = Math.max(0, match.x - px), y = Math.max(0, match.y - py);
  return {
    x: r4(x), y: r4(y),
    w: r4(Math.min(1 - x, match.w + 2 * px)),
    h: r4(Math.min(1 - y, match.h + 2 * py)),
  };
}

async function direct({uploadDir, analyses}) {
  const parts = [];
  analyses.forEach((a, i) => {
    const file = path.join(uploadDir, a.filename);
    parts.push({text: `screen-${i + 1}:`});
    parts.push({inlineData: {mimeType: mimeOf(file), data: fs.readFileSync(file).toString("base64")}});
  });
  parts.push({text: buildPrompt(analyses)});
  const contents = [{role: "user", parts}];

  let result, errs = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await generate(contents);
    const text = response.text || "";
    try {
      result = parse(text);
      errs = validate(result, analyses);
    } catch (e) {
      errs = [String(e.message)];
    }
    if (!errs.length) break;
    contents.push({role: "model", parts: [{text}]});
    contents.push({role: "user", parts: [{text: `Invalid: ${errs.join("; ")}. Return the corrected JSON only.`}]});
  }
  if (errs.length) throw new Error(`Recipe failed validation: ${errs.join("; ")}`);

  const assets = {}, targets = {};
  const scenes = [];
  const text = (o) => ({
    id: "", source: "", duration: SCENE, camera: {from: "full", to: "full", start: 0, end: 0},
    actions: [], span: 1, ...o,
  });

  scenes.push(text({kind: "text", role: "problem", lines: result.problem.lines, voiceover: result.problem.voiceover}));
  scenes.push(text({kind: "title", role: "title", title: result.product.name, tagline: result.product.tagline,
    voiceover: result.product.voiceover}));

  for (const g of result.scenes) {
    for (const [si, sh] of g.shots.entries()) {
      const a = analyses[Number(sh.source.split("-")[1]) - 1];
      assets[a.filename] = {w: a.width, h: a.height};
      const t = (targets[a.filename] = {});
      for (const e of a.elements) t[e.id] = {x: e.x, y: e.y, w: e.w, h: e.h};
      let to = sh.target;
      if (sh.label) {
        const box = await resolveBox(a, path.join(uploadDir, a.filename), sh.label);
        if (box) t[to] = box;
        else {
          const fb = a.elements.filter(usable)[0];
          if (!fb) throw new Error(`Could not locate "${sh.label}" on ${sh.source}`);
          console.warn(`Could not locate "${sh.label}", using OCR target ${fb.id}`);
          to = fb.id;
        }
      }
      scenes.push({
        id: "", role: "solution", source: a.filename, duration: SCENE,
        camera: {from: "full", to, start: 1, end: 2.5},
        actions: [
          {type: "highlight", target: to, at: 1.8, duration: 2},
          {type: "cursor_move", target: to, at: 2.5, duration: 1},
          {type: "click", target: to, at: 3.8},
        ],
        voiceover: si === 0 ? g.voiceover : "",
        span: si === 0 ? g.shots.length : undefined,
      });
    }
  }

  scenes.push(text({kind: "end", role: "cta", title: result.product.name, tagline: result.cta.headline,
    url: result.cta.url || "", voiceover: result.cta.voiceover}));
  scenes.forEach((s, i) => (s.id = `scene-${i + 1}`));

  return {
    video: {fps: 30, width: 1920, height: 1080, background: result.background},
    assets, targets, scenes,
  };
}

module.exports = {direct};