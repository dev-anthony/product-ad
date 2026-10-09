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
      "customTargets": {"<new-id>": {"x": 0.4, "y": 0.5, "w": 0.1, "h": 0.06}},
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
- background: two hex colors from the first screen's dominant palette.`;

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
      const ok = b && typeof b === "object" &&
        ["x", "y", "w", "h"].every((key) => Number.isFinite(b[key])) &&
        b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 &&
        b.x + b.w <= 1 && b.y + b.h <= 1;
      if (!ok) errs.push(`${k}: customTargets.${id} must have normalized x, y, w, h bounds within 0-1`);
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

async function generate(contents) {
  let lastErr;
  for (const model of MODELS) {
    for (let i = 0; i < 3; i++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: {systemInstruction: SYSTEM, responseMimeType: "application/json"},
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
  const scenes = result.scenes.map((s, i) => {
    const a = analyses[Number(s.source.split("-")[1]) - 1];
    assets[a.filename] = {w: a.width, h: a.height};
    const t = (targets[a.filename] = {});
    for (const e of a.elements) t[e.id] = {x: e.x, y: e.y, w: e.w, h: e.h};
    for (const [id, box] of Object.entries(s.customTargets || {}))
      t[id] = {x: box.x, y: box.y, w: box.w, h: box.h};
    return {
      id: `scene-${i + 1}`,
      source: a.filename,
      duration: SCENE,
      camera: {from: "full", to: s.camera.to, start: s.camera.start, end: s.camera.end},
      actions: s.actions,
      voiceover: s.voiceover || "",
    };
  });

  return {
    video: {fps: 30, width: 1920, height: 1080, background: result.background},
    assets, targets, scenes,
  };
}

module.exports = {direct};