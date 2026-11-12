// Arabic voice-over generator for the article videos.
// Usage:  npm run voiceover -- embryo
// Reads <article>/script.json, creates one clip per line with ElevenLabs,
// joins them with short pauses into <article>/vo.wav, and writes
// <article>/timings.json (start/end of every line) for syncing the animation.
// The API key comes from ELEVENLABS_API_KEY (loaded from .env.local by the npm script).

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");

const article = process.argv[2];
if (!article) { console.error("Usage: npm run voiceover -- <article-folder>"); process.exit(1); }

const VOICE_ID = process.env.VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // George (male, narrative) — premade, works on the free plan
const MODEL_ID = "eleven_v4";
const PAUSE = 0.3;    // seconds of silence between lines
const TEMPO = Number(process.env.TEMPO || 1); // pitch-preserving speed-up applied when joining (e.g. 1.08)
const RATE = 48000;   // output sample rate (mono, 16-bit)

const dir = path.resolve(article);
const clipsDir = path.join(dir, "vo");
mkdirSync(clipsDir, { recursive: true });
const { lines } = JSON.parse(readFileSync(path.join(dir, "script.json"), "utf8"));

const client = new ElevenLabsClient();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const mp3 = path.join(clipsDir, `${line.id}.mp3`);
  if (existsSync(mp3) && !process.env.FORCE) { console.log(`skip ${line.id} (exists)`); continue; }
  const audio = await client.textToSpeech.convert(VOICE_ID, {
    text: line.text,
    modelId: MODEL_ID,
    languageCode: "ar",
    voiceSettings: { stability: 0.7, similarityBoost: 0.5 }, // narration preset
    previousText: i > 0 ? lines[i - 1].text : undefined,     // request stitching: smoother joins
    nextText: i < lines.length - 1 ? lines[i + 1].text : undefined,
  });
  await finished(Readable.fromWeb(audio).pipe(createWriteStream(mp3)));
  console.log(`made ${line.id}`);
}

// Decode every clip to raw PCM, measure it, and join with pauses.
const timings = [];
const parts = [];
const silence = Buffer.alloc(Math.round(PAUSE * RATE) * 2);
let t = 0;
for (const line of lines) {
  const pcm = execFileSync(ffmpeg, ["-v", "error", "-i", path.join(clipsDir, `${line.id}.mp3`),
    ...(TEMPO !== 1 ? ["-af", `atempo=${TEMPO}`] : []),
    "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 28 });
  const dur = pcm.length / 2 / RATE;
  timings.push({ id: line.id, start: +t.toFixed(3), end: +(t + dur).toFixed(3), text: line.text });
  parts.push(pcm, silence);
  t += dur + PAUSE;
}
const raw = path.join(clipsDir, "all.pcm");
writeFileSync(raw, Buffer.concat(parts));
execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-i", raw, path.join(dir, "vo.wav")]);
writeFileSync(path.join(dir, "timings.json"), JSON.stringify({ duration: +t.toFixed(3), lines: timings }, null, 2));
console.log(`vo.wav: ${t.toFixed(2)} s, ${lines.length} lines, ${(statSync(path.join(dir, "vo.wav")).size / 1e6).toFixed(1)} MB`);
