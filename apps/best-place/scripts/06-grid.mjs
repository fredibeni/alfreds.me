// 06-grid.mjs — build a global land climate grid so the map can show fine-grained,
// area-based climate fill (not derived from cities).
//
// For each land cell we fetch a year of daily "daytime" high temperature and rainfall from
// Open-Meteo (batched, many locations per request), quantise to int8, and store compactly.
// Cells are cached by (lat,lon) - keyed on the fixed grid lattice, not array position - using
// whatever's already in public/grid.json. So re-running after the land-cell set changes (e.g.
// a coastline/resolution update) only fetches cells that are genuinely new, not the whole grid.
// The browser counts qualifying days per cell for the user's filters and paints each cell.
//
// Output: public/grid.json
//   { res, year, cells:[{lat,lon,ckey}], tmax:<base64 int8[cells*365]>, precip:<base64 int8>,
//     countryTax:{ ckey:{incomeTax,capitalGainsTax} } }

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCountry, normCountry } from "./lib/countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const CKPT = join(__dirname, "out", "grid_progress.json");

const RES = Number(process.env.GRID_RES || 1.0);    // degrees (~110km cells)
const START = process.env.GRID_START || "2025-01-01";
const END = process.env.GRID_END || "2025-12-31";
const LAT_MIN = -56, LAT_MAX = 74;                    // habitable band (skips Antarctica)
const BATCH = Number(process.env.GRID_BATCH || 100); // locations per Open-Meteo request
const REQ_SLEEP = Number(process.env.GRID_SLEEP || 11000); // ms between requests (stay under limits)
const DAYS = 365;                                     // single year keeps the finer grid small enough
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- point-in-polygon (ray casting, even-odd handles holes) --------------------------
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygon(x, y, rings) {
  let c = false;
  for (const ring of rings) if (pointInRing(x, y, ring)) c = !c;
  return c;
}
function pointInFeature(x, y, geom) {
  if (geom.type === "Polygon") return pointInPolygon(x, y, geom.coordinates);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) if (pointInPolygon(x, y, poly)) return true;
  }
  return false;
}
function bboxOf(geom) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const scan = (rings) => rings.forEach((r) => r.forEach(([x, y]) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }));
  if (geom.type === "Polygon") scan(geom.coordinates);
  else if (geom.type === "MultiPolygon") geom.coordinates.forEach(scan);
  return [minX, minY, maxX, maxY];
}

function clampI8(v, nullVal) {
  if (v == null || Number.isNaN(v)) return nullVal;
  const r = Math.round(v);
  return r < -128 ? -128 : r > 127 ? 127 : r;
}

const RATE_LIMITED = Symbol("rate-limited");

