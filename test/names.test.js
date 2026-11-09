// Clean room: no tracked text file names another layout. The banned words are stored only as sha256
// hashes of their lowercased form (one word, or two words joined by one space), so this file never
// names them. Every word and every adjacent word pair of every tracked text file is hashed and compared.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url).pathname;
export const BANNED = new Set([
  "cc355c8987b439a2e4db6d95699dda1d72781767c50cb0939d6b236100043dab",
  "67f4453a8b749aec81067cf10df71c0de9855b15db69911c1dd9262eeae45160",
  "93e8139a37385c71e8134a909f11c636931f97a71682b22819b53f7a41a02ec0",
  "f5436fc22c2c26f83b0512549d5f9b7134b9aeee9a31110de2fd3171062b9661",
  "7ec2adc22786587ee6ee10b3d7de998524a41046b7cc5f7b89f87f635b83b860",
]);
const sha = (w) => createHash("sha256").update(w).digest("hex");

// The banned hits in one text: [line, hash] for every word or adjacent word pair whose hash is banned.
export function bannedHits(text) {
  const hits = [];
  String(text).split("\n").forEach((line, i) => {
    const words = line.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    words.forEach((w, j) => {
      for (const t of [w, j + 1 < words.length ? `${w} ${words[j + 1]}` : null]) {
        if (t !== null && BANNED.has(sha(t))) hits.push([i + 1, sha(t).slice(0, 12)]);
      }
    });
  });
  return hits;
}

const tracked = () => spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
const textOf = (f) => {
  let buf;
  try { buf = readFileSync(join(root, f)); } catch { return null; }
  return buf.subarray(0, 8192).includes(0) ? null : buf.toString("utf8");
};

test("the scanner finds a banned word and a banned two-word name, and passes clean text", () => {
  const word = String.fromCharCode(109, 105, 110, 105, 109, 97, 108, 105, 115, 116, 105, 99);
  assert.equal(bannedHits(`switch back to ${word.toUpperCase()} later`).length, 1);
  assert.equal(bannedHits(`the herdr ${9 * 10 + 8} look`).length, 1);
  assert.deepEqual(bannedHits("Apollo is an original Herdr layout"), []);
});

test("no tracked text file names another layout", () => {
  const files = tracked();
  assert.ok(files.length > 50, `${files.length} tracked files`);
  const bad = [];
  for (const f of files) {
    const t = textOf(f);
    if (t === null) continue;
    for (const [line, h] of bannedHits(t)) bad.push(`${f}:${line} (${h})`);
  }
  assert.deepEqual(bad, []);
});
