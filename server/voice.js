const {EdgeTTS} = require("node-edge-tts");
const fs = require("fs");

const FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const BYTES_PER_SEC = 48000 / 8; // constant bitrate, so size gives duration

async function makeVoice(text, voice, outPath) {
  const lang = voice.split("-").slice(0, 2).join("-");
  const tts = new EdgeTTS({voice, lang, outputFormat: FORMAT});
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      await tts.ttsPromise(text, outPath);
      return fs.statSync(outPath).size / BYTES_PER_SEC;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

module.exports = {makeVoice};