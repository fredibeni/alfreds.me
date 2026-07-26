// 01-cities.mjs — parse the UN population spreadsheet into a curated list of the largest
// cities (>=300k), with clean English names, coordinates, population, and country.
//
// Output: scripts/out/cities.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pkg from "xlsx";
const XLSX = pkg;
import { existsSync } from "node:fs";
import { cleanCityName, normKey } from "./lib/names.mjs";
import { canonicalCountry, normCountry } from "./lib/countries.mjs";
import { ZERO_CGT_COUNTRIES } from "./lib/zero_cgt.mjs";
import { EXTRA_CITIES } from "./lib/extra_cities.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "raw", "global-city-population-estimates.xlsx");
const OUT_DIR = join(__dirname, "out");

// Include every city from the spreadsheet by default; set TOP_N to cap for testing.
const TOP_N = process.env.TOP_N ? Number(process.env.TOP_N) : Infinity;

function parsePopThousands(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 1000) : null; // stored in thousands
}

function main() {
  const wb = XLSX.read(readFileSync(RAW), { type: "buffer" });
  // Pick the sheet that actually holds the city table.
  let sheetName = wb.SheetNames.find((n) => /cities/i.test(n)) || wb.SheetNames[0];
  let rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });
  if (!rows.some((r) => Array.isArray(r) && r.includes("Urban Agglomeration"))) {
    for (const n of wb.SheetNames) {
      const rr = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
      if (rr.some((r) => Array.isArray(r) && r.includes("Urban Agglomeration"))) { rows = rr; break; }
    }
  }

  // Find the header row (contains "Urban Agglomeration").
  let headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => String(c).trim() === "Urban Agglomeration")
  );
  if (headerIdx === -1) throw new Error("Could not locate header row");
  const header = rows[headerIdx].map((c) => String(c).trim());

  const col = (name) => header.indexOf(name);
  const iCode = col("Country Code");
  const iCountry = col("Country or area");
  const iCityCode = col("City Code");
  const iName = col("Urban Agglomeration");
  const iLat = col("Latitude");
  const iLon = col("Longitude");
  // Population column: last data column is the latest year (e.g. "2025").
  let iPop = col("2025");
  if (iPop === -1) {
    // fall back to the right-most numeric-looking header
    for (let k = header.length - 1; k >= 0; k--) {
      if (/^\d{4}$/.test(header[k])) { iPop = k; break; }
    }
  }

  const cities = [];
  const seen = new Set();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const rawName = row[iName];
    if (!rawName) continue;
    const lat = Number(row[iLat]);
    const lon = Number(row[iLon]);
    const population = parsePopThousands(row[iPop]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !population) continue;
    if (population < 300000) continue; // safety; dataset is already >=300k

    const code = row[iCode];
    const country = canonicalCountry(row[iCountry], code);
    const name = cleanCityName(rawName);

    const id = `${row[iCityCode]}`;
    if (seen.has(id)) continue;
    seen.add(id);

    cities.push({
      id,
      name,
      rawName: String(rawName),
      country,
      countryCode: String(code),
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      population,
    });
  }

  cities.sort((a, b) => b.population - a.population);
  const top = cities.slice(0, TOP_N);
  const includedIds = new Set(top.map((c) => c.id));

  // Ensure every zero-CGT country's biggest qualifying city is present (cities is pop-desc,
  // so the first match per country is its largest).
  const zeroSeen = new Set();
  const added = [];
  for (const c of cities) {
    if (!ZERO_CGT_COUNTRIES.has(c.country) || zeroSeen.has(c.country)) continue;
    zeroSeen.add(c.country);
    if (!includedIds.has(c.id)) { top.push(c); includedIds.add(c.id); added.push(`${c.name} (${c.country})`); }
  }

  // Include every country's capital (even below 300k), deduped against cities already present.
  const nameKey = (name, country) => `${normKey(name)}|${normCountry(country)}`;
  const presentKeys = new Set(top.map((c) => nameKey(c.name, c.country)));
  const presentCountries = new Set(top.map((c) => normCountry(c.country)));
  let capAdded = 0, capNewCountries = 0;
  const CAPS = join(OUT_DIR, "capitals.json");
  if (existsSync(CAPS)) {
    const capitals = JSON.parse(readFileSync(CAPS, "utf8"));
    for (const cap of capitals) {
      const k = nameKey(cap.capital, cap.country);
      if (presentKeys.has(k)) continue; // capital already in dataset (e.g. a large capital)
      presentKeys.add(k);
      if (!presentCountries.has(normCountry(cap.country))) capNewCountries++;
      presentCountries.add(normCountry(cap.country));
      top.push({
        id: `cap-${cap.a3 || normKey(cap.country)}`,
        name: cap.capital,
        rawName: cap.capital,
        country: cap.country,
        countryCode: "",
        lat: cap.lat,
        lon: cap.lon,
        population: cap.population || null,
        isCapital: true,
      });
      capAdded++;
    }
  }

  // Manually-curated extra cities (below 300k, not capitals).
  let extraAdded = 0;
  for (const e of EXTRA_CITIES) {
    const k = nameKey(e.name, e.country);
    if (presentKeys.has(k)) continue;
    presentKeys.add(k);
    top.push({
      id: e.id,
      name: e.name,
      rawName: e.name,
      country: canonicalCountry(e.country, null),
      countryCode: "",
      lat: e.lat,
      lon: e.lon,
      population: e.population || null,
      isExtra: true,
    });
    extraAdded++;
  }

  top.sort((a, b) => (b.population || 0) - (a.population || 0));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "cities.json"), JSON.stringify(top, null, 2));

  const kept = Number.isFinite(TOP_N) ? `top ${TOP_N}` : "all";
  console.log(`Parsed ${cities.length} cities >=300k; kept ${kept} + ${added.length} zero-CGT + ${capAdded} capitals = ${top.length}.`);
  if (added.length) console.log(`Zero-CGT additions: ${added.join(", ")}`);
  console.log(`Capitals added: ${capAdded} (${capNewCountries} countries not otherwise represented). Extra cities: ${extraAdded}.`);
  const countries = new Set(top.map((c) => c.country));
  console.log(`Countries represented: ${countries.size}`);
}

main();
