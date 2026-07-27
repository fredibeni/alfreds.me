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

// ---- Cities -------------------------------------------------------------------------------
// Same idea as the grid: data.json is 92% per-city daily arrays (1826 days x 2), and every
// consumer only ever counts days in a (tmax, precip) rectangle. climateSummary also needs true
// sums/max, which clamped buckets cannot give, so those ship as exact per-city scalars.
function packCities() {
  const data = JSON.parse(readFileSync(join(PUBLIC, "data.json"), "utf8"));
  const offsets = new Uint32Array(data.cities.length + 1);
  const chunks = [];

  const cities = data.cities.map((c, i) => {
    const { tmax: t64, precip: p64, ...rest } = c;
    const out = [];
    if (t64) {
      const tb = Buffer.from(t64, "base64");
      const pb = p64 ? Buffer.from(p64, "base64") : null;
      const tmax = new Int8Array(tb.buffer, tb.byteOffset, tb.length);
      const precip = pb ? new Int8Array(pb.buffer, pb.byteOffset, pb.length) : null;
      encodeHistogram(histogram(tmax, precip, 0, tmax.length), out);
      // Exact aggregates for climateSummary, which must not see clamped values.
      let tSum = 0, pSum = 0, tHigh = null, nObs = 0;
      for (let k = 0; k < tmax.length; k++) {
        const t = tmax[k];
        if (t === -128) continue;
        nObs++; tSum += t;
        if (tHigh === null || t > tHigh) tHigh = t;
        if (precip) { const p = precip[k]; if (p !== -128) pSum += p; }
      }
      Object.assign(rest, { tSum, pSum, tHigh, nObs, hasPrecip: !!precip });
    }
    const buf = Buffer.from(out);
    chunks.push(buf);
    offsets[i + 1] = offsets[i] + buf.length;
    return rest;
  });

  const bin = Buffer.concat([Buffer.from(offsets.buffer), ...chunks]);
  writeFileSync(join(PUBLIC, "city-clim.bin"), bin);
  const slim = JSON.stringify({ ...data, cities });
  writeFileSync(join(PUBLIC, "cities.json"), slim);
  return { bin: bin.length, json: slim.length, n: cities.length };
}

// ---- World outline ------------------------------------------------------------------------
// Ramer-Douglas-Peucker. Neighbouring countries share a border but are simplified separately,
// so their outlines can drift apart by up to the tolerance; at 0.02 deg that worst-case gap is
// 0.06 px at the default zoom and 0.46 px at the deepest zoom the app flies to, i.e. sub-pixel.
const GEO_TOLERANCE = 0.02;
const GEO_DECIMALS = 3; // ~110 m; shared vertices round identically, so topology is preserved

function simplifyRing(pts, tol) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  // A ring that collapses is a small island. Keep the original rather than deleting it —
  // dropping them silently removes island states (Monaco, Malta, Singapore...) that have
  // cities in the list, taking their hover/click/tax shading with them.
  return out.length >= 4 ? out : pts;
}

function packWorld() {
  const geo = JSON.parse(readFileSync(join(PUBLIC, "world.geojson"), "utf8"));
  const r = (v) => Math.round(v * 10 ** GEO_DECIMALS) / 10 ** GEO_DECIMALS;
  const doRing = (ring) => {
    const s = simplifyRing(ring, GEO_TOLERANCE);
    const out = [];
    let px, py;
    for (const [x, y] of s) {
      const rx = r(x), ry = r(y);
      if (rx === px && ry === py) continue; // rounding can collapse neighbours
      out.push([rx, ry]); px = rx; py = ry;
    }
    const [fx, fy] = out[0];
    if (out[out.length - 1][0] !== fx || out[out.length - 1][1] !== fy) out.push([fx, fy]);
    return out.length >= 4 ? out : s;
  };
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") g.coordinates = g.coordinates.map(doRing);
    else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((p) => p.map(doRing));
  }
  const out = JSON.stringify(geo);
  writeFileSync(join(PUBLIC, "world.min.geojson"), out);
  return { features: geo.features.length, bytes: out.length };
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
    `grid.json ${mb(readFileSync(join(PUBLIC, "grid.json")).length)} MB -> ` +
    `grid-clim.bin ${mb(bin.length)} MB + grid-meta.json ${mb(JSON.stringify(meta).length)} MB (${cells.length} cells)`
  );

  const c = packCities();
  console.log(
    `data.json ${mb(readFileSync(join(PUBLIC, "data.json")).length)} MB -> ` +
    `city-clim.bin ${mb(c.bin)} MB + cities.json ${mb(c.json)} MB (${c.n} cities)`
  );

  const w = packWorld();
  console.log(
    `world.geojson ${mb(readFileSync(join(PUBLIC, "world.geojson")).length)} MB -> ` +
    `world.min.geojson ${mb(w.bytes)} MB (${w.features} features)`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
