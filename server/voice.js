const {EdgeTTS} = require("node-edge-tts");
const fs = require("fs");

const FORMAT = "audio-24khz-48kbitrate-mono-mp3";

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

// Returns {lead, secs}. Audio plays from 0 (no lead trimming); only trailing silence is cut.
async function makeVoice(text, voice, outPath) {
  const lang = voice.split("-").slice(0, 2).join("-");
  const subPath = `${outPath}.json`;
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      if (i) await new Promise((r) => setTimeout(r, 2000 * i + Math.random() * 500));
      const tts = new EdgeTTS({voice, lang, outputFormat: FORMAT, saveSubtitles: true});
      fs.rmSync(outPath, {force: true});
      fs.rmSync(subPath, {force: true});
      await tts.ttsPromise(text, outPath);
      const buf = fs.readFileSync(outPath);
      if (buf.length < 2000) throw new Error("TTS returned an empty/short file");
      const fileSecs = mp3Seconds(buf) || buf.length / (48000 / 8);
      const span = speechSpan(subPath, fileSecs);
      console.log(`[voice] ${outPath.split(/[\\/]/).pop()}: file ${fileSecs.toFixed(2)}s, speech ends ${span ? span.last.toFixed(2) : "unknown"}s`);
      return {lead: 0, secs: span ? Math.min(fileSecs, span.last + 0.1) : fileSecs};
    } catch (e) {
      lastErr = e;
      console.warn(`[voice] attempt ${i + 1} failed: ${e.message}`);
    }
  }
  throw lastErr;
}

module.exports = {makeVoice, mp3Seconds};