/* Jadaliaat video engine — one continuous camera over a desk of paper cards.
   drawFrame(t) is a pure function of t (seconds). Data: <article>/beats.js + <article>/timings.json.
   URL params: a=<article folder>, w, h (output size). */
(() => {
'use strict';
const P = new URLSearchParams(location.search);
const W = +P.get('w') || 1080, H = +P.get('h') || 1920, ART = P.get('a') || 'embryo';
const PORTRAIT = H > W;
const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

const C = {
  desk: '#E1D2B6', desk2: '#D9C8AA', paper: '#F6EFE1', paper2: '#EFE5D2', wash: '#EADACB',
  ink: '#1D1B18', ink2: '#4F453B', ink3: '#8C7E6B', rule: '#D2C1A2',
  crimson: '#9C2A22', navy: '#273A68', gold: '#B5852B', green: '#3F6B3A'
};
const F = {
  head: w => `${w || 400} %S Ruqaa, Amiri, serif`,
  text: w => `${w || 400} %S Amiri, serif`,
  label: w => `${w || 600} %S Kufi, sans-serif`
};
const font = (kind, size, weight) => F[kind](weight).replace('%S', size + 'px');

/* ── text shaping with HarfBuzz ─────────────────────────────────
   Chromium on this machine misplaces Arabic vowel marks for web fonts, so all
   Arabic/Latin text is shaped with harfbuzzjs and drawn as glyph outlines. */
let HBM = null; const HBF = {};
const FONT_FILES = {
  'Amiri|400': ['fonts/Amiri-Regular.ttf'], 'Amiri|700': ['fonts/Amiri-Bold.ttf'], 'AmiriQuran|400': ['fonts/AmiriQuran.ttf'],
  'Ruqaa|400': ['fonts/ArefRuqaa-Regular.ttf'], 'Ruqaa|700': ['fonts/ArefRuqaa-Bold.ttf'],
  'Kufi|400': ['fonts/ReemKufi.ttf', 400], 'Kufi|600': ['fonts/ReemKufi.ttf', 600]
};
async function loadHB() {
  HBM = await import('./node_modules/harfbuzzjs/dist/index.mjs');
  const bufs = {};
  for (const [k, [file, wght]] of Object.entries(FONT_FILES)) {
    const buf = bufs[file] || (bufs[file] = await (await fetch(file)).arrayBuffer());
    const face = new HBM.Face(new HBM.Blob(buf), 0), f = new HBM.Font(face);
    if (wght) f.setVariations([new HBM.Variation('wght', wght)]);
    HBF[k] = { font: f, upem: face.upem, cache: new Map(), glyphs: new Map() };
  }
}
function parseFont(f) { const m = /^(\d+)\s+([\d.]+)px\s+([A-Za-z]+)/.exec(f); return m ? { w: +m[1], size: +m[2], fam: m[3] } : null; }
function hbKey(p) {
  if (!p) return null;
  if (p.fam === 'Amiri') return p.w >= 600 ? 'Amiri|700' : 'Amiri|400';
  if (p.fam === 'AmiriQuran') return 'AmiriQuran|400';
  if (p.fam === 'Ruqaa') return p.w >= 600 ? 'Ruqaa|700' : 'Ruqaa|400';
  if (p.fam === 'Kufi') return p.w >= 500 ? 'Kufi|600' : 'Kufi|400';
  return null;
}
// left-to-right runs inside right-to-left text: Latin phrases, or Arabic-Indic digit groups
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9.,:;/'’&()·\-–— ]*[A-Za-z0-9).]|[A-Za-z0-9]|[٠-٩]+/g;
function glyphPath(F, gid) {
  let g = F.glyphs.get(gid);
  if (g === undefined) { const s = F.font.glyphToPath(gid); g = s ? new Path2D(s) : null; F.glyphs.set(gid, g); }
  return g;
}
function shapeRun(F, text, rtl) {
  const b = new HBM.Buffer(); b.addText(text);
  b.setDirection(rtl ? HBM.Direction.RTL : HBM.Direction.LTR);
  b.setScript(rtl || /[٠-٩]/.test(text) ? 'Arab' : 'Latn'); b.setLanguage(rtl ? 'ar' : 'en');
  HBM.shape(F.font, b);
  const infos = b.getGlyphInfos(), pos = b.getGlyphPositions(), p = new Path2D(); let x = 0;
  infos.forEach((g, i) => {
    const gp = glyphPath(F, g.codepoint);
    if (gp) p.addPath(gp, new DOMMatrix([1, 0, 0, 1, x + pos[i].xOffset, pos[i].yOffset]));
    x += pos[i].xAdvance;
  });
  return { w: x, p };
}
function shapeText(F, text) {
  let s = F.cache.get(text); if (s) return s;
  if (!/[؀-ۿ]/.test(text) && /[A-Za-z]/.test(text)) { s = shapeRun(F, text, false); F.cache.set(text, s); return s; } // Latin-only: one LTR run
  const runs = []; let last = 0, m; LTR_RUN.lastIndex = 0;
  while ((m = LTR_RUN.exec(text))) { if (m.index > last) runs.push([text.slice(last, m.index), true]); runs.push([m[0], false]); last = m.index + m[0].length; }
  if (last < text.length) runs.push([text.slice(last), true]);
  const shaped = runs.map(([t, rtl]) => shapeRun(F, t, rtl)), w = shaped.reduce((a, r) => a + r.w, 0);
  const p = new Path2D(); let xr = w; // first logical run sits on the right
  shaped.forEach(r => { xr -= r.w; p.addPath(r.p, new DOMMatrix([1, 0, 0, 1, xr, 0])); });
  s = { w, p }; F.cache.set(text, s); return s;
}
function measure(s, f) {
  const p = parseFont(f), k = hbKey(p);
  if (k && HBF[k]) return shapeText(HBF[k], s).w * p.size / HBF[k].upem;
  ctx.font = f; return ctx.measureText(s).width;
}
function hbFill(s, f, x, y, color, align) {
  const p = parseFont(f), F = HBF[hbKey(p)], sh = shapeText(F, s), sc = p.size / F.upem, w = sh.w * sc;
  const x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
  ctx.save(); ctx.translate(x0, y); ctx.scale(sc, -sc); ctx.fillStyle = color; ctx.fill(sh.p); ctx.restore();
}

/* ── math ─────────────────────────────────────────────────────── */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = p => (p = clamp(p), p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - clamp(p), 3);
const smooth = p => (p = clamp(p), p * p * (3 - 2 * p));
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* ── timing ───────────────────────────────────────────────────── */
let TL, LINE = {}, DUR;
const plain = s => s.replace(/[ً-ْٰـ]/g, '');
// time at which `word` is spoken inside line `id` (estimated from character position)
function kw(id, word, atEnd) {
  const l = LINE[id]; if (!l) { console.warn('no line', id); return 0; }
  if (!word) return l.start;
  const txt = plain(l.text), w = plain(word), i = txt.indexOf(w);
  if (i < 0) { console.warn('kw not found', id, word); return l.start; }
  return l.start + (l.end - l.start) * ((i + (atEnd ? w.length : 0)) / txt.length);
}
function T(spec, fallback) {
  if (spec == null) return fallback;
  if (typeof spec === 'number') return spec;
  if (typeof spec === 'string') return LINE[spec] ? LINE[spec].start : fallback;
  return kw(spec[0], spec[1], spec[2]) + (spec[3] || 0);
}

/* ── text ─────────────────────────────────────────────────────── */
// rich text: [[word]] = crimson bold, {{word}} = navy bold
function tokens(text) {
  const out = []; const re = /\[\[(.+?)\]\]|\{\{(.+?)\}\}|([^\[\{]+|[\[\{])/g; let m;
  while ((m = re.exec(text))) {
    const style = m[1] ? 'r' : m[2] ? 'b' : '';
    const s = m[1] || m[2] || m[3];
    s.split(/(\s+)/).forEach(w => { if (w && !/^\s+$/.test(w)) out.push({ w, style }); });
  }
  return out;
}
function wrapRich(text, f, maxW) {
  const sp = measure('ا ا', f) - measure('اا', f);
  const lines = []; let cur = [], cw = 0;
  for (const tk of tokens(text)) {
    const w = measure(tk.w, tk.style ? f.replace(/^\d+/, '700') : f);
    if (cur.length && cw + sp + w > maxW) { lines.push({ t: cur, w: cw }); cur = []; cw = 0; }
    cur.push({ ...tk, wd: w }); cw += (cur.length > 1 ? sp : 0) + w;
  }
  if (cur.length) lines.push({ t: cur, w: cw });
  lines.sp = sp; return lines;
}
function drawRich(lines, f, x, y, maxW, lh, align, color) {
  lines.forEach((ln, i) => {
    if (ln.t.every(tk => !/[؀-ۿ]/.test(tk.w))) { // a purely Latin line reads left to right
      let xl = align === 'center' ? x + (maxW - ln.w) / 2 : x + maxW - ln.w;
      for (const tk of ln.t) { textLine(tk.w, tk.style ? f.replace(/^\d+/, '700') : f, xl, y + i * lh, color, 'left'); xl += tk.wd + lines.sp; }
      return;
    }
    let xr = align === 'center' ? x + (maxW + ln.w) / 2 : x + maxW; // right edge for RTL
    for (const tk of ln.t) {
      const tf = tk.style ? f.replace(/^\d+/, '700') : f;
      textLine(tk.w, tf, xr, y + i * lh, tk.style === 'r' ? C.crimson : tk.style === 'b' ? C.navy : color, 'right');
      xr -= tk.wd + lines.sp;
    }
  });
}
function textLine(s, f, x, y, color, align = 'right', dir = 'rtl') {
  if (HBF[hbKey(parseFont(f))]) return hbFill(s, f, x, y, color, align);
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align; ctx.direction = dir; ctx.fillText(s, x, y);
}

/* ── images ───────────────────────────────────────────────────── */
const IMG = {}, CREDITS = {};
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(src); i.src = src; }); }

/* ── reveal helper ────────────────────────────────────────────── */
function reveal(t, t0, d = .55) { return easeOut((t - t0) / d); }

/* ── blocks: measure(b, w) -> height ; draw(b, x, y, w, t) ──────── */
const PAD = 64, GAP = 30;
const B = {};

B.kicker = {
  m: b => 46,
  d(b, x, y, w, t) { textLine(b.text, font('label', 32), x + w, y + 34, b.color || C.crimson); }
};
B.title = {
  m(b, w) { b._f = font('head', b.size || 92, 700); b._l = wrapRich(b.text, b._f, w); b._lh = (b.size || 92) * 1.32; return b._l.length * b._lh + 6; },
  d(b, x, y, w) { drawRich(b._l, b._f, x, y + b._lh * .8, w, b._lh, b.align || 'right', b.color || C.ink); }
};
B.text = {
  m(b, w) { b._f = font('text', b.size || 50, b.bold ? 700 : 400); b._l = wrapRich(b.text, b._f, w); b._lh = (b.size || 50) * 1.62; return b._l.length * b._lh; },
  d(b, x, y, w) { drawRich(b._l, b._f, x, y + b._lh * .72, w, b._lh, b.align || 'right', b.color || C.ink); }
};
B.verse = {
  m(b, w) { b._f = `400 ${b.size || 60}px AmiriQuran`; b._l = wrapRich(b.text, b._f, w - 40); b._lh = (b.size || 60) * 1.95; return b._l.length * b._lh + 70; },
  d(b, x, y, w, t) {
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * .3, y + 4); ctx.lineTo(x + w * .7, y + 4); ctx.stroke();
    drawRich(b._l, b._f, x + 20, y + 24 + b._lh * .75, w - 40, b._lh, 'center', C.ink);
    const yb = y + 24 + b._l.length * b._lh;
    textLine(b.cite, font('label', 30), x + w / 2, yb + 30, C.ink3, 'center');
  }
};
B.quote = {
  m(b, w) { b._f = font('text', b.size || 50); b._l = wrapRich(b.text, b._f, w - 34); b._lh = (b.size || 50) * 1.7; return b._l.length * b._lh + (b.cite ? 52 : 6); },
  d(b, x, y, w) {
    ctx.fillStyle = b.color || C.navy; ctx.fillRect(x + w - 4, y + 6, 4, b._l.length * b._lh - 6);
    drawRich(b._l, b._f, x, y + b._lh * .72, w - 30, b._lh, 'right', C.ink);
    if (b.cite) textLine(b.cite, font('label', 30), x + w - 30, y + b._l.length * b._lh + 34, C.ink3);
  }
};
B.cite = {
  m(b, w) { b._f = font('label', 29); b._l = wrapRich(b.text, b._f, w); return b._l.length * 42; },
  d(b, x, y, w) { drawRich(b._l, b._f, x, y + 30, w, 42, b.align === 'center' ? 'center' : 'right', C.ink3); }
};
B.rule = { m: () => 22, d(b, x, y, w) { ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.setLineDash(b.dash ? [10, 8] : []); ctx.beginPath(); ctx.moveTo(x, y + 11); ctx.lineTo(x + w, y + 11); ctx.stroke(); ctx.setLineDash([]); } };
B.space = { m: b => b.h || 20, d() {} };

// chips: items revealed one by one; {t, at, color, sep}
B.chips = {
  m(b, w) {
    const f = font('text', b.size || 46, 700), padX = 26, h = (b.size || 46) * 1.75, g = 16;
    let rows = [[]], rw = 0;
    b.items.forEach(it => {
      const iw = it.sep ? (it.t === '←' ? 46 : measure(it.t, f) + 8) : measure(it.t, f) + padX * 2;
      if (rw && rw + g + iw > w) { rows.push([]); rw = 0; }
      it.iw = iw; rows[rows.length - 1].push(it); rw += (rw ? g : 0) + iw; // keep the same object so timings resolve
    });
    b._rows = rows; b._f = f; b._h = h; b._g = g; return rows.length * (h + g) - g;
  },
  d(b, x, y, w, t) {
    b._rows.forEach((row, ri) => {
      const total = row.reduce((s, it) => s + it.iw, 0) + b._g * (row.length - 1);
      let xr = b.align === 'right' ? x + w : x + (w + total) / 2;
      const yy = y + ri * (b._h + b._g);
      row.forEach(it => {
        const a = reveal(t, it._t), col = it.color || C.navy;
        if (a > 0) {
          ctx.save(); ctx.globalAlpha *= a; const s = .85 + .15 * a;
          ctx.translate(xr - it.iw / 2, yy + b._h / 2); ctx.scale(s, s);
          if (it.sep && it.t === '←') { // drawn arrow (the glyph is missing from the fonts)
            ctx.strokeStyle = C.ink3; ctx.fillStyle = C.ink3; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.fill();
          } else if (it.sep) textLine(it.t, b._f, 0, b._h * .22, C.ink3, 'center');
          else {
            ctx.fillStyle = it.fill || C.paper2; ctx.strokeStyle = col; ctx.lineWidth = 3;
            roundRect(-it.iw / 2, -b._h / 2, it.iw, b._h, b._h / 2); ctx.fill(); ctx.stroke();
            if (it.strike && t > it._strike) {
              const p = easeOut((t - it._strike) / .4);
              ctx.strokeStyle = C.crimson; ctx.lineWidth = 6; ctx.beginPath();
              ctx.moveTo(it.iw / 2 - 10, 0); ctx.lineTo(it.iw / 2 - 10 - (it.iw - 20) * p, 0); ctx.stroke();
            }
            textLine(it.t, b._f, 0, b._h * .2, col, 'center');
          }
          ctx.restore();
        }
        xr -= it.iw + b._g;
      });
    });
  }
};
// numbered rows with coloured side bar: {n, t, at, strike}
B.steps = {
  m(b, w) {
    b._f = font('text', b.size || 50, 700); b._lh = (b.size || 50) * 1.5;
    b.items.forEach(it => { it._l = wrapRich(it.t, b._f, w - 120); it._h = Math.max(96, it._l.length * b._lh + 34); });
    return b.items.reduce((s, it) => s + it._h + 14, -14);
  },
  d(b, x, y, w, t) {
    const cols = [C.navy, C.gold, C.crimson, C.ink];
    let yy = y;
    b.items.forEach((it, i) => {
      const a = reveal(t, it._t);
      if (a > 0) {
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(30 * (1 - a), 0);
        ctx.fillStyle = C.paper2; ctx.fillRect(x, yy, w, it._h);
        ctx.fillStyle = it.color || cols[i % 4]; ctx.fillRect(x + w - 10, yy, 10, it._h);
        textLine(it.n, font('head', 64, 700), x + w - 54, yy + it._h / 2 + 22, it.color || cols[i % 4], 'center');
        drawRich(it._l, b._f, x + 10, yy + 17 + b._lh * .72, w - 120, b._lh, 'right', C.ink);
        if (it.strike != null && t > it._strike) {
          const p = easeOut((t - it._strike) / .45);
          ctx.strokeStyle = C.crimson; ctx.lineWidth = 7; ctx.beginPath();
          ctx.moveTo(x + w - 110, yy + it._h / 2); ctx.lineTo(x + w - 110 - (w - 130) * p, yy + it._h / 2); ctx.stroke();
        }
        ctx.restore();
      }
      yy += it._h + 14;
    });
  }
};
// two boxes side by side (RTL: first item on the right)
B.compare = {
  m(b, w) {
    const cw = (w - 26) / 2; b._cw = cw; b._f = font('text', b.size || 42); b._hf = font('text', (b.size || 42) + 6, 700);
    let mh = 0;
    b.items.forEach(it => {
      it._hl = wrapRich(it.head || '', b._hf, cw - 44); it._tl = wrapRich(it.text || '', b._f, cw - 44);
      it._h = 70 + it._hl.length * (b.size + 6 || 48) * 1.4 + it._tl.length * (b.size || 42) * 1.6 + 24; mh = Math.max(mh, it._h);
    });
    b._h = mh; return mh;
  },
  d(b, x, y, w, t) {
    b.items.forEach((it, i) => {
      const a = reveal(t, it._t); if (a <= 0) return;
      const bx = i === 0 ? x + w - b._cw : x, col = it.color || (i === 0 ? C.navy : C.crimson);
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, 20 * (1 - a));
      ctx.fillStyle = C.paper2; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.fillRect(bx, y, b._cw, b._h); ctx.strokeRect(bx, y, b._cw, b._h);
      textLine(it.title, font('label', 30), bx + b._cw - 22, y + 44, col);
      const hlh = ((b.size || 42) + 6) * 1.4, tlh = (b.size || 42) * 1.6;
      drawRich(it._hl, b._hf, bx + 22, y + 70 + hlh * .7, b._cw - 44, hlh, 'right', col);
      drawRich(it._tl, b._f, bx + 22, y + 70 + it._hl.length * hlh + tlh * .7, b._cw - 44, tlh, 'right', C.ink2);
      if (it.mark) textLine(it.mark, font('head', 70, 700), bx + 40, y + 70, col, 'center');
      ctx.restore();
    });
  }
};
// photo print(s): {items:[{key, cap, at, crop:[sx,sy,sw,sh]}], h}
B.prints = {
  m(b, w) { b._h = b.h || 520; return b._h + 92; },
  d(b, x, y, w, t) {
    const n = b.items.length, gw = (w - 40 * (n - 1)) / n;
    b.items.forEach((it, i) => {
      const img = IMG[it.key]; if (!img) return;
      const a = reveal(t, it._t, .7); if (a <= 0) return;
      const cr = it.crop || [0, 0, 1, 1];
      const sw = img.width * cr[2], sh = img.height * cr[3];
      let ih = b._h - 40, iw = ih * sw / sh; if (iw > gw - 40) { iw = gw - 40; ih = iw * sh / sw; }
      const cx = x + w - gw / 2 - i * (gw + 40), cy = y + b._h / 2;
      const s = lerp(1.12, 1, easeOut((t - it._t) / .6)), rot = ((i % 2) ? 1.6 : -1.3) * Math.PI / 180;
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s, s);
      ctx.shadowColor = 'rgba(40,25,10,' + (0.35 * a) + ')'; ctx.shadowBlur = lerp(40, 18, a); ctx.shadowOffsetY = lerp(26, 8, a);
      ctx.fillStyle = '#FBF8F1'; ctx.fillRect(-iw / 2 - 18, -ih / 2 - 18, iw + 36, ih + 36);
      ctx.shadowColor = 'transparent';
      ctx.drawImage(img, img.width * cr[0], img.height * cr[1], sw, sh, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= a;
      const capF = font('label', 30), cl = wrapRich(it.cap || '', capF, gw);
      drawRich(cl, capF, cx - gw / 2, y + b._h + 26, gw, 38, 'center', C.ink2);
      const cr2 = CREDITS[it.key]; if (cr2) textLine(cr2, font('label', 20, 400), cx, y + b._h + 26 + cl.length * 38 + 2, C.ink3, 'center', 'ltr');
      ctx.restore();
    });
  }
};
// fallacy header: red tag + name + english
B.fallacy = {
  m: () => 170,
  d(b, x, y, w, t) {
    const a = reveal(t, b._t);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = C.crimson; roundRect(x + w - 150, y, 150, 50, 4); ctx.fill();
    textLine('مغالطة', font('label', 30), x + w - 75, y + 36, '#FBF3E6', 'center');
    textLine(b.name, font('head', 76, 700), x + w, y + 130, C.crimson);
    textLine(b.en, font('label', 30, 400), x, y + 36, C.ink3, 'left', 'ltr');
    ctx.restore();
  }
};
B.example = {
  m(b, w) { b._f = font('text', b.size || 46); b._l = wrapRich(b.text, b._f, w); b._lh = (b.size || 46) * 1.6; return 64 + b._l.length * b._lh; },
  d(b, x, y, w) {
    ctx.strokeStyle = C.crimson; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + w, y + 6); ctx.stroke(); ctx.setLineDash([]);
    textLine('مثال من الحياة اليومية', font('label', 28), x + w, y + 46, C.crimson);
    drawRich(b._l, b._f, x, y + 64 + b._lh * .72, w, b._lh, 'right', C.ink);
  }
};
B.big = {
  m(b) { return (b.size || 180) * 1.25 + (b.sub ? 70 : 0); },
  d(b, x, y, w, t) {
    const s = b.size || 180, a = reveal(t, b._t, .5), sc = lerp(1.25, 1, easeOut((t - b._t) / .45));
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2, y + s * .9); ctx.scale(sc, sc);
    textLine(b.text, font(b.font || 'head', s, 700), 0, 0, b.color || C.crimson, 'center');
    ctx.restore();
    if (b.sub) { ctx.save(); ctx.globalAlpha *= a; textLine(b.sub, font('label', 34), x + w / 2, y + s * 1.25 + 40, C.ink2, 'center'); ctx.restore(); }
  }
};
// horizontal era strip used in "who came first"
B.era = {
  m: () => 150,
  d(b, x, y, w, t) {
    const items = b.items, n = items.length, y0 = y + 60;
    ctx.strokeStyle = C.ink3; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + w, y0); ctx.stroke();
    items.forEach((it, i) => {
      const xx = x + w - (i + .5) * (w / n), on = i === b.active, past = i < b.active;
      ctx.beginPath(); ctx.arc(xx, y0, on ? 16 : 10, 0, Math.PI * 2);
      ctx.fillStyle = on ? C.crimson : past ? C.ink2 : C.paper; ctx.fill(); ctx.strokeStyle = on ? C.crimson : C.ink3; ctx.stroke();
      textLine(it[0], font('label', on ? 30 : 25), xx, y0 - 30, on ? C.crimson : C.ink3, 'center');
      textLine(it[1], font('label', 23, 400), xx, y0 + 52, on ? C.ink : C.ink3, 'center');
    });
  }
};
B.table = {
  m(b, w) { b._rh = 92; return 70 + b.rows.length * b._rh; },
  d(b, x, y, w, t) {
    const cols = b.head.length, c0 = w * .34, cw = (w - c0) / (cols - 1);
    const cx = i => i === 0 ? x + w - c0 / 2 : x + (w - c0) - (i - .5) * cw;
    b.head.forEach((h, i) => textLine(h, font('label', 28), cx(i), y + 40, C.crimson, 'center'));
    ctx.fillStyle = C.ink; ctx.fillRect(x, y + 58, w, 3);
    b.rows.forEach((r, ri) => {
      const a = reveal(t, r._t); if (a <= 0) return;
      const yy = y + 70 + ri * b._rh;
      ctx.save(); ctx.globalAlpha *= a;
      r.cells.forEach((c, i) => {
        const ok = c === '✓' || c === 'صحيح', bad = c === '✗' || c === 'خطأ';
        textLine(c, ok || bad ? font('head', 60, 700) : font('text', 40, 700), cx(i), yy + 60,
          ok ? C.green : bad ? C.crimson : C.navy, 'center');
      });
      ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yy + b._rh); ctx.lineTo(x + w, yy + b._rh); ctx.stroke();
      ctx.restore();
    });
  }
};
// custom drawings (see DIAGRAMS)
B.diagram = { m: b => b.h, d(b, x, y, w, t) { DIAGRAMS[b.name](b, x, y, w, b.h, t); } };

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function arrow(x1, y1, x2, y2, col, lw = 4, p = 1) {
  const xe = lerp(x1, x2, p), ye = lerp(y1, y2, p), ang = Math.atan2(ye - y1, xe - x1);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xe, ye); ctx.stroke();
  if (p > .95) { ctx.beginPath(); ctx.moveTo(xe, ye); ctx.lineTo(xe - 22 * Math.cos(ang - .45), ye - 22 * Math.sin(ang - .45)); ctx.lineTo(xe - 22 * Math.cos(ang + .45), ye - 22 * Math.sin(ang + .45)); ctx.fill(); }
}
function label(s, x, y, col, size = 34, align = 'center') { textLine(s, font('label', size), x, y, col, align); }

