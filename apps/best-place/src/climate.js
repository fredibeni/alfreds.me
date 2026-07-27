// Decoding + querying for the packed climate histograms produced by scripts/10-pack.mjs.
//
// Instead of shipping a year of daily (tmax, precip) pairs per grid cell, we ship a joint
// histogram over those two values. Every question the app asks of the daily data is a count of
// days in a rectangle of that histogram, so the answer is identical — see the header of
// 10-pack.mjs for why the bucket domains make this lossless rather than approximate.

// Must match scripts/10-pack.mjs.
export const T_MIN = -20, T_MAX = 45, P_MAX = 50;
export const T_BUCKETS = T_MAX - T_MIN + 1; // 66
export const P_BUCKETS = P_MAX + 1;         // 51

const STRIDE = T_BUCKETS + 1; // cdf rows carry a leading zero so a range is one subtraction

// Split the packed file into its offset table and its varint payload.
export function readPacked(arrayBuffer, count) {
  const offsets = new Uint32Array(arrayBuffer, 0, count + 1);
  const bytes = new Uint8Array(arrayBuffer, (count + 1) * 4);
  return { offsets, bytes };
}

// Collapse the precipitation axis at a fixed maxRain, leaving a cumulative distribution over
// temperature: cdf[i * STRIDE + k] = days for entity i with tmax bucket < k and precip <= maxRain.
// Rebuilt only when maxRain changes; moving the temperature sliders is then two array reads.
export function buildTempCdf({ offsets, bytes }, count, maxRain) {
  const pmax = maxRain == null ? P_MAX : Math.min(P_MAX, Math.max(0, maxRain));
  const cdf = new Uint16Array(count * STRIDE);

  for (let i = 0; i < count; i++) {
    const base = i * STRIDE;
    let pos = offsets[i];
    const end = offsets[i + 1];
    let bucket = 0;
    while (pos < end) {
      let run = 0, shift = 0, b;
      do { b = bytes[pos++]; run |= (b & 127) << shift; shift += 7; } while (b & 128);
      bucket += run;
      let n = 0; shift = 0;
      do { b = bytes[pos++]; n |= (b & 127) << shift; shift += 7; } while (b & 128);
      // Bucket index is row-major over (temperature, precipitation).
      if (bucket % P_BUCKETS <= pmax) cdf[base + ((bucket / P_BUCKETS) | 0) + 1] += n;
      bucket++;
    }
    for (let t = 1; t <= T_BUCKETS; t++) cdf[base + t] += cdf[base + t - 1];
  }
  return cdf;
}

// Same, for a single entity — used by the city detail card, which only ever looks at one city
// and would otherwise pay for a full 1753-city rebuild.
export function buildTempCdfOne({ offsets, bytes }, i, maxRain) {
  const pmax = maxRain == null ? P_MAX : Math.min(P_MAX, Math.max(0, maxRain));
  const cdf = new Uint16Array(STRIDE);
  let pos = offsets[i];
  const end = offsets[i + 1];
  let bucket = 0;
  while (pos < end) {
    let run = 0, shift = 0, b;
    do { b = bytes[pos++]; run |= (b & 127) << shift; shift += 7; } while (b & 128);
    bucket += run;
    let n = 0; shift = 0;
    do { b = bytes[pos++]; n |= (b & 127) << shift; shift += 7; } while (b & 128);
    if (bucket % P_BUCKETS <= pmax) cdf[((bucket / P_BUCKETS) | 0) + 1] += n;
    bucket++;
  }
  for (let t = 1; t <= T_BUCKETS; t++) cdf[t] += cdf[t - 1];
  return cdf;
}

// Days for entity i with minTemp <= tmax <= maxTemp (null = unbounded) at the cdf's maxRain.
export function daysInRange(cdf, i, minTemp, maxTemp) {
  const lo = Math.max(0, (minTemp == null ? T_MIN : minTemp) - T_MIN);
  const hi = Math.min(T_BUCKETS - 1, (maxTemp == null ? T_MAX : maxTemp) - T_MIN);
  // The two temperature sliders are independent, so minTemp > maxTemp is reachable and the
  // subtraction would go negative. The old per-day loop returned 0 for that; so do we.
  if (hi < lo) return 0;
  const base = i * STRIDE;
  const n = cdf[base + hi + 1] - cdf[base + lo];
  return n < 0 ? 0 : n;
}
