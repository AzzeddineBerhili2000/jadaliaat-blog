// Renders an article video with Edge (playwright-core) + ffmpeg.
//   node render.mjs <article> --w 1920 --h 1080 [--out file.mp4] [--fps 30] [--from s] [--to s] [--scale 0.5]
//   node render.mjs <article> --w 1080 --h 1920 --stills 3,10.5,42 [--debug]   → PNG stills in <article>/stills/
import { chromium } from "playwright-core";
import http from "http";
import { createReadStream, existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import { spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const art = args[0];
const opt = k => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : undefined; };
const flag = k => args.includes("--" + k);
const scale = +(opt("scale") || 1);
const W = Math.round((+opt("w") || 1080) * scale), H = Math.round((+opt("h") || 1920) * scale);
const fps = +(opt("fps") || 30);

// tiny static server for the video folder
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".ttf": "font/ttf",".json": "application/json", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" });
  createReadStream(p).pipe(res);
}).listen(0, "127.0.0.1");
await new Promise(r => server.on("listening", r));
const port = server.address().port;

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("console", m => { if (m.type() === "warning" || m.type() === "error") console.log("[page]", m.text()); });
await page.goto(`http://127.0.0.1:${port}/engine.html?a=${art}&w=${W}&h=${H}`);
await page.waitForFunction("window.READY || window.BOOT_ERROR", null, { timeout: 120000 });
const err = await page.evaluate("window.BOOT_ERROR");
if (err) { console.error(err); process.exit(1); }
const DUR = await page.evaluate("window.DUR");

if (opt("stills")) {
  const dir = path.join(root, art, "stills"); mkdirSync(dir, { recursive: true });
  for (const s of opt("stills").split(",")) {
    const b64 = await page.evaluate(([t, d]) => window.framePNG(t, d), [+s, flag("debug")]);
    const f = path.join(dir, `${W}x${H}_${(+s).toFixed(1).padStart(6, "0")}.png`);
    writeFileSync(f, Buffer.from(b64, "base64")); console.log(f);
  }
  if (flag("cards")) console.log(JSON.stringify(await page.evaluate("window.cardInfo()")));
} else {
  const TAIL = 2.5; // silent hold on the last card after the narration ends
  const t0 = +(opt("from") || 0), t1 = Math.min(+(opt("to") || DUR + TAIL), DUR + TAIL);
  const f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
  const out = path.join(root, art, opt("out") || `${art}_${W}x${H}.mp4`);
  const vo = path.join(root, art, "vo.wav");
  const ff = spawn(ffmpeg, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-ss", String(t0), "-i", vo, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", scale < 1 ? "veryfast" : "medium", "-crf", scale < 1 ? "24" : "17", "-pix_fmt", "yuv420p",
    "-af", "apad", "-c:a", "aac", "-b:a", "192k", "-t", String(t1 - t0), "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const start = Date.now();
  for (let f = f0; f < f1; f++) {
    const b64 = await page.evaluate(([t, q]) => window.frameJPEG(t, q), [f / fps, scale < 1 ? .8 : .94]);
    if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise(r => ff.stdin.once("drain", r));
    if ((f - f0) % 300 === 0) {
      const el = (Date.now() - start) / 1000, done = f - f0 + 1, left = (f1 - f) * el / done;
      console.log(`frame ${f}/${f1}  ${(f / fps).toFixed(1)}s  ~${Math.round(left / 60)} min left`);
    }
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("done:", out, ((Date.now() - start) / 60000).toFixed(1), "min");
}
await browser.close(); server.close();
