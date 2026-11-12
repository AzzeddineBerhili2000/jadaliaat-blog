// Builds the upload description (with YouTube chapters, sources and image credits) and Arabic SRT subtitles.
//   node make-meta.mjs <article>
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import vm from "vm";

const art = process.argv[2];
const dir = path.resolve(art);
const T = JSON.parse(readFileSync(path.join(dir, "timings.json"), "utf8"));
const credits = JSON.parse(readFileSync(path.join(dir, "img", "credits.json"), "utf8"));
const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
const sandbox = { window: {} }; vm.runInNewContext(readFileSync(path.join(dir, "beats.js"), "utf8"), sandbox);
const B = sandbox.window.BEATS;
const start = Object.fromEntries(T.lines.map(l => [l.id, l.start]));

const ar = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// chapters: first card of each section (YouTube needs the first at 0:00)
const chapters = B.sections.map((name, i) => {
  const c = B.cards.find(c => c.section === i);
  return `${mmss(i === 0 ? 0 : start[c.lines[0]])} ${ar(i + 1)}. ${name}`;
});

const lines = [
  meta.title, "",
  meta.summary, "",
  "المحاور:", ...chapters, "",
  "المصادر:", ...meta.sources.map(s => "• " + s), "",
  "الصور (ويكيميديا كومنز):",
  ...Object.values(credits).map(c => `• ${c.title.replace(/^File:/, "")} — ${c.artist || "unknown"} — ${c.license} — ${c.page}`), "",
  meta.voice, "",
  meta.tags
];
writeFileSync(path.join(dir, "description.txt"), lines.join("\n"), "utf8");

// subtitles: split long narration lines at punctuation into cues of ~55 characters
const ts = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
let n = 0; const srt = [];
for (const l of T.lines) {
  const parts = l.text.split(/(?<=[.،؛:؟!…])\s+/).reduce((acc, p) => { const last = acc[acc.length - 1]; if (last && (last + " " + p).length <= 60) acc[acc.length - 1] = last + " " + p; else acc.push(p); return acc; }, []);
  const total = parts.reduce((a, p) => a + p.length, 0); let t = l.start;
  for (const p of parts) { const d = (l.end - l.start) * p.length / total; srt.push(`${++n}\n${ts(t)} --> ${ts(t + d)}\n${p}\n`); t += d; }
}
writeFileSync(path.join(dir, "subtitles.ar.srt"), "﻿" + srt.join("\n"), "utf8");
console.log("description.txt + subtitles.ar.srt:", n, "cues;", "chapters:\n" + chapters.join("\n"));
