import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { encodePng } from "./helpers/png.js";
import { tempDir } from "./helpers/fixtures.js";
import { realExec } from "./helpers/exec.js";
import { decodePng, measure } from "../scripts/measure.js";

const root = new URL("../", import.meta.url).pathname;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const CHROME = hex("#141617"), BORDER = hex("#3c3836"), ACCENT = hex("#fabd2f"), DOT = hex("#cfbc97");

// The plan's synthetic shot: window 1000 wide, zoom 1.5, 2× → 2000×1200 physical px.
const W = 2000, H = 1200, Z = 1.5, S = 2;
const BORDER_X = (184 + 6) * Z * S; // 570
const STRAY = [20 * Z * S, 20 * Z * S]; // design (20,20)
const NATIVE = [30 * Z * S, 20 * Z * S]; // design (30,20)
function shot({ decoy = false } = {}) {
  return encodePng(W, H, (x, y) => {
    if (x === STRAY[0] && y === STRAY[1]) return DOT;
    if (x === NATIVE[0] && y === NATIVE[1]) return DOT;
    if (x === BORDER_X) return BORDER;
    if (decoy && x === 100 && y === H / 2) return BORDER;
    if (y >= 200 && y <= 260 && x < BORDER_X) return ACCENT;
    if (y >= 400 && y <= 463 && x < BORDER_X) return hex("#1c1f20"); // a raised (hover) row: longer, but dull
    return CHROME;
  });
}
// A mask is a chrome-colored image with only the native traffic-light pixels drawn (QA 13).
const mask = () => encodePng(W, H, (x, y) => (x === NATIVE[0] && y === NATIVE[1] ? DOT : CHROME));

test("plan fixture: sidebar 184±1, active row #fabd2f, one traffic-light violation", () => {
  const r = measure(shot(), { windowWidth: 1000, zoom: Z, mask: mask() });
  assert.ok(Math.abs(r.sidebarPx - 184) <= 1, `sidebarPx ${r.sidebarPx}`);
  assert.equal(r.activeRowBg, "#fabd2f");
  assert.equal(r.trafficViolations, 1);
  assert.equal(r.scale, 2);
});

test("without a mask the native dot counts too; a short border-colored decoy is not the card edge", () => {
  const r = measure(shot({ decoy: true }), { windowWidth: 1000, zoom: Z });
  assert.equal(r.trafficViolations, 2);
  assert.ok(Math.abs(r.sidebarPx - 184) <= 1, `sidebarPx ${r.sidebarPx}`);
});

test("zoom 1 at 1×: border at 190 gives 184", () => {
  const png = encodePng(600, 300, (x, y) => (x === 190 ? BORDER : (y >= 50 && y < 94 && x < 190 ? ACCENT : CHROME)));
  const r = measure(png, { windowWidth: 600, zoom: 1 });
  assert.equal(r.sidebarPx, 184);
  assert.equal(r.activeRowBg, "#fabd2f");
  assert.equal(r.trafficViolations, 0);
});

// A PNG with each scanline filter (0-4), 8-bit RGBA: decodePng must undo every filter.
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, c]);
}
function filteredRgba(w, h, px) {
  const bpp = 4, stride = w * bpp;
  const rows = Array.from({ length: h }, (_, y) => Buffer.from(Array.from({ length: w }, (_, x) => px(x, y)).flat()));
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const out = [];
  rows.forEach((row, y) => {
    const f = y % 5, prev = y ? rows[y - 1] : Buffer.alloc(stride), line = Buffer.alloc(stride + 1);
    line[0] = f;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      line[i + 1] = (row[i] - pred) & 255;
    }
    out.push(line);
  });
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(out))), chunk("IEND", Buffer.alloc(0))]);
}

test("decodePng undoes filters 0-4 in RGBA and reads RGB", () => {
  const px = (x, y) => [(x * 37 + y * 11) & 255, (x * 5 + y * 91) & 255, (x * y) & 255, 255 - x];
  const img = decodePng(filteredRgba(9, 10, px));
  assert.deepEqual([img.width, img.height, img.channels], [9, 10, 4]);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) assert.deepEqual(img.pixel(x, y), px(x, y).slice(0, 3), `(${x},${y})`);
  const rgb = decodePng(encodePng(3, 2, (x, y) => [x, y, 7]));
  assert.deepEqual([rgb.channels, ...rgb.pixel(2, 1)], [3, 2, 1, 7]);
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG/);
});

test("CLI prints JSON", () => {
  const t = tempDir();
  try {
    writeFileSync(join(t.dir, "shot.png"), shot());
    writeFileSync(join(t.dir, "mask.png"), mask());
    const r = realExec("node", [join(root, "scripts/measure.js"), join(t.dir, "shot.png"), "--window-width", "1000", "--zoom", "1.5", "--mask", join(t.dir, "mask.png")]);
    assert.equal(r.code, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.deepEqual([Math.round(j.sidebarPx), j.activeRowBg, j.trafficViolations], [184, "#fabd2f", 1]);
    assert.equal(realExec("node", [join(root, "scripts/measure.js"), join(t.dir, "shot.png")]).code, 2);
  } finally {
    t.cleanup();
  }
});

test("an all-chrome mask exempts nothing: a stray pixel at design (20,20) is still 1 violation", () => {
  const png = encodePng(W, H, (x, y) => (x === STRAY[0] && y === STRAY[1] ? DOT : (x === BORDER_X ? BORDER : CHROME)));
  const allChrome = encodePng(W, H, () => CHROME);
  assert.equal(measure(png, { windowWidth: 1000, zoom: Z, mask: allChrome }).trafficViolations, 1);
  assert.equal(measure(png, { windowWidth: 1000, zoom: Z }).trafficViolations, 1);
});

test("a mask exempts exactly the pixels it marks (non-chrome), nothing else", () => {
  const png = encodePng(W, H, (x, y) => ((x === STRAY[0] || x === NATIVE[0]) && y === STRAY[1] ? DOT : (x === BORDER_X ? BORDER : CHROME)));
  assert.equal(measure(png, { windowWidth: 1000, zoom: Z, mask: mask() }).trafficViolations, 1);
});

test("active row: thin text runs and a dull button band never beat the accent band", () => {
  const MUTED = hex("#d5c4a1"), RAISED = hex("#1c1f20"), MX = Math.floor(BORDER_X / 2);
  const png = encodePng(W, H, (x, y) => {
    if (x === BORDER_X) return BORDER;
    if (x >= MX - 1 && x <= MX + 1 && ((y >= 120 && y <= 140) || (y >= 600 && y <= 620))) return MUTED; // glyph strokes
    if (y >= 60 && y <= 100 && x < BORDER_X) return RAISED; // "New space" button fill
    if (y >= 300 && y <= 360 && x < BORDER_X) return (x >= MX - 2 && x <= MX + 2 && y >= 320 && y <= 330) ? CHROME : ACCENT; // accent row with a solid_foreground glyph
    return CHROME;
  });
  assert.equal(measure(png, { windowWidth: 1000, zoom: Z }).activeRowBg, "#fabd2f");
});