/* ── diagrams ─────────────────────────────────────────────────── */
const DIAGRAMS = {
  // three observation sources: droplet, scalpel, egg
  trio(b, x, y, w, h, t) {
    const items = b.items, n = items.length;
    items.forEach((it, i) => {
      const a = reveal(t, it._t); if (a <= 0) return;
      const cx = x + w - (i + .5) * w / n, cy = y + h * .4;
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(.8 + .2 * a, .8 + .2 * a);
      ctx.fillStyle = C.paper2; ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (it.icon === 'drop') { ctx.fillStyle = C.crimson; ctx.beginPath(); ctx.moveTo(0, -52); ctx.bezierCurveTo(34, -6, 42, 20, 0, 46); ctx.bezierCurveTo(-42, 20, -34, -6, 0, -52); ctx.fill(); }
      if (it.icon === 'knife') { ctx.rotate(-.6); ctx.fillStyle = C.ink2; ctx.fillRect(-8, 0, 16, 56); ctx.fillStyle = '#A8A8A8'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(4, -62); ctx.quadraticCurveTo(-10, -30, -8, 0); ctx.fill(); }
      if (it.icon === 'egg') { ctx.fillStyle = '#F7F1E4'; ctx.strokeStyle = C.ink3; ctx.beginPath(); ctx.ellipse(0, 4, 40, 54, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.crimson; ctx.beginPath(); ctx.arc(0, 10, 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= a; label(it.t, cx, cy + 150, C.ink, 38); ctx.restore();
    });
  },
  // the exam: two papers with the same wrong answer
  exam(b, x, y, w, h, t) {
    const a = reveal(t, b._t);
    [[-1, -.05], [1, .06]].forEach(([s, r], i) => {
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2 + s * w * .23, y + h * .38); ctx.rotate(r);
      ctx.shadowColor = 'rgba(40,25,10,.25)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFDF7'; ctx.fillRect(-180, -150, 360, 300); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#BFD0E6'; ctx.lineWidth = 2; for (let k = -100; k < 150; k += 40) { ctx.beginPath(); ctx.moveTo(-160, k); ctx.lineTo(160, k); ctx.stroke(); }
      textLine('٧ × ٨ = ٥٤', font('text', 66, 700), 0, 10, C.navy, 'center');
      // circle the shared wrong answer (٥٤ sits at the left end)
      const p = clamp((t - b._x) / .6);
      if (p > 0) { ctx.strokeStyle = C.crimson; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(-92, -12, 62, 50, -.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut(p)); ctx.stroke();
        if (p > .8) textLine('خطأ', font('label', 34), -92, 95, C.crimson, 'center'); }
      ctx.restore();
    });
  },
  // clot vs sac
  clot(b, x, y, w, h, t) {
    const a1 = reveal(t, b._t), a2 = reveal(t, b._t2);
    const cx1 = x + w * .72, cx2 = x + w * .26, cy = y + h * .42;
    if (a1 > 0) {
      ctx.save(); ctx.globalAlpha *= a1; ctx.fillStyle = '#7A1C16'; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const an = k / 40 * Math.PI * 2, r = 110 + 18 * Math.sin(an * 3 + 1) + 10 * Math.sin(an * 7); ctx.lineTo(cx1 + r * Math.cos(an), cy + r * .8 * Math.sin(an)); }
      ctx.fill(); ctx.fillStyle = '#A3332A'; ctx.beginPath(); ctx.ellipse(cx1 - 30, cy - 25, 40, 22, -.4, 0, Math.PI * 2); ctx.fill();
      label('جلطة = دمُ الأم', cx1, cy + 170, C.crimson, 40); ctx.restore();
    }
    if (a2 > 0) {
      ctx.save(); ctx.globalAlpha *= a2; ctx.strokeStyle = C.ink3; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(230,220,200,.8)';
      ctx.beginPath(); ctx.arc(cx2, cy, 70, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink2; ctx.beginPath(); ctx.arc(cx2 + 12, cy + 8, 9, 0, Math.PI * 2); ctx.fill();
      label('نسيج الحمل', cx2, cy + 170, C.ink2, 40); ctx.restore();
    }
  },
  // 40/40/40 day bar with the day-56 marker
  daybar(b, x, y, w, h, t) {
    const x0 = x + w, x1 = x, day = d => lerp(x0, x1, d / 120), yb = y + 150;
    const segs = [[0, 40, 'نطفة', C.gold], [40, 80, 'علقة', C.crimson], [80, 120, 'مضغة', C.navy]];
    segs.forEach((s, i) => {
      const a = reveal(t, b._ts[i]); if (a <= 0) return;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = s[3];
      ctx.fillRect(day(s[1]), yb, (day(s[0]) - day(s[1])) * easeOut((t - b._ts[i]) / .6), 64);
      label(s[2], (day(s[0]) + day(s[1])) / 2, yb + 45, '#FBF3E6', 36); ctx.restore();
    });
    ctx.fillStyle = C.ink2;
    [0, 40, 80, 120].forEach(d => label(toAr(d), day(d), yb + 110, C.ink2, 30));
    label('يوماً', x + w / 2, yb + 160, C.ink3, 26);
    const am = reveal(t, b._tm);
    if (am > 0) {
      ctx.save(); ctx.globalAlpha *= am; const xm = day(56);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(xm, yb - 70); ctx.lineTo(xm, yb + 84); ctx.stroke(); ctx.setLineDash([]);
      label('اليوم ٥٦: البنى الرئيسة تأسّست', xm, yb - 86, C.ink, 32); ctx.restore();
    }
    label('فهمُ القرطبي للحديث', x + w, yb + 160, C.ink3, 28, 'right');
  },
  // somites splitting + limb with cartilage and muscle
  somite(b, x, y, w, h, t) {
    const a = reveal(t, b._t), split = easeOut((t - b._tsplit) / .8), a2 = reveal(t, b._tl);
    const cy = y + 150;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = C.ink3; ctx.fillRect(x + w * .5, cy - 8, w * .5, 16); // neural tube
    for (let k = 0; k < 4; k++) { const sx = x + w - 60 - k * 115; ctx.fillStyle = '#C9A98A'; roundRect(sx - 45, cy + 20, 90, 90, 12); ctx.fill(); }
    // split view of one somite
    const bx = x + w * .3, parts = [['فقرات', C.navy], ['عضلات', C.crimson], ['جلد', C.gold]];
    parts.forEach((p, i) => {
      const off = (i - 1) * 64 * split;
      ctx.fillStyle = p[1]; roundRect(bx - 70, cy - 20 + i * 46 + off, 140, 44, 8); ctx.fill();
      if (split > .3) { ctx.save(); ctx.globalAlpha *= clamp((split - .3) / .5); label(p[0], bx - 110, cy + 12 + i * 46 + off, p[1], 34, 'right'); ctx.restore(); }
    });
    label('الجُسيدات', x + w - 225, cy + 160, C.ink2, 32);
    ctx.restore();
    if (a2 > 0) {
      ctx.save(); ctx.globalAlpha *= a2; const ly = y + 470;
      ctx.fillStyle = '#E8C9B0'; roundRect(x + 60, ly - 70, w - 120, 140, 70); ctx.fill();
      ctx.fillStyle = '#CFE0E8'; ctx.strokeStyle = '#7FA3B5'; ctx.lineWidth = 3;
      [[x + w * .58, w * .3], [x + w * .2, w * .26]].forEach(([bx2, bw]) => { roundRect(bx2, ly - 22, bw, 44, 22); ctx.fill(); ctx.stroke(); });
      const r = rng(7); ctx.fillStyle = C.crimson;
      for (let k = 0; k < 46; k++) { const px = x + 90 + r() * (w - 180), py = ly + (r() < .5 ? -1 : 1) * (34 + r() * 26); ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); }
      label('غضروف', x + w * .73, ly + 120, '#4E7C92', 32); label('خلايا العضل', x + w * .3, ly + 120, C.crimson, 32);
      label('الطرف', x + w - 50, ly - 90, C.ink2, 30, 'right');
      ctx.restore();
    }
  },
  // ossification timeline
  ossify(b, x, y, w, h, t) {
    const xr = x + w - 20, xl = x + 120, wk = n => lerp(xr, xl, n / 40), yb = y + 140;
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(xr, yb); ctx.lineTo(xl, yb); ctx.stroke();
    [0, 10, 20, 30, 40].forEach(n => { ctx.fillStyle = C.ink2; ctx.fillRect(wk(n) - 2, yb - 10, 4, 20); label(toAr(n), wk(n), yb + 48, C.ink2, 28); });
    label('أسبوعاً من الإخصاب', x + w / 2, yb + 92, C.ink3, 26);
    const a1 = reveal(t, b._ts[0]), a2 = reveal(t, b._ts[1]), a3 = reveal(t, b._ts[2]);
    if (a1 > 0) { ctx.save(); ctx.globalAlpha *= a1; ctx.fillStyle = C.crimson; ctx.beginPath(); ctx.arc(wk(5.5), yb, 16, 0, Math.PI * 2); ctx.fill(); label('الترقوة', wk(5.5), yb - 84, C.crimson, 34); ctx.restore(); }
    if (a2 > 0) { ctx.save(); ctx.globalAlpha *= a2; ctx.fillStyle = 'rgba(39,58,104,.85)'; ctx.fillRect(wk(17), yb - 18, wk(9) - wk(17), 36); label('معظم العظام الطويلة', (wk(9) + wk(17)) / 2, yb - 40, C.navy, 34); ctx.restore(); }
    if (a3 > 0) { ctx.save(); ctx.globalAlpha *= a3; arrow(xl + 20, yb, x + 10, yb, C.gold, 6); label('بعد الولادة…', x + 60, yb - 34, C.gold, 32); ctx.restore(); }
  },
  // strict vs flexible reading
  fork(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const top = [x + w / 2, y + 40];
    label('«فكسونا العظامَ لحماً»', top[0], top[1] + 10, C.ink, 40);
    const L1 = [x + w * .75, y + h - 120], L2 = [x + w * .25, y + h - 120];
    const p1 = reveal(t, b._t1, .5), p2 = reveal(t, b._t2, .5);
    if (p1 > 0) { arrow(top[0] + 20, top[1] + 40, L1[0], L1[1] - 70, C.navy, 4, p1); ctx.globalAlpha = a * p1; label('ترتيبٌ صارم', L1[0], L1[1] - 20, C.navy, 40); label('يخالف العلم', L1[0], L1[1] + 40, C.crimson, 38); }
    ctx.globalAlpha = a;
    if (p2 > 0) { arrow(top[0] - 20, top[1] + 40, L2[0], L2[1] - 70, C.gold, 4, p2); ctx.globalAlpha = a * p2; label('صورةٌ مرنة', L2[0], L2[1] - 20, C.gold, 40); label('لا إعجاز فيها', L2[0], L2[1] + 40, C.crimson, 38); }
    ctx.restore();
  },
  // torso: back (sulb), chest (tara'ib), pelvis
  torso(b, x, y, w, h, t) {
    const cx = x + w * .55, top = y + 30;
    ctx.save();
    ctx.fillStyle = '#E9D9C2'; ctx.strokeStyle = C.ink3; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, top + 60, 55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    roundRect(cx - 130, top + 130, 260, 330, 70); ctx.fill(); ctx.stroke();
    roundRect(cx - 120, top + 450, 240, 120, 50); ctx.fill(); ctx.stroke();
    const z = (t0, draw) => { const a = reveal(t, t0); if (a > 0) { ctx.save(); ctx.globalAlpha *= a; draw(); ctx.restore(); } };
    z(b._tb, () => { ctx.fillStyle = 'rgba(39,58,104,.75)'; for (let k = 0; k < 9; k++) roundRect(cx - 14, top + 140 + k * 36, 28, 28, 6), ctx.fill(); label('الصلب (الظهر)', cx + 160, top + 250, C.navy, 36, 'left'); });
    z(b._tc, () => { ctx.fillStyle = 'rgba(181,133,43,.55)'; roundRect(cx - 120, top + 150, 240, 120, 30); ctx.fill(); label('الترائب (الصدر)', cx - 160, top + 210, C.gold, 36, 'right'); });
    z(b._tp, () => { ctx.fillStyle = 'rgba(156,42,34,.7)'; ctx.beginPath(); ctx.ellipse(cx, top + 515, 90, 45, 0, 0, Math.PI * 2); ctx.fill(); label('الحوض: الخصيتان، الحويصلات، البروستاتا', cx, top + 620, C.crimson, 32); });
    ctx.restore();
  },
  // ovum + sperm, X/Y
  genetics(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; const cy = y + h * .42;
    ctx.fillStyle = '#F2D6C2'; ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + w * .7, cy, 110, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label('البويضة', x + w * .7, cy + 160, C.gold, 36);
    const sx = x + w * .28; ctx.fillStyle = C.navy; ctx.beginPath(); ctx.ellipse(sx, cy, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.navy; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx - 30, cy);
    for (let k = 0; k < 40; k++) ctx.lineTo(sx - 30 - k * 5, cy + 12 * Math.sin(k * .5 + t * 6)); ctx.stroke();
    label('الحيوان المنوي', sx - 40, cy + 160, C.navy, 36);
    const ax = reveal(t, b._tx);
    if (ax > 0) { ctx.globalAlpha = a * ax; textLine('X / Y', font('label', 44), sx, cy - 50, C.crimson, 'center', 'ltr'); label('يحدّد الجنس', sx, cy - 100, C.crimson, 30); }
    ctx.globalAlpha = a; textLine('+', font('label', 90), x + w * .49, cy + 30, C.ink3, 'center', 'ltr');
    ctx.restore();
  },
  // arrows first, target painted around them
  target(b, x, y, w, h, t) {
    const cx = x + w / 2, cy = y + h * .48, a = reveal(t, b._t);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = '#B88F62'; for (let k = 0; k < 6; k++) { ctx.fillRect(x + 40, y + k * (h / 6), w - 80, h / 6 - 6); }
    const hits = [[-70, -30], [40, 20], [-10, 60]];
    hits.forEach(([dx, dy], i) => { const p = clamp((t - b._t - i * .35) / .3); if (p <= 0) return;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx + dx + 120 * p, cy + dy - 70 * p); ctx.stroke(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2); ctx.fill(); });
    const pr = clamp((t - b._t2) / 1.2);
    if (pr > 0) [150, 105, 60].forEach((r, i) => { ctx.strokeStyle = i % 2 ? '#FBF3E6' : C.crimson; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx - 10, cy + 15, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr); ctx.stroke(); });
    ctx.restore();
  },
  // goalpost slides away as the ball arrives
  goal(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    const p = ease((t - b._t - .6) / 1.6), gy = y + h * .7;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = '#7FA06B'; ctx.fillRect(x + 20, gy, w - 40, 26);
    const gx = lerp(x + w * .3, x + w * .08, p);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 200); ctx.lineTo(gx + 150, gy - 200); ctx.lineTo(gx + 150, gy); ctx.stroke();
    const bx = lerp(x + w * .85, x + w * .36, ease((t - b._t) / 1.6)); ctx.fillStyle = '#FFF'; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, gy - 30, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (p > .1) arrow(x + w * .3 + 75, gy - 240, gx + 75, gy - 240, C.crimson, 4, 1);
    ctx.restore();
  },
  // fetal testes near kidneys, descending
  descent(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; const cx = x + w * .5;
    ctx.fillStyle = '#B5574B'; ctx.beginPath(); ctx.ellipse(cx - 90, y + 90, 34, 56, .2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 90, y + 90, 34, 56, -.2, 0, Math.PI * 2); ctx.fill();
    label('الكليتان', cx, y + 40, C.ink2, 30);
    const p = ease((t - b._t - .4) / 1.4), ty = lerp(y + 170, y + h - 60, p);
    ctx.setLineDash([8, 8]); ctx.strokeStyle = C.ink3; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, y + 170); ctx.lineTo(cx, y + h - 60); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.navy; ctx.beginPath(); ctx.arc(cx, ty, 22, 0, Math.PI * 2); ctx.fill();
    label('في الجنين: تنزل الخصية', cx + 50, (y + 170 + y + h - 60) / 2, C.navy, 32, 'left');
    ctx.restore();
  },
  // heart beat at day 21
  heart(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    const beat = 1 + .08 * Math.max(0, Math.sin(t * 7.5)), cx = x + w * .78, cy = y + h * .5;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(beat * 1.6, beat * 1.6);
    ctx.fillStyle = C.crimson; ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-60, -10, -30, -60, 0, -30); ctx.bezierCurveTo(30, -60, 60, -10, 0, 30); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= a;
    textLine('اليوم ٢١', font('head', 120, 700), x + w * .52, y + h * .55, C.ink, 'right');
    label('يبدأ نشاط القلب', x + w * .32, y + h * .55 + 70, C.ink2, 34);
    ctx.restore();
  },
  // book cover (for modern books with no free image)
  book(b, x, y, w, h, t) {
    const a = reveal(t, b._t); if (a <= 0) return;
    const bw = 300, bh = h - 20, cx = x + w * .72;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, y + h / 2); ctx.rotate(-.04);
    ctx.shadowColor = 'rgba(40,25,10,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
    ctx.fillStyle = b.color || C.navy; ctx.fillRect(-bw / 2, -bh / 2, bw, bh); ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-bw / 2, -bh / 2, 18, bh);
    b.lines.forEach((s, i) => textLine(s, font('label', i === 0 ? 25 : 21, i === 0 ? 600 : 400), 8, -bh / 2 + 80 + i * 40, '#F3EBDC', 'center', 'ltr'));
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= a;
    (b.side || []).forEach((s, i) => label(s, x + w * .38, y + h * .35 + i * 60, i === 0 ? C.ink : C.ink3, i === 0 ? 40 : 30));
    ctx.restore();
  }
};
const toAr = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

