const {GoogleGenAI} = require("@google/genai");
const fs = require("fs");
const path = require("path");

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
      "customTargets": {"<new-id>": [ymin, xmin, ymax, xmax]},
      "voiceover": "<one short sentence, max 12 words>"
    }
  ]
}

Rules:
- Use 1 to ${analyses.length} screens, each at most once. Choose the order that tells the best story: hook, then key features, then call to action.
- In each scene pick the single most important button or feature as the target. The camera.to, highlight target, cursor_move target and click target must all be the SAME id.
- Prefer an id from that screen's detected list. OCR often misses buttons, especially light text on colored or white buttons, and returns junk. If the target is not in the list, add it to customTargets as [ymin, xmin, ymax, xmax], integers from 0 to 1000 relative to that screen's image, as a tight box around the element.
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
    for (const [id, b] of Object.entries(custom)) {
      const ok = Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1000) &&
        b[2] > b[0] && b[3] > b[1];
      if (!ok) errs.push(`${k}: customTargets.${id} must be [ymin,xmin,ymax,xmax] within 0-1000`);
    }
    const known = new Set([...a.elements.map((e) => e.id), ...Object.keys(custom)]);
    const c = s.camera || {};
    if (!known.has(c.to)) errs.push(`${k}: camera.to unknown: ${c.to}`);
    if (!(c.start >= 0 && c.start < c.end && c.end <= SCENE)) errs.push(`${k}: camera times invalid`);
    if (!Array.isArray(s.actions) || !s.actions.length) return errs.push(`${k}: actions missing`);
    for (const x of s.actions) {
      if (!ALLOWED.includes(x.type)) errs.push(`${k}: bad action type ${x.type}`);
      if (!known.has(x.target)) errs.push(`${k}: unknown target ${x.target}`);
      if (typeof x.at !== "number" || x.at + (x.duration || 0) > SCENE) errs.push(`${k}: bad timing on ${x.type}`);
    }
    const click = s.actions.find((x) => x.type === "click");
    if (!click) errs.push(`${k}: needs a click`);
    else if (c.to !== click.target) errs.push(`${k}: camera.to must equal the click target`);
  });
  return errs;
};

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
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {systemInstruction: SYSTEM, responseMimeType: "application/json"},
    });
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
    for (const [id, [y0, x0, y1, x1]] of Object.entries(s.customTargets || {}))
      t[id] = {x: x0 / 1000, y: y0 / 1000, w: (x1 - x0) / 1000, h: (y1 - y0) / 1000};
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