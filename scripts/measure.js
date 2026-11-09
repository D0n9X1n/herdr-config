#!/usr/bin/env node
// Measures a `herdr-app shot` PNG for A3.19 (design px = physical px ÷ (shot width ÷ window width) ÷ zoom).
// Usage: node scripts/measure.js shot.png --window-width N --zoom Z [--mask m.png]   → JSON on stdout
//   sidebarPx          design width of the sidebar: the card's left border x (the first border-colored
//                      column on the middle row that runs ≥ 25% of the height), ÷ scale ÷ zoom, − 6
//   activeRowBg        most common color of the sidebar row band that differs most from chrome
//   trafficViolations  pixels in design x 12–70, y 10–30 that are not chrome, unless the mask's pixel there
//                      is non-chrome (the mask is a chrome image with only the native buttons drawn)
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const CHROME = "#141617", BORDER = "#3c3836", MAIN_PADDING = 6;
const TRAFFIC = { x0: 12, x1: 70, y0: 10, y1: 30 };

const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Decodes an 8-bit, non-interlaced RGB (type 2) or RGBA (type 6) PNG with filters 0–4.
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) throw new Error("not a PNG");
  let off = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString("ascii", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (t === "IDAT") idat.push(data);
    else if (t === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG (bit depth ${depth}, color type ${type}, interlace ${interlace}); need 8-bit RGB or RGBA`);
  }
  const channels = type === 6 ? 4 : 3, stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? data[dst + i - channels] : 0;
      const b = y ? data[dst - stride + i] : 0;
      const c = y && i >= channels ? data[dst - stride + i - channels] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`bad PNG filter ${f}`);
      data[dst + i] = (raw[src + i] + pred) & 255;
    }
  }
  const pixel = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2]]; };
  return { width, height, channels, data, pixel };
}

function findBorder(img) {
  const border = fromHex(BORDER), mid = Math.floor(img.height / 2);
  for (let x = 0; x < img.width; x++) {
    if (!same(img.pixel(x, mid), border)) continue;
    let n = 0;
    for (let y = 0; y < img.height; y++) if (same(img.pixel(x, y), border)) n++;
    if (n >= img.height / 4) return x;
  }
  return null;
}

function activeRow(img, borderX) {
  const chrome = fromHex(CHROME), mx = Math.floor(borderX / 2);
  const runs = [];
  let start = null;
  for (let y = 0; y <= img.height; y++) {
    const off = y < img.height && !same(img.pixel(mx, y), chrome);
    if (off && start === null) start = y;
    if (!off && start !== null) { runs.push([start, y - 1]); start = null; }
  }
  if (!runs.length) return null;
  // A run's fill is its most common color across the sidebar width. Glyph strokes (text) have a chrome
  // fill and are skipped; among filled bands the one farthest from chrome is the active row.
  const fill = (r) => {
    const counts = new Map();
    for (let y = r[0]; y <= r[1]; y++) {
      for (let x = 0; x < borderX; x++) { const h = toHex(img.pixel(x, y)); counts.set(h, (counts.get(h) ?? 0) + 1); }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  let best = null;
  for (const r of runs) {
    const f = fill(r);
    if (f === CHROME) continue;
    const d = dist(fromHex(f), chrome);
    if (!best || d > best.d) best = { f, d };
  }
  return best ? best.f : null;
}

function trafficViolations(img, f, mask) {
  const chrome = fromHex(CHROME);
  const x0 = Math.round(TRAFFIC.x0 * f), x1 = Math.min(img.width, Math.round(TRAFFIC.x1 * f));
  const y0 = Math.round(TRAFFIC.y0 * f), y1 = Math.min(img.height, Math.round(TRAFFIC.y1 * f));
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (same(img.pixel(x, y), chrome)) continue;
      // The mask marks the native traffic-light pixels: only a non-chrome mask pixel exempts.
      if (mask && x < mask.width && y < mask.height && !same(mask.pixel(x, y), chrome)) continue;
      n++;
    }
  }
  return n;
}

export function measure(png, { windowWidth, zoom = 1, mask } = {}) {
  const img = Buffer.isBuffer(png) ? decodePng(png) : png;
  const m = mask ? (Buffer.isBuffer(mask) ? decodePng(mask) : mask) : null;
  if (!(windowWidth > 0)) throw new Error("windowWidth is required");
  const scale = img.width / windowWidth;
  const borderX = findBorder(img);
  const sidebarPx = borderX === null ? null : borderX / scale / zoom - MAIN_PADDING;
  return {
    scale,
    borderX,
    sidebarPx,
    activeRowBg: borderX === null ? null : activeRow(img, borderX),
    trafficViolations: trafficViolations(img, scale * zoom, m),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const file = args[0], ww = Number(opt("--window-width")), zoom = Number(opt("--zoom")), maskFile = opt("--mask");
  if (!file || file.startsWith("--") || !(ww > 0) || !(zoom > 0)) {
    console.error("usage: measure.js shot.png --window-width N --zoom Z [--mask m.png]");
    process.exit(2);
  }
  try {
    const r = measure(readFileSync(file), { windowWidth: ww, zoom, mask: maskFile ? readFileSync(maskFile) : undefined });
    console.log(JSON.stringify(r));
  } catch (e) {
    console.error(`measure: ${e.message}`);
    process.exit(1);
  }
}
