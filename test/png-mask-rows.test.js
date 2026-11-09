// scripts/png-mask-rows.mjs paints one band of a capture a single color: inside it every pixel is the
// color, outside it every pixel is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { encodePng as encodeRgb } from "./helpers/png.js";
import { tempDir } from "./helpers/fixtures.js";
import { decodePng } from "../scripts/measure.js";
import { maskRows, encodePng } from "../scripts/png-mask-rows.mjs";

const root = new URL("../", import.meta.url).pathname;
const CHROME = [0x14, 0x16, 0x17];
// A shot 400 physical px wide of a 200 px window (scale 2): every pixel differs from its neighbours.
const W = 400, H = 300;
const pattern = (x, y) => [(x * 7 + y) % 256, (y * 5 + x * 3) % 256, (x ^ y) % 256];
const src = () => encodeRgb(W, H, pattern);

function check(out, band, before) {
  const a = decodePng(out), b = decodePng(before);
  assert.deepEqual([a.width, a.height, a.channels], [b.width, b.height, b.channels]);
  let inside = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const inBand = x >= band.x0 && x < band.x1 && y >= band.y0 && y < band.y1;
      if (inBand) { inside++; assert.deepEqual(a.pixel(x, y), CHROME, `(${x},${y}) is chrome`); }
      else assert.deepEqual(a.pixel(x, y), b.pixel(x, y), `(${x},${y}) is unchanged`);
    }
  }
  assert.equal(inside, (band.x1 - band.x0) * (band.y1 - band.y0));
}

test("maskRows: the band (design px × scale × zoom) is uniform chrome; every other pixel is unchanged", () => {
  const before = src();
  const r = maskRows(before, { windowWidth: 200, zoom: 1, x0: 0, x1: 50, y0: 20, y1: 60 });
  assert.deepEqual(r.band, { x0: 0, x1: 100, y0: 40, y1: 120 });
  check(r.png, r.band, before);
});

test("maskRows: zoom scales the band too", () => {
  const before = src();
  const r = maskRows(before, { windowWidth: 200, zoom: 1.5, x0: 0, x1: 40, y0: 10, y1: 30 });
  assert.deepEqual(r.band, { x0: 0, x1: 120, y0: 30, y1: 90 });
  check(r.png, r.band, before);
});

test("maskRows: an RGBA capture stays RGBA, with the band opaque chrome", () => {
  const rgb = decodePng(src());
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgb.data.copy(data, i * 4, i * 3, i * 3 + 3); data[i * 4 + 3] = 200; }
  const before = encodePng({ width: W, height: H, channels: 4, data });
  const r = maskRows(before, { windowWidth: 200, zoom: 1, x0: 10, x1: 20, y0: 10, y1: 20 });
  const a = decodePng(r.png);
  assert.equal(a.channels, 4);
  const at = (img, x, y) => [...img.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.deepEqual(at(a, 25, 25), [...CHROME, 255]);
  assert.deepEqual(at(a, 5, 5), at(decodePng(before), 5, 5));
  check(r.png, r.band, before);
});

test("maskRows refuses a band outside the image or empty", () => {
  assert.throws(() => maskRows(src(), { windowWidth: 200, zoom: 1, x0: 0, x1: 50, y0: 100, y1: 200 }), /outside/);
  assert.throws(() => maskRows(src(), { windowWidth: 200, zoom: 1, x0: 0, x1: 50, y0: 60, y1: 60 }), /empty/);
});

test("png-mask-rows CLI writes the masked capture", () => {
  const t = tempDir();
  try {
    const before = src();
    writeFileSync(join(t.dir, "in.png"), before);
    const r = spawnSync("node", [join(root, "scripts/png-mask-rows.mjs"), join(t.dir, "in.png"), join(t.dir, "out.png"),
      "--window-width", "200", "--zoom", "1", "--x0", "0", "--x1", "50", "--y0", "20", "--y1", "60"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^painted x 0-100, y 40-120 \(physical px\)$/m);
    check(readFileSync(join(t.dir, "out.png")), { x0: 0, x1: 100, y0: 40, y1: 120 }, before);
  } finally { t.cleanup(); }
});
