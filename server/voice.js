const {EdgeTTS} = require("node-edge-tts");
const {GoogleGenAI} = require("@google/genai");
const fs = require("fs");

const FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// TTS_PROVIDER in .env: "auto" (default: Microsoft voice first, Gemini voice as backup),
// "edge" (Microsoft only) or "gemini" (Gemini only: one consistent voice for the whole ad).
const MODE = (process.env.TTS_PROVIDER || "auto").toLowerCase();
const GEMINI_TTS_MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts")
  .split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_FEMALE = process.env.GEMINI_VOICE_FEMALE || "Kore";
const GEMINI_MALE = process.env.GEMINI_VOICE_MALE || "Charon";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ai;
const getAi = () => (ai ||= new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY}));

// Exact duration of an MP3 by walking its frames (no size/bitrate guessing).
// Returns 0 if the file cannot be parsed.
function mp3Seconds(buf) {
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]};
  let pos = 0, secs = 0, frames = 0;
  if (buf.length > 10 && buf.toString("latin1", 0, 3) === "ID3") {
    pos = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; continue; }
    const ver = (buf[pos + 1] >> 3) & 3, layer = (buf[pos + 1] >> 1) & 3;
    const bi = buf[pos + 2] >> 4, si = (buf[pos + 2] >> 2) & 3, padding = (buf[pos + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) { pos++; continue; }
    const sr = SR[ver][si];
    const mpeg1 = ver === 3;
    const br = (mpeg1 ? BR1 : BR2)[bi] * 1000;
    const len = Math.floor(((mpeg1 ? 144 : 72) * br) / sr) + padding;
    secs += (mpeg1 ? 1152 : 576) / sr;
    frames++;
    pos += len;
  }
  return frames ? secs : 0;
}

// First and last spoken word, from Edge's word timings. Returns null if unavailable.
function speechSpan(subPath, fileSecs) {
  try {
    const parts = JSON.parse(fs.readFileSync(subPath, "utf8"));
    const first = Math.min(...parts.map((p) => Number(p.start))) / 1000;
    const last = Math.max(...parts.map((p) => Number(p.end))) / 1000;
    if (![first, last].every(Number.isFinite) || first < 0 || first >= last || last < 0.3 || last > fileSecs + 0.5)
      return null; // sanity check
    return {first, last};
  } catch {
    return null;
  }
}

// Duration of a WAV file from its header.
function wavSecs(buf) {
  if (buf.length < 44 || buf.toString("latin1", 0, 4) !== "RIFF") return buf.length / 48000;
  let pos = 12, byteRate = 48000;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("latin1", pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(pos + 16) || byteRate;
    if (id === "data") return Math.min(size, buf.length - pos - 8) / byteRate;
    pos += 8 + size + (size & 1);
  }
  return buf.length / 48000;
}

// Microsoft Edge voice. Writes <base>.mp3
async function edgeVoice(text, voice, base, tries) {
  const out = `${base}.mp3`, subPath = `${out}.json`;
  const lang = voice.split("-").slice(0, 2).join("-");
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      if (i) await sleep(1500 * i + Math.random() * 500);
      const tts = new EdgeTTS({voice, lang, outputFormat: FORMAT, saveSubtitles: true});
      fs.rmSync(out, {force: true});
      fs.rmSync(subPath, {force: true});
      await tts.ttsPromise(text, out);
      const buf = fs.readFileSync(out);
      if (buf.length < 2000) throw new Error("TTS returned an empty/short file");
      const fileSecs = mp3Seconds(buf) || buf.length / (48000 / 8);
      const span = speechSpan(subPath, fileSecs);
      console.log(`[voice] edge ${out.split(/[\\/]/).pop()}: ${fileSecs.toFixed(2)}s`);
      return {file: out, lead: 0, secs: span ? Math.min(fileSecs, span.last + 0.1) : fileSecs};
    } catch (e) {
      lastErr = e;
      fs.rmSync(out, {force: true});
      console.warn(`[voice] edge attempt ${i + 1}/${tries} failed: ${e.message}`);
    }
  }
  throw lastErr;
}

// Gemini voice (Interactions API). Writes <base>.wav
async function geminiVoice(text, voice, base) {
  const out = `${base}.wav`;
  const name = /Aria|Ezinne|Jenny|Sonia|Libby/i.test(voice) ? GEMINI_FEMALE : GEMINI_MALE;
  let lastErr;
  for (const model of GEMINI_TTS_MODELS) {
    for (let i = 0; i < 3; i++) {
      try {
        const it = await getAi().interactions.create({
          model,
          input: [{type: "user_input", content: [{type: "text", text}]}],
          response_format: {type: "audio"},
          generation_config: {speech_config: [{voice: name}]},
        });
        const b64 = it.output_audio?.data ||
          (it.steps || []).flatMap((s) => s.content || []).filter((c) => c.type === "audio").pop()?.data;
        if (!b64) throw new Error("Gemini TTS returned no audio");
        const buf = Buffer.from(b64, "base64");
        if (buf.length < 2000) throw new Error("Gemini TTS returned a very short file");
        fs.writeFileSync(out, buf);
        const secs = wavSecs(buf);
        console.log(`[voice] gemini(${model}, ${name}) ${out.split(/[\\/]/).pop()}: ${secs.toFixed(2)}s`);
        return {file: out, lead: 0, secs: secs + 0.05};
      } catch (e) {
        lastErr = e;
        const st = e.status ?? e.code;
        console.warn(`[voice] gemini ${model} attempt ${i + 1} failed: ${String(e.message).slice(0, 180)}`);
        if (st === 404 || st === 400 || st === 401 || st === 403) break; // wrong model/key: try the next model
        await sleep(2000 * 2 ** i); // 429 / 503: back off and retry
      }
    }
  }
  throw lastErr;
}

let edgeDownUntil = 0;

// Returns {file, lead, secs}. `base` has no extension: the provider adds .mp3 or .wav
async function makeVoice(text, voice, base) {
  const order =
    MODE === "gemini" ? ["gemini"]
    : MODE === "edge" ? ["edge"]
    : Date.now() < edgeDownUntil ? ["gemini", "edge"] : ["edge", "gemini"];
  let lastErr;
  for (const p of order) {
    try {
      const r = p === "edge" ? await edgeVoice(text, voice, base, MODE === "edge" ? 6 : 2) : await geminiVoice(text, voice, base);
      if (p === "edge") edgeDownUntil = 0;
      return r;
    } catch (e) {
      lastErr = e;
      if (p === "edge" && MODE === "auto") {
        edgeDownUntil = Date.now() + 10 * 60 * 1000; // stop hammering Microsoft for a while
        console.warn("[voice] Microsoft voice unavailable, switching to the Gemini voice");
      }
    }
  }
  throw lastErr;
}

module.exports = {makeVoice, mp3Seconds, wavSecs};