/* ── cards ────────────────────────────────────────────────────── */
let CARDS = [], SECTIONS = [];
function layoutCard(card) {
  const w = card.w || 1000, iw = w - PAD * 2;
  let y = PAD + 30;
  card.blocks.forEach(b => { b._y = y; b._hgt = B[b.type].m(b, iw); y += b._hgt + (b.gap ?? GAP); });
  card.w = w; card.h = y - GAP + PAD;
}
function resolveTimes(card) {
  const t0 = card.t0;
  card.blocks.forEach((b, i) => {
    b._t = T(b.at, t0 + .15 + i * .22);
    (b.items || []).forEach((it, j) => { it._t = T(it.at, b._t + j * .25); if (it.strike != null) it._strike = T(it.strike, 0); });
    (b.rows || []).forEach((r, j) => { r._t = T(r.at, b._t + j * .4); });
    // extra sync moments used by diagrams (single time specs), plus `ts` = list of time specs
    ['t2', 'x', 'tl', 'tm', 'tb', 'tc', 'tp', 'tx', 't1', 'tsplit'].forEach(k => { if (b[k] != null) b['_' + k] = T(b[k]); });
    if (b.ts) b._ts = b.ts.map(s => T(s));
  });
  (card.stamps || []).forEach(s => s._t = T(s.at));
}
function drawCard(card, t, dim) {
  ctx.save(); ctx.translate(card.x, card.y); ctx.rotate(card.rot);
  const w = card.w, h = card.h, x0 = -w / 2, y0 = -h / 2;
  ctx.shadowColor = 'rgba(60,40,15,.28)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.fillStyle = C.paper; ctx.fillRect(x0, y0, w, h); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);
  ctx.strokeStyle = C.rule; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 26, y0 + 26, w - 52, h - 52);
  if (card.tag) { ctx.fillStyle = C.paper; const tw = measure(card.tag, font('label', 28)) + 30; ctx.fillRect(x0 + w - 60 - tw, y0 + 4, tw, 32); textLine(card.tag, font('label', 28), x0 + w - 75, y0 + 31, C.crimson); }
  card.blocks.forEach(b => {
    const st = b.type === 'chips' || b.type === 'steps' || b.type === 'prints' || b.type === 'table' || b.type === 'compare' || b.type === 'diagram' || b.type === 'big' || b.type === 'fallacy';
    const a = st ? 1 : reveal(t, b._t);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, st ? 0 : 18 * (1 - a));
    B[b.type].d(b, x0 + PAD, y0 + b._y, w - PAD * 2, t);
    ctx.restore();
  });
  (card.stamps || []).forEach(s => {
    const p = (t - s._t); if (p < 0) return;
    const sc = lerp(1.7, 1, easeOut(p / .22)), al = clamp(p / .12);
    ctx.save(); ctx.globalAlpha *= al * .92; ctx.translate(x0 + (s.x ?? .22) * w, y0 + (s.y ?? .18) * h); ctx.rotate((s.rot ?? -9) * Math.PI / 180); ctx.scale(sc, sc);
    const sf = font('head', s.size || 74, 700), tw = measure(s.text, sf) + 60;
    ctx.strokeStyle = s.color || C.crimson; ctx.lineWidth = 7; roundRect(-tw / 2, -62, tw, 112, 10); ctx.stroke();
    ctx.lineWidth = 2; roundRect(-tw / 2 + 9, -53, tw - 18, 94, 6); ctx.stroke();
    textLine(s.text, sf, 0, 22, s.color || C.crimson, 'center');
    ctx.restore();
  });
  if (dim > 0) { ctx.fillStyle = `rgba(214,198,168,${.72 * dim})`; ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4); }
  ctx.restore();
}

