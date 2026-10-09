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

const buildPrompt = (analyses) => `You are given ${analyses.length} screenshots of one product, labeled screen-1 to screen-${analyses.length} in the order shown.

Detected text per screen (id | text | x,y,w,h as 0-1 fractions):
${analyses.map((a, i) =>
  `## screen-${i + 1} (${a.width}x${a.height})\n` +
  a.elements.filter(usable).map((e) => `${e.id} | ${e.text.slice(0, 40)} | ${e.x},${e.y},${e.w},${e.h}`).join("\n")
).join("\n\n")}

Direct an ad with one scene per screen you use, ${SCENE} seconds each. Return exactly this JSON shape:
{
  "background": {"from": "#000000", "to": "#111111"},
  "scenes": [
    {
      "source": "screen-1",
      "camera": {"to": "<target id>", "start": 1, "end": 2.5},
      "actions": [
        {"type": "highlight", "target": "<id>", "at": 1.8, "duration": 2},
        {"type": "cursor_move", "target": "<id>", "at": 2.5, "duration": 1},
        {"type": "click", "target": "<id>", "at": 3.8}
      ],
      "customTargets": {"<new-id>": {"label": "<what it is, e.g. 'Start free trial button'>"}},
      "voiceover": "<one short sentence, max 12 words>"
    }
  ]
}

Rules:
- Use 1 to ${analyses.length} screens, each at most once. Choose the order that tells the best story: hook, then key features, then call to action.
- In each scene prefer the primary call-to-action button or actionable control. Never click headings, explanatory text, browser controls, or decorative elements. If there is no actionable control, choose a clear feature label. The camera.to, highlight target, cursor_move target and click target must all be the SAME id.
- For a text feature, prefer its detected OCR id. For a CTA, use a custom target around the full visible button when its boundaries are clear; if they are not, use the OCR id for its label rather than guessing coordinates. OCR often misses buttons, especially light text on colored or white buttons, and returns junk. Custom targets use x, y, w, and h normalized from 0 to 1 relative to the screen. x and y are the top-left corner; w and h are the box size.
- Allowed action types: cursor_move, click, highlight. All times are in seconds within 0-${SCENE}. The click must happen after the cursor_move ends and before ${SCENE - 1}.
- Each voiceover must describe what that scene shows. Together they should read as one ad.
- background: two hex colors from the first screen's dominant palette.`
  .replace(/^- For a text feature,.*$/m, '- For a text feature, prefer its detected OCR id. For a button or icon OCR cannot see, add a custom target with a short "label" describing it (do NOT give coordinates; they are located separately). If a button\'s label was detected by OCR, use the OCR id instead.');

const parse = (text) => {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("No JSON in reply");
  return JSON.parse(text.slice(s, e + 1));
};

const validate = (r, analyses) => {
  const errs = [];
  if (!Array.isArray(r.scenes) || !r.scenes.length) return ["scenes missing"];
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!r.background || !hex.test(r.background.from) || !hex.test(r.background.to))
    errs.push("background must be two #rrggbb colors");
  const used = new Set();
  r.scenes.forEach((s, i) => {
    const k = `scene ${i + 1}`;
    const idx = Number(/^screen-(\d+)$/.exec(s.source || "")?.[1]);
    const a = analyses[idx - 1];
    if (!a) return errs.push(`${k}: unknown source ${s.source}`);
    if (used.has(s.source)) errs.push(`${k}: ${s.source} used twice`);
    used.add(s.source);
    const custom = s.customTargets || {};
    const detected = new Set(a.elements.map((e) => e.id));
    for (const [id, b] of Object.entries(custom)) {
      if (detected.has(id)) errs.push(`${k}: custom target ${id} conflicts with a detected element id`);
      if (!b || typeof b.label !== "string" || b.label.trim().length < 3)
        errs.push(`${k}: customTargets.${id} needs a "label" describing the control`);
    }
    const known = new Set([...a.elements.map((e) => e.id), ...Object.keys(custom)]);
    const c = s.camera || {};
    if (!known.has(c.to)) errs.push(`${k}: camera.to unknown: ${c.to}`);
    if (!(Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.start < c.end && c.end <= SCENE))
      errs.push(`${k}: camera times invalid`);
    if (!Array.isArray(s.actions) || !s.actions.length) return errs.push(`${k}: actions missing`);
    for (const x of s.actions) {
      if (!ALLOWED.includes(x.type)) errs.push(`${k}: bad action type ${x.type}`);
      if (!known.has(x.target)) errs.push(`${k}: unknown target ${x.target}`);
      const duration = x.duration ?? 0;
      if (!Number.isFinite(x.at) || x.at < 0 || !Number.isFinite(duration) || duration < 0 || x.at + duration > SCENE)
        errs.push(`${k}: bad timing on ${x.type}`);
    }
    const click = s.actions.find((x) => x.type === "click");
    if (!click) errs.push(`${k}: needs a click`);
    else if (c.to !== click.target) errs.push(`${k}: camera.to must equal the click target`);
    const move = s.actions.find((x) => x.type === "cursor_move");
    if (!move) errs.push(`${k}: needs a cursor_move`);
    else if (click && click.at < move.at + (move.duration || 0))
      errs.push(`${k}: click must happen after cursor_move ends`);
    else if (click && move.target !== click.target)
      errs.push(`${k}: cursor_move and click must use the same target`);
    const highlight = s.actions.find((x) => x.type === "highlight");
    if (highlight && click && highlight.target !== click.target)
      errs.push(`${k}: highlight and click must use the same target`);
  });
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
  for (let attempt = 0; attempt < 2; attempt++) {
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
  for (const [i, s] of result.scenes.entries()) {
    const a = analyses[Number(s.source.split("-")[1]) - 1];
    assets[a.filename] = {w: a.width, h: a.height};
    const t = (targets[a.filename] = {});
    for (const e of a.elements) t[e.id] = {x: e.x, y: e.y, w: e.w, h: e.h};

    let to = s.camera.to;
    const label = s.customTargets?.[to]?.label;
    if (label) {
      const box = await resolveBox(a, path.join(uploadDir, a.filename), label);
      if (box) t[to] = box;
      else {
        const fb = a.elements.filter(usable)[0];
        if (!fb) throw new Error(`Could not locate "${label}" on ${s.source}`);
        console.warn(`Scene ${i + 1}: could not locate "${label}", using OCR target ${fb.id}`);
        t[s.camera.to] = {x: fb.x, y: fb.y, w: fb.w, h: fb.h};
        to = fb.id;
      }
    }
    scenes.push({
      id: `scene-${i + 1}`,
      source: a.filename,
      duration: SCENE,
      camera: {from: "full", to, start: s.camera.start, end: s.camera.end},
      actions: s.actions,
      voiceover: s.voiceover || "",
    });
  }

  return {
    video: {fps: 30, width: 1920, height: 1080, background: result.background},
    assets, targets, scenes,
  };
}

module.exports = {direct};