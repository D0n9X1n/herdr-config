#!/usr/bin/env node
// Paints one band of a `herdr-app shot` PNG a single color (default chrome #141617). Used by
// scripts/shots.sh to paint the person's own sidebar rows out of the preview, leaving the brand row,
// the fixture rows and the footer. The band is given in design px; physical px = design × (shot width ÷
// window width) × zoom. Inside the band every pixel is the color (opaque); outside it nothing changes.
// Usage: node scripts/png-mask-rows.mjs in.png out.png --window-width N --zoom Z --x0 A --x1 B --y0 C --y1 D [--color #rrggbb]
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { decodePng, CHROME } from "./measure.js";

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

// img: { width, height, channels (3 or 4), data } → an 8-bit PNG (filter 0).
export function encodePng({ width, height, channels, data }) {
  const stride = width * channels;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) data.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function maskRows(png, { windowWidth, zoom = 1, x0, x1, y0, y1, color = CHROME }) {
  const img = decodePng(png);
  if (!(windowWidth > 0)) throw new Error("windowWidth is required");
  const f = (img.width / windowWidth) * zoom;
  const band = { x0: Math.round(x0 * f), x1: Math.round(x1 * f), y0: Math.round(y0 * f), y1: Math.round(y1 * f) };
  if (band.x1 <= band.x0 || band.y1 <= band.y0) throw new Error(`band ${JSON.stringify(band)} is empty`);
  if (band.x0 < 0 || band.y0 < 0 || band.x1 > img.width || band.y1 > img.height) {
    throw new Error(`band ${JSON.stringify(band)} is outside the ${img.width}×${img.height} image`);
  }
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const px = img.channels === 4 ? [...rgb, 255] : rgb;
  const data = Buffer.from(img.data);
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = band.x0; x < band.x1; x++) {
      const i = (y * img.width + x) * img.channels;
      for (let c = 0; c < img.channels; c++) data[i + c] = px[c];
    }
  }
  return { band, png: encodePng({ width: img.width, height: img.height, channels: img.channels, data }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const [inp, out] = args;
  const n = (k) => Number(opt(k));
  const o = { windowWidth: n("--window-width"), zoom: n("--zoom"), x0: n("--x0"), x1: n("--x1"), y0: n("--y0"), y1: n("--y1") };
  if (opt("--color")) o.color = opt("--color");
  if (!inp || !out || inp.startsWith("--") || out.startsWith("--") || Object.values(o).some((v) => typeof v === "number" && !Number.isFinite(v))) {
    console.error("usage: png-mask-rows.mjs in.png out.png --window-width N --zoom Z --x0 A --x1 B --y0 C --y1 D [--color #rrggbb]");
    process.exit(2);
  }
  try {
    const r = maskRows(readFileSync(inp), o);
    writeFileSync(out, r.png);
    console.log(`painted x ${r.band.x0}-${r.band.x1}, y ${r.band.y0}-${r.band.y1} (physical px)`);
  } catch (e) {
    console.error(`png-mask-rows: ${e.message}`);
    process.exit(1);
  }
}
