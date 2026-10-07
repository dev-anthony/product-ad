const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sizeOf = require("image-size");
const {createWorker} = require("tesseract.js");
const {direct} = require("./director");

const app = express();
process.on("uncaughtException", (e) => console.error("Uncaught:", e.message));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "public");
fs.mkdirSync(uploadDir, {recursive: true});

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: {fileSize: 10 * 1024 * 1024},
  fileFilter: (req, file, cb) => cb(null, /image\/(png|jpeg|webp)/.test(file.mimetype)),
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
    return {id, text: e.text, x: r(e.x), y: r(e.y), w: r(e.w), h: r(e.h)};
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
    const {data} = await worker.recognize(filePath, {}, {blocks: true});
    await worker.terminate();

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
  const filename = path.basename(req.body.filename || "");
  const elPath = path.join(uploadDir, `${filename}.elements.json`);
  if (!filename || !fs.existsSync(elPath)) return res.status(404).json({error: "Run analyze first"});
  try {
    const analysis = JSON.parse(fs.readFileSync(elPath, "utf8"));
    const recipe = await direct({uploadDir, analysis});
    fs.writeFileSync(path.join(uploadDir, `${filename}.recipe.json`), JSON.stringify(recipe, null, 2));
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: String(err.message || err)});
  }
});

app.listen(4000, () => console.log("Server on http://localhost:4000"));