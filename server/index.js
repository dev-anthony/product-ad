const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sizeOf = require("image-size");
const {createWorker} = require("tesseract.js");
const {bundle} = require("@remotion/bundler");
const {renderMedia, selectComposition} = require("@remotion/renderer");
require("dotenv").config();
const {direct} = require("./director");
const {makeVoice} = require("./voice");
const {retime} = require("./timing");

const app = express();
process.on("uncaughtException", (e) => console.error("Uncaught:", e.message));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
app.use((req, res, next) => {
  const started = Date.now();
  console.log(`[${new Date().toISOString()}] -> ${req.method} ${req.path}`);
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] <- ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  res.on("close", () => {
    if (!res.writableFinished)
      console.warn(`[${new Date().toISOString()}] !! ${req.method} ${req.path} connection closed before response`);
  });
  next();
});
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "public");
fs.mkdirSync(uploadDir, {recursive: true});

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safe}`);
  },
});
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const upload = multer({
  storage,
  limits: {fileSize: 10 * 1024 * 1024},
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype) || imageExtensions.has(extension)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported screenshot type. Upload a PNG, JPG, JPEG, or WEBP image."));
  },
});
const uploadAudio = multer({
  storage,
  limits: {fileSize: 30 * 1024 * 1024},
  fileFilter: (req, file, cb) => cb(null, /^audio\//.test(file.mimetype)),
});

app.post("/api/upload-audio", uploadAudio.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({error: "Upload an MP3 or WAV file under 30MB"});
  res.json({filename: req.file.filename});
});

// ---------- OCR helpers ----------
const getLines = (data) => {
  if (data.lines) return data.lines;
  const out = [];
  for (const b of data.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || []) out.push(l);
  return out;
};

const slug = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "item";

// Group words into phrases; split a line where the gap between words is large
const toElements = (data, W, H) => {
  const raw = [];
  for (const line of getLines(data)) {
    const words = (line.words || []).filter((w) => w.text.trim() && w.confidence > 50);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const x0 = Math.min(...group.map((g) => g.bbox.x0));
      const y0 = Math.min(...group.map((g) => g.bbox.y0));
      const x1 = Math.max(...group.map((g) => g.bbox.x1));
      const y1 = Math.max(...group.map((g) => g.bbox.y1));
      raw.push({
        text: group.map((g) => g.text).join(" "),
        x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H,
      });
      group = [];
    };
    for (const w of words) {
      const prev = group[group.length - 1];
      const lineH = w.bbox.y1 - w.bbox.y0;
      if (prev && w.bbox.x0 - prev.bbox.x1 > lineH * 1.2) flush();
      group.push(w);
    }
    flush();
  }
  const seen = {};
  return raw.map((e) => {
    const base = slug(e.text);
    seen[base] = (seen[base] || 0) + 1;
    const id = seen[base] > 1 ? `${base}-${seen[base]}` : base;
    const r = (n) => Math.round(n * 10000) / 10000;
    const x = r(e.x), y = r(e.y);
    return {
      id, text: e.text, x, y,
      w: Math.min(r(e.w), 1 - x),
      h: Math.min(r(e.h), 1 - y),
    };
  });
};

// ---------- Routes ----------
app.get("/api/health", (req, res) => res.json({ok: true}));

app.post("/api/upload", upload.single("screenshot"), (req, res) => {
  if (!req.file) return res.status(400).json({error: "Upload a PNG, JPG or WEBP under 10MB"});
  res.json({filename: req.file.filename});
});

app.post("/api/analyze", async (req, res) => {
  const filename = path.basename(req.body.filename || "");
  const filePath = path.join(uploadDir, filename);
  if (!filename || !fs.existsSync(filePath)) return res.status(404).json({error: "File not found"});

  try {
    const {width, height} = sizeOf(fs.readFileSync(filePath));
    const hasLocal = fs.existsSync(path.join(__dirname, "eng.traineddata"));
    const worker = await createWorker("eng", 1, hasLocal ? {langPath: __dirname, gzip: false} : {});
    let data;
    try {
      ({data} = await worker.recognize(filePath, {}, {blocks: true}));
    } finally {
      await worker.terminate();
    }

    const elements = toElements(data, width, height);
    const result = {filename, width, height, elements};
    fs.writeFileSync(path.join(uploadDir, `${filename}.elements.json`), JSON.stringify(result, null, 2));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: String(err.message || err)});
  }
});
app.post("/api/recipe", async (req, res) => {
  const names = (req.body.filenames || []).map((n) => path.basename(n));
  if (!names.length) return res.status(400).json({error: "No files"});
  try {
    const analyses = names.map((n) => {
      const p = path.join(uploadDir, `${n}.elements.json`);
      if (!fs.existsSync(p)) throw new Error(`Run analyze first: ${n}`);
      return JSON.parse(fs.readFileSync(p, "utf8"));
    });
   const voice = req.body.voice || "en-US-AriaNeural";
const recipe = await direct({uploadDir, analyses});
const id = `project-${Date.now()}`;

let voiceError = "";
const sc = recipe.scenes;
for (let i = 0; i < sc.length; ) {
  const s = sc[i];
  const span = s.span || 1;
  let secs = 0;
  if (s.voiceover) {
    const name = `${id}-scene-${i + 1}.mp3`;
    try {
      const v = await makeVoice(s.voiceover, voice, path.join(uploadDir, name));
      secs = v.secs;
      s.audio = name;
      s.audioSecs = v.secs;
      s.audioStart = 0;
    } catch (e) {
      voiceError = String(e.message || e);
      console.error("TTS failed:", e);
    }
    await new Promise((r) => setTimeout(r, 1200)); // be gentle with Edge TTS
  }
  const hold = s.kind === "end" ? 1.5 : 0;
  const share = secs > 0 ? Math.max(secs / span, 2.2) + hold : hold ? 3 : 0;
  for (let j = i; j < Math.min(i + span, sc.length); j++)
    retime(sc[j], share, j === sc.length - 1, recipe.video.fps);
  i += span;
}

fs.writeFileSync(path.join(uploadDir, `${id}.recipe.json`), JSON.stringify(recipe, null, 2));
res.json({id, recipe, voiceError});
  } catch (err) {
    console.error(err.message, err.cause?.message || "");
    res.status(err.status === 503 ? 503 : 500).json({error: String(err.message || err)});
  }
});

app.post("/api/render", async (req, res) => {
  const id = path.basename(req.body.id || "");
  const recipePath = path.join(uploadDir, `${id}.recipe.json`);
  if (!id || !fs.existsSync(recipePath)) return res.status(404).json({error: "Generate the recipe first"});
  try {
    const savedRecipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
    const recipe = {...(req.body.recipe || savedRecipe), baseUrl: "http://localhost:4000/files"};
    const serveUrl = await getServeUrl();
    const composition = await selectComposition({
      serveUrl, id: "Ad", inputProps: {recipe}, browserExecutable: CHROME,
    });
    const outName = `${id}.mp4`;
    await renderMedia({
      composition, serveUrl, codec: "h264",
      outputLocation: path.join(outDir, outName),
      inputProps: {recipe}, browserExecutable: CHROME,
    });
    res.json({video: `http://localhost:4000/out/${outName}`});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: String(err.message || err)});
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const isAudio = req.path === "/api/upload-audio";
    const limit = isAudio ? "30 MB" : "10 MB";
    const label = isAudio ? "Audio" : "Screenshot";
    const message = err.code === "LIMIT_FILE_SIZE"
      ? `${label} exceeds the ${limit} per-file limit.`
      : `${label} upload failed: ${err.message}`;
    return res.status(400).json({error: message});
  }
  if (err) return res.status(400).json({error: err.message || "Request failed"});
  return next();
});

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(__dirname, "out");
fs.mkdirSync(outDir, {recursive: true});
app.use("/files", express.static(uploadDir));
app.use("/out", express.static(outDir));

let serveUrlPromise = null;
const getServeUrl = () => {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({entryPoint: path.join(__dirname, "remotion", "index.ts")})
      .catch((e) => { serveUrlPromise = null; throw e; });
  }
  return serveUrlPromise;
};



app.listen(4000, () => console.log("Server on http://localhost:4000"));