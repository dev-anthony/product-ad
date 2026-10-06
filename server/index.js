const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

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

app.get("/api/health", (req, res) => res.json({ok: true}));

app.post("/api/upload", upload.single("screenshot"), (req, res) => {
  if (!req.file) return res.status(400).json({error: "Upload a PNG, JPG or WEBP under 10MB"});
  res.json({filename: req.file.filename});
});

app.listen(4000, () => console.log("Server on http://localhost:4000"));