async function fetchBatch(centers, attempt = 1) {
  const lat = centers.map((c) => c.clat.toFixed(3)).join(",");
  const lon = centers.map((c) => c.clon.toFixed(3)).join(",");
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${START}&end_date=${END}` +
    `&daily=temperature_2m_max,precipitation_sum&timezone=UTC`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "best_place-data/0.1" } });
    if (res.status === 429) {
      const body = await res.text();
      // Hourly/daily quota won't clear with short backoff -> stop and finalize a partial grid.
      if (/hourly|daily/i.test(body)) { console.log(`    quota reached: ${body.slice(0, 80)}`); return RATE_LIMITED; }
      if (attempt <= 6) { const w = Math.min(60000, 5000 * attempt); console.log(`    429 (minutely); backing off ${w / 1000}s`); await sleep(w); return fetchBatch(centers, attempt + 1); }
      return RATE_LIMITED;
    }
    if (res.status >= 500 && attempt <= 8) { await sleep(5000 * attempt); return fetchBatch(centers, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return Array.isArray(j) ? j : [j];
  } catch (e) {
    if (attempt <= 6) { await sleep(Math.min(60000, 5000 * attempt)); return fetchBatch(centers, attempt + 1); }
    throw e;
  }
}

const cellKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

// Pull every cell's daily arrays out of a previously-written grid (public/grid.json's own
// shape) into the lat/lon-keyed cache, skipping anything already cached.
function loadIntoCache(cache, gridLike) {
  if (!gridLike || gridLike.days !== DAYS || !Array.isArray(gridLike.cells)) return;
  const tmaxAll = new Int8Array(Buffer.from(gridLike.tmax, "base64").buffer);
  const precipAll = new Int8Array(Buffer.from(gridLike.precip, "base64").buffer);
  gridLike.cells.forEach((c, i) => {
    const k = cellKey(c.lat, c.lon);
    if (cache.has(k)) return;
    cache.set(k, { tmax: tmaxAll.slice(i * DAYS, (i + 1) * DAYS), precip: precipAll.slice(i * DAYS, (i + 1) * DAYS) });
  });
}

async function main() {
  const geo = JSON.parse(readFileSync(join(PUBLIC, "world.geojson"), "utf8"));
  const feats = geo.features.map((f) => ({
    ckey: f.properties.ckey,
    incomeTax: f.properties.incomeTax ?? null,
    capitalGainsTax: f.properties.capitalGainsTax ?? null,
    geom: f.geometry,
    bbox: bboxOf(f.geometry),
  }));

  // Which of a candidate feature list (if any) contains a point?
  const featIn = (x, y, candidates) => {
    for (const f of candidates) {
      const [minX, minY, maxX, maxY] = f.bbox;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (pointInFeature(x, y, f.geom)) return f;
    }
    return null;
  };

  // Build land cells. A cell exists if ANY part of its 1-deg square is land - not just its
  // centre. Coastlines are far finer than the grid, so a square can be mostly land while its
  // centre sits in water (a fjord, estuary, or the sea between close islands); centre-only
  // detection left those coastal strips with no cell, showing the bare land base instead of
  // heatmap. The fetch point (clat/clon) is the square centre when that's on land, else the
  // land point within the square nearest the centre - so the weather sample is over land, not
  // the adjacent sea. The cell's own lat/lon (its lattice position) is unchanged, so the
  // (lat,lon) cache still reuses every already-fetched cell.
  const SUB = 12; // sub-samples per axis when hunting for a land point in a mostly-water square
                  // (fine enough to catch thin coastal strips / small islands near a square edge,
                  //  which a coarser scan missed - leaving coastal cities with no cell)
  // Sub-grid sample offsets within a square, ordered nearest-to-centre first, so the hunt below
  // can stop at the first land hit (which is then necessarily the land point closest to centre).
  const subOffsets = [];
  for (let sy = 1; sy < SUB; sy++)
    for (let sx = 1; sx < SUB; sx++)
      subOffsets.push({ dx: (RES * sx) / SUB, dy: (RES * sy) / SUB });
  const cen = RES / 2;
  subOffsets.sort(
    (a, b) => (a.dx - cen) ** 2 + (a.dy - cen) ** 2 - ((b.dx - cen) ** 2 + (b.dy - cen) ** 2)
  );

  const cells = [];
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += RES) {
    for (let lon = -180; lon < 180; lon += RES) {
      // Only features whose bbox overlaps this square can hold any point in it; open-ocean
      // squares get an empty list and are skipped without a single point-in-polygon test.
      const cand = feats.filter((f) => {
        const [minX, minY, maxX, maxY] = f.bbox;
        return !(lon > maxX || lon + RES < minX || lat > maxY || lat + RES < minY);
      });
      if (!cand.length) continue;
      const cenLat = lat + RES / 2, cenLon = lon + RES / 2;
      let clat = cenLat, clon = cenLon, hit = featIn(cenLon, cenLat, cand);
      if (!hit) {
        // Scan the sub-grid nearest-centre first; the first land point found is the closest.
        for (const o of subOffsets) {
          const x = lon + o.dx, y = lat + o.dy;
          const f = featIn(x, y, cand);
          if (f) { hit = f; clat = y; clon = x; break; }
        }
      }
      if (hit) cells.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3), clat, clon, ckey: hit.ckey });
    }
  }

  // A coastal or island city can sit in a 1deg square whose land the detection scan still
  // missed (a thin coastal strip or speck of island right at the square's edge), leaving that
  // square with no cell. Guarantee every city's square has one by adding a cell AT THE SQUARE'S
  // LATTICE CORNER (weather sampled at the city itself). Being on the lattice, it interpolates
  // seamlessly with its neighbours - unlike the earlier off-lattice cells, which not only
  // couldn't interpolate (painting flat blocks) but were placed half a degree away at
  // (city - 0.5deg), i.e. usually in a DIFFERENT, offshore square, so the city's real square
  // stayed blank while a block appeared out at sea.
  //
  // Only for squares with no lattice cell: an enclaved microstate (Monaco, Luxembourg, ...) is
  // already inside a neighbour's lattice cell that covers it smoothly, so it's skipped.
  const latticeSquares = new Set(cells.map((c) => cellKey(c.lat, c.lon)));
  const squareCorner = (v) => +(Math.floor(v / RES) * RES).toFixed(3);
  const citiesPath = join(__dirname, "out", "cities.json");
  if (existsSync(citiesPath)) {
    const cities = JSON.parse(readFileSync(citiesPath, "utf8"));
    const seenSquare = new Set();
    let supplementalAdded = 0;
    for (const c of cities) {
      const sqLat = squareCorner(c.lat), sqLon = squareCorner(c.lon);
      const sqKey = cellKey(sqLat, sqLon);
      if (latticeSquares.has(sqKey)) continue; // square already painted by a lattice cell
      if (seenSquare.has(sqKey)) continue;      // one supplemental per empty square
      seenSquare.add(sqKey);
      const ckey = normCountry(canonicalCountry(c.country, null));
      cells.push({ lat: sqLat, lon: sqLon, clat: c.lat, clon: c.lon, ckey });
      supplementalAdded++;
    }
    if (supplementalAdded) console.log(`Added ${supplementalAdded} supplemental cell(s) for coastal/island city squares.`);
  }

  // Reuse per-cell daily data from whatever's already on disk - the previously-completed
  // grid, plus any in-progress checkpoint from an interrupted run of THIS reuse logic (an
  // older, index-based checkpoint from before this cache existed is not reusable, since its
  // "next" position doesn't correspond to any fixed geo cell - it's just discarded).
  const cache = new Map(); // "lat,lon" -> { tmax: Int8Array(DAYS), precip: Int8Array(DAYS) }
  if (existsSync(join(PUBLIC, "grid.json"))) {
    loadIntoCache(cache, JSON.parse(readFileSync(join(PUBLIC, "grid.json"), "utf8")));
  }
  if (existsSync(CKPT)) {
    const ck = JSON.parse(readFileSync(CKPT, "utf8"));
    if (ck.byCell && ck.days === DAYS) {
      for (const [k, v] of Object.entries(ck.byCell)) {
        if (cache.has(k)) continue;
        cache.set(k, { tmax: new Int8Array(Buffer.from(v.tmax, "base64")), precip: new Int8Array(Buffer.from(v.precip, "base64")) });
      }
    }
  }

  const todo = cells.filter((c) => !cache.has(cellKey(c.lat, c.lon)));
  console.log(
    `Grid ${RES}° -> ${cells.length} land cells (${cells.length - todo.length} reused from cache, ` +
    `${todo.length} to fetch in ${Math.ceil(todo.length / BATCH)} requests)...`
  );

  // Checkpoint only the newly-fetched cells (lat/lon-keyed) - the full previous grid stays
  // untouched on disk as the base cache, so this stays small regardless of total grid size.
  const newlyFetched = new Map();
  const saveCheckpoint = () => {
    const byCell = {};
    for (const [k, v] of newlyFetched.entries()) {
      byCell[k] = { tmax: Buffer.from(v.tmax.buffer).toString("base64"), precip: Buffer.from(v.precip.buffer).toString("base64") };
    }
    writeFileSync(CKPT, JSON.stringify({ days: DAYS, byCell }));
  };

  for (let b = 0; b < todo.length; b += BATCH) {
    const chunk = todo.slice(b, b + BATCH);
    const results = await fetchBatch(chunk);
    if (results === RATE_LIMITED) {
      console.log(`Rate-limited after ${b}/${todo.length} new cells fetched. Checkpoint saved; re-run later to resume & complete.`);
      break;
    }
    for (let k = 0; k < chunk.length; k++) {
      const d = results[k] && results[k].daily;
      const tmax = new Int8Array(DAYS), precip = new Int8Array(DAYS);
      if (!d || !d.temperature_2m_max) {
        tmax.fill(-128);
      } else {
        for (let i = 0; i < DAYS; i++) {
          tmax[i] = clampI8(d.temperature_2m_max[i], -128);
          precip[i] = clampI8(d.precipitation_sum[i], 0);
        }
      }
      const key = cellKey(chunk[k].lat, chunk[k].lon);
      cache.set(key, { tmax, precip });
      newlyFetched.set(key, { tmax, precip });
    }
    saveCheckpoint();
    console.log(`  ${Math.min(b + BATCH, todo.length)}/${todo.length} new cells fetched`);
    await sleep(REQ_SLEEP);
  }

  const missing = cells.filter((c) => !cache.has(cellKey(c.lat, c.lon))).length;
  if (missing > 0) {
    console.log(`Partial (${cells.length - missing}/${cells.length} cells have data); keeping existing public/grid.json until complete.`);
    return;
  }

  // Country tax lookup by ckey (for greying grid cells consistently with the choropleth).
  const countryTax = {};
  for (const f of feats) {
    if (f.ckey && !(f.ckey in countryTax)) {
      countryTax[f.ckey] = { incomeTax: f.incomeTax, capitalGainsTax: f.capitalGainsTax };
    }
  }

  const outCells = cells.map((c) => ({ lat: c.lat, lon: c.lon, ckey: c.ckey }));
  const tmaxAll = new Int8Array(cells.length * DAYS);
  const precipAll = new Int8Array(cells.length * DAYS);
  cells.forEach((c, i) => {
    const v = cache.get(cellKey(c.lat, c.lon));
    tmaxAll.set(v.tmax, i * DAYS);
    precipAll.set(v.precip, i * DAYS);
  });
  const out = {
    res: RES,
    year: `${START}..${END}`,
    days: DAYS,
    cells: outCells,
    tmax: Buffer.from(tmaxAll.buffer).toString("base64"),
    precip: Buffer.from(precipAll.buffer).toString("base64"),
    countryTax,
  };
  writeFileSync(join(PUBLIC, "grid.json"), JSON.stringify(out));
  const mb = (readFileSync(join(PUBLIC, "grid.json")).length / 1e6).toFixed(2);
  console.log(`Wrote public/grid.json (${cells.length} cells, ${mb} MB).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