/* ── world layout & camera ────────────────────────────────────── */
const SAFE = PORTRAIT ? { x0: W * .05, x1: W * .95, y0: H * .13, y1: H * .78 } : { x0: W * .07, x1: W * .93, y0: H * .07, y1: H * .87 };
const SW = SAFE.x1 - SAFE.x0, SH = SAFE.y1 - SAFE.y0, SCX = (SAFE.x0 + SAFE.x1) / 2, SCY = (SAFE.y0 + SAFE.y1) / 2;
const S = Math.min(W, H) / 1080;
function placeCards() {
  let x = 0, sec = -1; const r = rng(11);
  CARDS.forEach((c, i) => {
    if (c.section !== sec) { if (i) x -= 520; sec = c.section; c.sectionStart = true; }
    if (i) x -= (CARDS[i - 1].w / 2 + c.w / 2 + 300);
    c.x = x; c.y = 300 * Math.sin(i * .85) + (r() - .5) * 120; c.rot = (r() - .5) * 0.045;
    // fit the card; tall cards may be panned, but never shrink text below a readable size
    c.zoom = Math.min(SW / (c.w + 60), Math.max(SH / (c.h + 60), (PORTRAIT ? .92 : .76) * S));
  });
}
// vertical focus inside tall cards: follows the newest revealed block
function focusY(c, t) {
  const viewH = SH / c.zoom; if (c.h + 60 <= viewH) return 0;
  const lim = (c.h - viewH) / 2 + 40, targets = c.blocks.map(b => ({ t: b._t, y: clamp(b._y + b._hgt / 2 - c.h / 2, -lim, lim) }));
  let y = -lim;
  targets.forEach(g => { y = lerp(y, Math.max(y, g.y), smooth((t - g.t + .3) / 1.1)); });
  return y;
}
// the current card changes only once the camera has finished travelling to it (travel ends at next.t0 + .9)
function cardAt(t) { let k = 0; for (let i = 1; i < CARDS.length; i++) if (t >= CARDS[i].t0 + .9) k = i; return k; }
function camera(t) {
  const k = cardAt(t), c = CARDS[k], n = CARDS[k + 1];
  const pose = (cc, tt) => { const fy = focusY(cc, tt); return { x: cc.x - Math.sin(cc.rot) * fy, y: cc.y + Math.cos(cc.rot) * fy, z: cc.zoom, r: cc.rot }; };
  const hold = pose(c, t);
  const hp = clamp((t - c.t0) / Math.max(1, c.t1 - c.t0));
  hold.z *= 1 + .035 * smooth(hp);
  if (n) { hold.x += (n.x - c.x) * .012 * smooth(hp); hold.y += (n.y - c.y) * .012 * smooth(hp); }
  let cam = hold, focus = [[k, 1]];
  if (n) {
    const a = c.t1 - .25, b = n.t0 + .9;
    if (t > a) {
      const p = ease((t - a) / (b - a)), np = pose(n, t);
      const d = Math.hypot(np.x - hold.x, np.y - hold.y), dip = clamp(d / 5200, .05, .28) * Math.sin(Math.PI * p);
      const sway = Math.sin(Math.PI * p) * 80;
      cam = { x: lerp(hold.x, np.x, p), y: lerp(hold.y, np.y, p) - sway, z: Math.exp(lerp(Math.log(hold.z), Math.log(np.z), p)) * (1 - dip), r: lerp(hold.r, np.r, p) };
      focus = [[k, 1 - p], [k + 1, p]];
    }
  }
  // gentle handheld
  cam.x += (3 * Math.sin(t * .37 + 1.3) + 2 * Math.sin(t * .61 + .2)) / cam.z;
  cam.y += (3 * Math.sin(t * .43 + 2.1) + 2 * Math.sin(t * .29 + .9)) / cam.z;
  cam.r += .0012 * Math.sin(t * .31 + .5);
  cam.focus = focus; cam.k = k;
  return cam;
}

