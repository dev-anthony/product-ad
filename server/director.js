const {GoogleGenAI} = require("@google/genai");
const fs = require("fs");
const path = require("path");

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DURATION = 7;
const ALLOWED = ["cursor_move", "click", "highlight"];

const SYSTEM =
  "You are an expert SaaS product-ad editor. You direct a short ad from ONE screenshot using only the allowed actions. Return ONLY a JSON object. No prose, no code fences.";

const buildPrompt = (a) => `Screenshot size: ${a.width}x${a.height}.
Detected text elements (id | text | x,y,w,h as 0-1 fractions of the image):
${a.elements.map((e) => `${e.id} | ${e.text.slice(0, 40)} | ${e.x},${e.y},${e.w},${e.h}`).join("\n")}

Direct a ${DURATION}-second ad. Return exactly this JSON shape:
{
  "scene": {
    "camera": {"to": "<target id>", "start": 2, "end": 4},
    "actions": [
      {"type": "highlight", "target": "<id>", "at": 2.5, "duration": 2},
      {"type": "cursor_move", "target": "<id>", "at": 4, "duration": 1},
      {"type": "click", "target": "<id>", "at": 5}
    ],
    "voiceover": "<one short sentence>"
  },
  "customTargets": {"<new-id>": {"x": 0.1, "y": 0.8, "w": 0.13, "h": 0.045}},
  "background": {"from": "#000000", "to": "#111111"}
}

Rules:
- Pick the single most important call-to-action or feature as the target. Buttons like "Download Now", "Join the waitlist" or "Get started" are best.
- Prefer an id from the detected list. OCR often misses or misreads buttons, especially light text on colored or white buttons, and it returns junk like single characters. Ignore junk. If the best target is not in the list, add it to customTargets with a tight 0-1 box measured from the image and a short kebab-case id. customTargets may be {}.
- Allowed action types: cursor_move, click, highlight. All times are in seconds within 0-${DURATION}.
- The click must happen after the cursor_move ends, and before ${DURATION - 0.5}.
- background: two hex colors taken from the screenshot's dominant palette.`;

const parse = (text) => {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("No JSON in reply");
  return JSON.parse(text.slice(s, e + 1));
};

const validate = (r, ids) => {
  const errs = [];
  const custom = r.customTargets || {};
  for (const [id, b] of Object.entries(custom)) {
    const ok = b && [b.x, b.y, b.w, b.h].every((n) => typeof n === "number") &&
      b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1 && b.y + b.h <= 1;
    if (!ok) errs.push(`customTargets.${id} must be a box inside 0-1`);
  }
  const known = new Set([...ids, ...Object.keys(custom)]);
  const s = r.scene;
  if (!s) return ["missing scene"];
  const c = s.camera || {};
  if (c.to !== "full" && !known.has(c.to)) errs.push(`camera.to unknown: ${c.to}`);
  if (!(c.start >= 0 && c.start < c.end && c.end <= DURATION)) errs.push("camera times invalid");
  if (!Array.isArray(s.actions) || !s.actions.length) errs.push("actions missing");
  for (const a of s.actions || []) {
    if (!ALLOWED.includes(a.type)) errs.push(`bad action type: ${a.type}`);
    if (!known.has(a.target)) errs.push(`unknown target: ${a.target}`);
    if (typeof a.at !== "number" || a.at + (a.duration || 0) > DURATION) errs.push(`bad timing on ${a.type}`);
  }
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!r.background || !hex.test(r.background.from) || !hex.test(r.background.to))
    errs.push("background must be two #rrggbb colors");
  return errs;
};

async function direct({uploadDir, analysis}) {
  const filePath = path.join(uploadDir, analysis.filename);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const data = fs.readFileSync(filePath).toString("base64");
  const ids = analysis.elements.map((e) => e.id);

  const contents = [{
    role: "user",
    parts: [{inlineData: {mimeType, data}}, {text: buildPrompt(analysis)}],
  }];

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
      errs = validate(result, ids);
    } catch (e) {
      errs = [String(e.message)];
    }
    if (!errs.length) break;
    contents.push({role: "model", parts: [{text}]});
    contents.push({role: "user", parts: [{text: `Invalid: ${errs.join("; ")}. Return the corrected JSON only.`}]});
  }
  if (errs.length) throw new Error(`Recipe failed validation: ${errs.join("; ")}`);

  const targets = {};
  for (const e of analysis.elements) targets[e.id] = {x: e.x, y: e.y, w: e.w, h: e.h};
  Object.assign(targets, result.customTargets || {});

  return {
    video: {fps: 30, width: 1920, height: 1080, background: result.background},
    assets: {[analysis.filename]: {w: analysis.width, h: analysis.height}},
    targets: {[analysis.filename]: targets},
    scenes: [{
      id: "scene-1",
      source: analysis.filename,
      duration: DURATION,
      camera: {from: "full", to: result.scene.camera.to, start: result.scene.camera.start, end: result.scene.camera.end},
      actions: result.scene.actions,
      voiceover: result.scene.voiceover || "",
    }],
  };
}

module.exports = {direct};