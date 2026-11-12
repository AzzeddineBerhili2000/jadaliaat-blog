// Wikimedia Commons helper.
//   node commons.mjs search "query" ["query2" ...]   → lists files with license + size
//   node commons.mjs get <outdir> "File:Name.jpg=key" ...  → downloads 1600px versions, writes credits.json
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import path from "path";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = { "User-Agent": "jadaliaat-video-builder/1.0 (educational video; contact via site)" };
const strip = s => (s || "").replace(/<[^>]+>/g, "").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// fetch JSON, waiting and retrying when Commons rate-limits us
async function getJSON(u) {
  for (let i = 1; i <= 8; i++) {
    const txt = await (await fetch(u, { headers: UA })).text();
    if (!txt.startsWith("You are making too many requests")) return JSON.parse(txt);
    console.log(`  rate-limited, waiting ${30 * i}s…`); await sleep(30000 * i);
  }
  throw new Error("Commons kept rate-limiting");
}
async function getBytes(u) {
  for (let i = 1; i <= 8; i++) {
    const r = await fetch(u, { headers: UA });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    console.log(`  HTTP ${r.status}, waiting ${30 * i}s…`); await sleep(30000 * i);
  }
  throw new Error("download failed: " + u);
}

async function info(titles) {
  const u = `${API}?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1600&titles=${encodeURIComponent(titles.join("|"))}`;
  const j = await getJSON(u);
  return Object.values(j.query?.pages || {}).map(p => {
    const ii = p.imageinfo?.[0]; if (!ii) return { title: p.title, missing: true };
    const m = ii.extmetadata || {};
    return { title: p.title, w: ii.width, h: ii.height, mime: ii.mime, thumb: ii.thumburl || ii.url,
      license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 80),
      desc: strip(m.ImageDescription?.value).slice(0, 140), page: ii.descriptionurl };
  });
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "search") {
  for (const q of args) {
    await new Promise(r => setTimeout(r, 4000)); // be gentle with the API
    const u =`${API}?action=query&format=json&list=search&srnamespace=6&srlimit=8&srsearch=${encodeURIComponent(q)}`;
    const j = await getJSON(u);
    const titles = (j.query?.search || []).map(s => s.title);
    console.log(`\n### ${q}`);
    if (!titles.length) { console.log("  (none)"); continue; }
    for (const r of await info(titles)) console.log(`  ${r.title} | ${r.license} | ${r.w}x${r.h} | ${r.desc}`);
  }
} else if (cmd === "get") {
  const [out, ...pairs] = args;
  mkdirSync(out, { recursive: true });
  const credFile = path.join(out, "credits.json");
  const credits = existsSync(credFile) ? JSON.parse(readFileSync(credFile, "utf8")) : {};
  const map = Object.fromEntries(pairs.map(p => { const i = p.lastIndexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));
  for (const r of await info(Object.keys(map))) {
    const key = map[r.title] ?? map[r.title.replace(/ /g, "_")];
    if (r.missing) { console.log(`MISSING ${r.title}`); continue; }
    const ext = r.mime === "image/png" ? "png" : "jpg";
    await sleep(3000);
    const buf = await getBytes(r.thumb);
    writeFileSync(path.join(out, `${key}.${ext}`), buf);
    credits[key] = { file: `${key}.${ext}`, title: r.title, license: r.license, artist: r.artist, page: r.page };
    console.log(`got ${key}.${ext}  ${r.license}  (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  writeFileSync(credFile, JSON.stringify(credits, null, 2));
}
