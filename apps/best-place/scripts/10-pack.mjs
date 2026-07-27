// 10-pack.mjs — repack the climate grid into the compact form the browser actually needs.
//
// public/grid.json holds a year of daily (tmax, precip) per land cell: 16936 cells x 365 days
// x 2 int8 arrays, base64'd into JSON. That is 6.5 MB over the wire and was the single largest
// blocker on load (measured 1438 ms on a fast connection).
//
// The browser never uses the day ordering. MapView only ever asks one question per cell:
// "how many days satisfy minTemp <= tmax <= maxTemp and precip <= maxRain?" That is answered
// exactly by a joint histogram over (tmax, precip), and a histogram of 365 days has at most
// 365 non-zero buckets out of 3366 — so it compresses far better than the daily series.
//
// The bucket domains are taken from the sliders in FilterPanel.jsx, which is what makes this
// lossless rather than approximate:
//   minTemp -20..40 (-20 = "Any"), maxTemp -10..45 (45 = "Any") -> a constrained bound is
//   always within [-19, 44], so clamping tmax to [-20, 45] (the ends meaning "<=" and ">=")
//   can never merge two days that a reachable filter would separate.
//   maxRain 0..50 (50 = "Any") -> constrained <= 49, so precip clamps to [0, 50].
//
// Output: public/grid-meta.json  { res, year, days, cells, countryTax }
//         public/grid-clim.bin   Uint32 offsets[cells+1] then, per cell, a varint stream of
//                                (zero-run, count) pairs over the 66x51 buckets in row-major
//                                order.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

// Keep in sync with the slider bounds in src/components/FilterPanel.jsx and the decoder in
// src/climate.js.
export const T_MIN = -20, T_MAX = 45, P_MAX = 50;
export const T_BUCKETS = T_MAX - T_MIN + 1; // 66
export const P_BUCKETS = P_MAX + 1;         // 51

const clampT = (t) => (t < T_MIN ? T_MIN : t > T_MAX ? T_MAX : t) - T_MIN;
const clampP = (p) => (p < 0 ? 0 : p > P_MAX ? P_MAX : p);

// Build a (tmax, precip) histogram for one contiguous day range of the int8 arrays.
export function histogram(tmax, precip, base, days) {
  const h = new Uint16Array(T_BUCKETS * P_BUCKETS);
  for (let d = 0; d < days; d++) {
    const t = tmax[base + d];
    if (t === -128) continue; // no-data sentinel, same as the runtime loops skip
    h[clampT(t) * P_BUCKETS + clampP(precip ? precip[base + d] : 0)]++;
  }
  return h;
}

// Sparse varint encoding: alternating (number of zero buckets skipped, bucket count).
export function encodeHistogram(h, out) {
  let run = 0;
  for (let k = 0; k < h.length; k++) {
    if (h[k] === 0) { run++; continue; }
    let v = run;
    while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; }
    out.push(v);
    v = h[k];
    while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; }
    out.push(v);
    run = 0;
  }
}

function main() {
  const grid = JSON.parse(readFileSync(join(PUBLIC, "grid.json"), "utf8"));
  const { cells, days } = grid;
  const tb = Buffer.from(grid.tmax, "base64");
  const pb = Buffer.from(grid.precip, "base64");
  const tmax = new Int8Array(tb.buffer, tb.byteOffset, tb.length);
  const precip = new Int8Array(pb.buffer, pb.byteOffset, pb.length);

  const offsets = new Uint32Array(cells.length + 1);
  const chunks = [];
  for (let i = 0; i < cells.length; i++) {
    const out = [];
    encodeHistogram(histogram(tmax, precip, i * days, days), out);
    const buf = Buffer.from(out);
    chunks.push(buf);
    offsets[i + 1] = offsets[i] + buf.length;
  }

  const bin = Buffer.concat([Buffer.from(offsets.buffer), ...chunks]);
  writeFileSync(join(PUBLIC, "grid-clim.bin"), bin);

  const meta = { res: grid.res, year: grid.year, days, cells, countryTax: grid.countryTax };
  writeFileSync(join(PUBLIC, "grid-meta.json"), JSON.stringify(meta));

  const mb = (n) => (n / 1048576).toFixed(2);
  console.log(
    `Packed ${cells.length} cells: grid.json ${mb(readFileSync(join(PUBLIC, "grid.json")).length)} MB` +
    ` -> grid-clim.bin ${mb(bin.length)} MB + grid-meta.json ${mb(JSON.stringify(meta).length)} MB`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