/* ── desk texture, vignette, grain ────────────────────────────── */
let deskPat, vign, grains = [];
function makeTextures() {
  const d = document.createElement('canvas'); d.width = d.height = 512; const g = d.getContext('2d'), r = rng(3);
  g.fillStyle = C.desk; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < .5 ? '120,95,60' : '255,250,235'},${r() * .06})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(110,85,50,${r() * .05})`; g.lineWidth = 1; g.beginPath(); const x = r() * 512, y = r() * 512; g.moveTo(x, y); g.lineTo(x + (r() - .5) * 90, y + (r() - .5) * 20); g.stroke(); }
  deskPat = ctx.createPattern(d, 'repeat');
  vign = document.createElement('canvas'); vign.width = W; vign.height = H; const v = vign.getContext('2d');
  const gr = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,25,10,.42)'); v.fillStyle = gr; v.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) { const n = document.createElement('canvas'); n.width = n.height = 256; const ng = n.getContext('2d'), id = ng.createImageData(256, 256), rr = rng(100 + k);
    for (let i = 0; i < id.data.length; i += 4) { const v2 = 128 + (rr() - .5) * 90; id.data[i] = id.data[i + 1] = id.data[i + 2] = v2; id.data[i + 3] = 255; }
    ng.putImageData(id, 0, 0); grains.push(ctx.createPattern(n, 'repeat')); }
}

/* ── screen overlays: brand + section progress ────────────────── */
function overlays(t, cam) {
  const sec = CARDS[cam.k].section, n = SECTIONS.length;
  const bw = PORTRAIT ? W * .82 : W * .44, sh = 10 * S, gap = 8 * S, segW = (bw - gap * (n - 1)) / n;
  const bx = (W + bw) / 2, by = PORTRAIT ? H * .085 : H - 48 * S;
  for (let i = 0; i < n; i++) {
    const x = bx - (i + 1) * segW - i * gap;
    ctx.fillStyle = 'rgba(29,27,24,.18)'; ctx.fillRect(x, by, segW, sh);
    const secCards = CARDS.filter(c => c.section === i), s0 = secCards[0].t0, s1 = secCards[secCards.length - 1].t1;
    const p = clamp((t - s0) / (s1 - s0));
    if (p > 0) { ctx.fillStyle = i === sec ? C.crimson : C.ink2; ctx.fillRect(x + segW * (1 - p), by, segW * p, sh); }
  }
  textLine(SECTIONS[sec], font('label', 30 * S), bx, by - 16 * S, C.ink, 'right');
  // brand badge
  const bfs = 30 * S, tw = measure('جدليات', font('head', bfs, 700)) + 28 * S;
  const bxx = PORTRAIT ? W * .09 : W - 40 * S - tw, byy = PORTRAIT ? H * .085 - 34 * S : 34 * S;
  ctx.fillStyle = C.crimson; ctx.fillRect(bxx, byy, tw, 50 * S); textLine('جدليات', font('head', bfs, 700), bxx + tw / 2, byy + 36 * S, '#FBF3E6', 'center');
}

/* ── frame ────────────────────────────────────────────────────── */
function drawFrame(t, opts = {}) {
  const cam = camera(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // desk (moves with the camera)
  ctx.save(); ctx.translate(SCX, SCY); ctx.scale(cam.z, cam.z); ctx.rotate(-cam.r); ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = deskPat; const R = Math.hypot(W, H) / cam.z; ctx.fillRect(cam.x - R, cam.y - R, R * 2, R * 2);
  // big faint section numerals on the desk
  CARDS.forEach(c => { if (c.sectionStart && Math.abs(c.x - cam.x) < R * 1.5) { ctx.save(); ctx.globalAlpha = .07; textLine(toAr(c.section + 1), font('head', 900, 700), c.x + c.w / 2 + 120, c.y + 300, C.ink, 'center'); ctx.restore(); } });
  const fmap = new Map(cam.focus);
  CARDS.forEach((c, i) => {
    if (Math.abs(c.x - cam.x) > R + c.w || Math.abs(c.y - cam.y) > R + c.h) return;
    drawCard(c, t, 1 - (fmap.get(i) || 0));
  });
  ctx.restore();
  ctx.drawImage(vign, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .09; ctx.fillStyle = grains[Math.floor(t * 30) % 4];
  ctx.translate((Math.floor(t * 30) * 37) % 256, (Math.floor(t * 30) * 59) % 256); ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  overlays(t, cam);
  if (opts.debug) { ctx.strokeStyle = 'lime'; ctx.lineWidth = 2; ctx.strokeRect(SAFE.x0, SAFE.y0, SW, SH); textLine(t.toFixed(2) + 's  card ' + CARDS[cam.k].id, '24px monospace', 20, 40, 'lime', 'left', 'ltr'); }
}

/* ── boot ─────────────────────────────────────────────────────── */
async function boot() {
  await loadHB();
  TL = await (await fetch(`${ART}/timings.json`)).json();
  TL.lines.forEach(l => LINE[l.id] = l); DUR = TL.duration;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `${ART}/beats.js`; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const D = window.BEATS;
  SECTIONS = D.sections;
  const cred = await (await fetch(`${ART}/img/credits.json`)).json();
  await Promise.all(Object.entries(cred).map(async ([k, v]) => {
    IMG[k] = await loadImg(`${ART}/img/${v.file}`);
    CREDITS[k] = v.license + (/Wellcome/.test(v.title) ? ' — Wellcome Collection' : ' — Wikimedia Commons');
  }));
  await document.fonts.load(font('text', 40)); await document.fonts.load(font('text', 40, 700));
  await document.fonts.load(font('head', 40, 700)); await document.fonts.load(font('label', 40)); await document.fonts.load(font('label', 40, 400));
  await document.fonts.load('400 40px Kufi', 'Appeal'); await document.fonts.load('400 40px Amiri', 'X');
  await document.fonts.ready;
  ctx.font = font('text', 40); ctx.fillText('تهيئة ابجد', 0, -100); ctx.font = font('head', 40, 700); ctx.fillText('تهيئة', 0, -100);
  CARDS = D.cards.map(c => ({ ...c, blocks: c.blocks.map(b => ({ ...b, items: b.items && b.items.map(i => ({ ...i })), rows: b.rows && b.rows.map(r => ({ ...r })) })) }));
  CARDS.forEach(c => { c.t0 = LINE[c.lines[0]].start; c.t1 = LINE[c.lines[c.lines.length - 1]].end; layoutCard(c); resolveTimes(c); });
  placeCards(); makeTextures();
  window.DUR = DUR; window.READY = true;
}
window.drawFrame = drawFrame;
// motion blur: when the camera moves fast, average sub-frames across a 180° shutter
let acc;
function drawBlurred(t, fps = 30) {
  const c0 = camera(t), c1 = camera(t + 1 / fps);
  const speed = Math.hypot(c1.x - c0.x, c1.y - c0.y) * c0.z + Math.abs(Math.log(c1.z / c0.z)) * 2000;
  if (speed < 18) return drawFrame(t);
  const n = speed > 60 ? 6 : 4, shutter = .5 / fps;
  if (!acc) { acc = document.createElement('canvas'); acc.width = W; acc.height = H; }
  const a = acc.getContext('2d');
  for (let i = 0; i < n; i++) {
    drawFrame(t + (i / (n - 1) - .5) * shutter);
    a.globalAlpha = 1 / (i + 1); a.drawImage(cv, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(acc, 0, 0);
}
window.frameJPEG = (t, q) => { drawBlurred(t); return cv.toDataURL('image/jpeg', q || .92).slice(23); };
window.framePNG = (t, dbg) => { drawFrame(t, { debug: dbg }); return cv.toDataURL('image/png').slice(22); };
window.cardInfo = () => CARDS.map(c => ({ id: c.id, t0: +c.t0.toFixed(2), t1: +c.t1.toFixed(2), w: c.w, h: Math.round(c.h), zoom: +c.zoom.toFixed(2) }));
boot().catch(e => { window.BOOT_ERROR = String(e && e.stack || e); console.error(e); });
})();
