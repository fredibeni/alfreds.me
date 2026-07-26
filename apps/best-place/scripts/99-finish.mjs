// 99-finish.mjs — resilient orchestrator that completes the rate-limited data fetches.
//
// Open-Meteo (hourly) and Numbeo limits block bulk fetching, but all the underlying scripts
// are resumable. This loop periodically probes each API and, when available, advances the
// remaining work, then rebuilds. It exits when weather + grid are complete.
//
//   node scripts/99-finish.mjs   (run in the background; safe to re-run)

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "out");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

const run = (script) => {
  console.log(`\n[run] ${script}`);
  try { execFileSync("node", [join(__dirname, script)], { stdio: "inherit" }); return true; }
  catch (e) { console.log(`[run] ${script} exited non-zero: ${e.message}`); return false; }
};

async function probe(url) {
  try { const r = await fetch(url, { headers: { "User-Agent": "best_place/0.1" } }); return r.status; }
  catch { return 0; }
}

const OM = "https://archive-api.open-meteo.com/v1/archive?latitude=0&longitude=0&start_date=2025-06-01&end_date=2025-06-01&daily=temperature_2m_max&timezone=UTC";
const NB = "https://www.numbeo.com/cost-of-living/rankings_current.jsp";

const MIN_DAYS = 1786; // ~2021-2025 (allow slight short-fall)
function weatherComplete() {
  const cities = readJson(join(OUT, "cities.json")) || [];
  const weather = readJson(join(OUT, "weather.json")) || {};
  return cities.every((c) => weather[c.id] && weather[c.id].tmax && weather[c.id].tmax.length >= MIN_DAYS);
}
function gridComplete() {
  const ck = readJson(join(OUT, "grid_progress.json"));
  return ck && ck.next >= ck.cells;
}

async function main() {
  const MAX_ITERS = Number(process.env.FINISH_ITERS || 60);
  const COL_TARGET = Number(process.env.COL_TARGET || 260); // cost-of-living coverage goal
  const colCount = () => {
    const d = readJson(join(__dirname, "..", "public", "data.json"));
    return d ? d.cities.filter((c) => c.colIndex != null).length : 0;
  };
  // Numbeo (CoL/income) is gated by a monthly free-tier limit, so don't block on it here —
  // finish when the Open-Meteo weather + grid backfill is done; Numbeo fills opportunistically.
  const allDone = () => weatherComplete() && gridComplete();

  for (let i = 1; i <= MAX_ITERS; i++) {
    const wDone = weatherComplete(), gDone = gridComplete();
    console.log(`\n=== iter ${i} | weather ${wDone ? "done" : "pending"}, grid ${gDone ? "done" : "pending"}, CoL ${colCount()}/${COL_TARGET} ===`);
    if (allDone()) { console.log("All done."); return; }

    const omStatus = (wDone && gDone) ? 429 : await probe(OM);
    if (omStatus === 200) {
      if (!gDone) run("06-grid.mjs");        // grid first (finer heatmap the user is watching)
      if (!weatherComplete()) run("04-weather.mjs"); // then resume city weather
    } else if (!(wDone && gDone)) {
      console.log(`open-meteo not ready (${omStatus})`);
    }

    // Numbeo handled manually (VPN session); avoid double-fetching its limited free quota.
    if (process.env.DO_NUMBEO) {
      const nbStatus = await probe(NB);
      if (nbStatus === 200) { run("03-numbeo.mjs"); run("07-income.mjs"); }
      else console.log(`numbeo not ready (${nbStatus})`);
    }

    run("05-build.mjs");                     // rebuild with whatever progressed
    if (allDone()) { console.log("All done."); return; }
    console.log(`sleeping 6 min...`);
    await sleep(6 * 60 * 1000);
  }
  console.log("Reached max iterations; re-run scripts/99-finish.mjs to continue.");
}

main().catch((e) => { console.error(e); process.exit(1); });
