// The logo assets match their source: assets/logo/apollo.svg is pinned; mods/apollo-chrome/logo.png and
// assets/logo/apollo.icns must equal a fresh rsvg-convert render of it. Pixels are compared with a small
// tolerance (librsvg versions differ across platforms); on macOS, scripts/gen-logo.sh must also regenerate
// both files byte for byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { decodePng } from "../scripts/measure.js";
import { tempDir } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const SVG = join(root, "assets/logo/apollo.svg");
const PNG = join(root, "mods/apollo-chrome/logo.png");
const ICNS = join(root, "assets/logo/apollo.icns");
const SVG_SHA = "02b9c2044cb89a461cbde02136629427516c7a993dd3673558b1996d06c530eb";
// icns image chunks → the iconset member (and so the render size) each one holds.
const CHUNKS = { ic04: 16, ic05: 32, ic11: 32, ic12: 64, ic07: 128, ic13: 256, ic08: 256, ic14: 512, ic09: 512, ic10: 1024 };
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;

const rgba = (img) => {
  if (img.channels === 4) return img.data;
  const o = Buffer.alloc(img.width * img.height * 4);
  for (let i = 0; i < img.width * img.height; i++) { img.data.copy(o, i * 4, i * 3, i * 3 + 3); o[i * 4 + 3] = 255; }
  return o;
};
// 'ARGB' chunks: the tag, then the A, R, G and B planes, each run-length coded (0x00–0x7f: n+1 literal
// bytes; 0x80–0xff: the next byte n-0x80+3 times).
function argb(d, n) {
  const planes = Buffer.alloc(n * 4);
  let i = 4, o = 0;
  while (o < n * 4) {
    const c = d[i++];
    if (c < 0x80) { d.copy(planes, o, i, i + c + 1); i += c + 1; o += c + 1; }
    else { planes.fill(d[i++], o, o + c - 0x80 + 3); o += c - 0x80 + 3; }
  }
  const out = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) { out[p * 4] = planes[n + p]; out[p * 4 + 1] = planes[2 * n + p]; out[p * 4 + 2] = planes[3 * n + p]; out[p * 4 + 3] = planes[p]; }
  return out;
}
export function icnsImages(buf) {
  assert.equal(buf.toString("ascii", 0, 4), "icns");
  const out = {};
  for (let off = 8; off < buf.length;) {
    const t = buf.toString("ascii", off, off + 4), n = buf.readUInt32BE(off + 4), d = buf.subarray(off + 8, off + n);
    off += n;
    if (!CHUNKS[t]) continue;
    const z = CHUNKS[t];
    out[t] = { size: z, pixels: d.toString("ascii", 0, 4) === "ARGB" ? argb(d, z * z) : rgba(decodePng(Buffer.from(d))) };
  }
  return out;
}
// Mean channel difference ≤ 2 and at most 1% of channel values off by more than 24.
export function close(a, b) {
  if (a.length !== b.length) return { ok: false, why: `sizes differ (${a.length} vs ${b.length})` };
  let sum = 0, big = 0;
  for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i] - b[i]); sum += x; if (x > 24) big++; }
  const mean = sum / a.length, frac = big / a.length;
  return { ok: mean <= 2 && frac <= 0.01, why: `mean ${mean.toFixed(3)}, ${(frac * 100).toFixed(2)}% over 24` };
}
function render(dir, size) {
  const out = join(dir, `r${size}.png`);
  const r = spawnSync("rsvg-convert", ["-w", String(size), "-h", String(size), SVG, "-o", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return rgba(decodePng(readFileSync(out)));
}

test("assets/logo/apollo.svg is the owner's design, unchanged", () => {
  assert.equal(createHash("sha256").update(readFileSync(SVG)).digest("hex"), SVG_SHA);
});

test("rsvg-convert is installed (the drift checks need it)", () => {
  assert.ok(has("rsvg-convert"), "install librsvg (macOS: brew install librsvg; Ubuntu: apt install librsvg2-bin)");
});

test("logo.png is a 64 px render of the SVG", () => {
  const t = tempDir();
  try {
    const img = decodePng(readFileSync(PNG));
    assert.deepEqual([img.width, img.height], [64, 64]);
    const c = close(rgba(img), render(t.dir, 64));
    assert.ok(c.ok, `logo.png drifted from the SVG: ${c.why}`);
  } finally { t.cleanup(); }
});

test("apollo.icns holds every size from 16 to 1024 px, each a render of the SVG", () => {
  const t = tempDir();
  try {
    const imgs = icnsImages(readFileSync(ICNS));
    assert.deepEqual(Object.keys(imgs).sort(), Object.keys(CHUNKS).sort());
    const refs = {};
    for (const [tag, { size, pixels }] of Object.entries(imgs)) {
      refs[size] ??= render(t.dir, size);
      const c = close(pixels, refs[size]);
      assert.ok(c.ok, `${tag} (${size} px) drifted from the SVG: ${c.why}`);
    }
  } finally { t.cleanup(); }
});

test("the comparison catches a changed logo", () => {
  const t = tempDir();
  try {
    const ref = render(t.dir, 64);
    const bad = Buffer.from(ref);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const i = (y * 64 + x) * 4; bad[i] = 255; bad[i + 1] = 0; bad[i + 2] = 0; bad[i + 3] = 255; }
    assert.equal(close(bad, ref).ok, false);
    assert.equal(close(ref, ref).ok, true);
  } finally { t.cleanup(); }
});

test("scripts/gen-logo.sh exists and, on macOS, regenerates logo.png and apollo.icns byte for byte", { skip: !has("iconutil") && "iconutil is macOS-only" }, () => {
  const script = join(root, "scripts/gen-logo.sh");
  assert.ok(existsSync(script) && (statSync(script).mode & 0o111), "scripts/gen-logo.sh is executable");
  const t = tempDir();
  try {
    const r = spawnSync("bash", [script, "--out", t.dir], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(join(t.dir, "logo.png")).equals(readFileSync(PNG)), "logo.png is not a fresh render");
    assert.ok(readFileSync(join(t.dir, "apollo.icns")).equals(readFileSync(ICNS)), "apollo.icns is not a fresh build");
  } finally { t.cleanup(); }
});
