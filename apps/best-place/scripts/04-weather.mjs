// 04-weather.mjs — fetch multiple years of daily climate per city from Open-Meteo's free
// historical archive (no API key). Requests are batched (many locations per call) to stay
// within rate limits, and resumable by data length so it can run incrementally.
//
// "Daytime temperature" = daily maximum (temperature_2m_max).
//
// Output: scripts/out/weather.json  (keyed by city id) { tmax:[...], precip:[...] }

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const CITIES = join(OUT_DIR, "cities.json");
const OUT = join(OUT_DIR, "weather.json");

const START = process.env.WEATHER_START || "2021-01-01";
const END = process.env.WEATHER_END || "2025-12-31";
const EXPECT_DAYS = 1826;            // 2021-2025 inclusive (2024 is a leap year)
const MIN_DAYS = EXPECT_DAYS - 40;   // treat entries at least this long as "done"
const BATCH = Number(process.env.WEATHER_BATCH || 100);
const REQ_SLEEP = Number(process.env.WEATHER_SLEEP || 10000);
const BASE = "https://archive-api.open-meteo.com/v1/archive";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMITED = Symbol("rate-limited");

async function fetchBatch(chunk, attempt = 1) {
  const lat = chunk.map((c) => c.lat).join(",");
  const lon = chunk.map((c) => c.lon).join(",");
  const url = `${BASE}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${START}&end_date=${END}&daily=temperature_2m_max,precipitation_sum&timezone=UTC`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "best_place-data/0.1" } });
    if (res.status === 429) {
      const body = await res.text();
      if (/hourly|daily/i.test(body)) { console.log(`    quota reached: ${body.slice(0, 70)}`); return RATE_LIMITED; }
      if (attempt <= 6) { const w = Math.min(60000, 5000 * attempt); console.log(`    429; backoff ${w / 1000}s`); await sleep(w); return fetchBatch(chunk, attempt + 1); }
      return RATE_LIMITED;
    }
    if (res.status >= 500 && attempt <= 6) { await sleep(5000 * attempt); return fetchBatch(chunk, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return Array.isArray(j) ? j : [j];
  } catch (e) {
    if (attempt <= 6) { await sleep(Math.min(60000, 5000 * attempt)); return fetchBatch(chunk, attempt + 1); }
    throw e;
  }
}

async function main() {
  const cities = JSON.parse(readFileSync(CITIES, "utf8"));
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  const todo = cities.filter((c) => !(out[c.id] && out[c.id].tmax && out[c.id].tmax.length >= MIN_DAYS));
  console.log(`Weather ${START}..${END}: ${todo.length}/${cities.length} cities to (re)fetch, batch ${BATCH}.`);

  const round = (a) => a.map((v) => (v == null ? null : Number(v.toFixed(1))));
  let done = 0;
  for (let b = 0; b < todo.length; b += BATCH) {
    const chunk = todo.slice(b, b + BATCH);
    const results = await fetchBatch(chunk);
    if (results === RATE_LIMITED) {
      console.log(`Rate-limited after ${done}. Saved progress; re-run to resume.`);
      break;
    }
    for (let k = 0; k < chunk.length; k++) {
      const d = results[k] && results[k].daily;
      if (d && d.temperature_2m_max) {
        out[chunk[k].id] = { tmax: round(d.temperature_2m_max), precip: round(d.precipitation_sum) };
      }
    }
    done += chunk.length;
    writeFileSync(OUT, JSON.stringify(out));
    console.log(`  ${done}/${todo.length}`);
    await sleep(REQ_SLEEP);
  }

  const full = cities.filter((c) => out[c.id] && out[c.id].tmax.length >= MIN_DAYS).length;
  console.log(`Done. Multi-year weather for ${full}/${cities.length} cities.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
