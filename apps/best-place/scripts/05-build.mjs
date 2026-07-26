// 05-build.mjs — join cities + tax + Numbeo + weather into public/data.json, and enrich the
// world GeoJSON with per-country tax so the map can grey out non-qualifying countries.
//
// Outputs:
//   public/data.json     { cities:[...], meta }
//   public/world.geojson  world polygons with { name, incomeTax, capitalGainsTax } per feature

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCountry, normCountry } from "./lib/countries.mjs";
import { isZeroCgt } from "./lib/zero_cgt.mjs";
import { cgtListedShares, cgtNote } from "./lib/cgt_rates.mjs";
import { continentFor } from "./lib/continents.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const PUBLIC = join(__dirname, "..", "public");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function main() {
  const cities = readJson(join(OUT_DIR, "cities.json"));
  const tax = readJson(join(OUT_DIR, "tax.json"));      // key: normCountry(name)
  const numbeo = readJson(join(OUT_DIR, "numbeo.json")); // key: city id
  const weather = readJson(join(OUT_DIR, "weather.json"));// key: city id
  const income = existsSync(join(OUT_DIR, "income.json")) ? readJson(join(OUT_DIR, "income.json")) : {};
  const lifeExp = existsSync(join(OUT_DIR, "life_expectancy.json")) ? readJson(join(OUT_DIR, "life_expectancy.json")) : {};

  const taxFor = (name) => tax[normCountry(canonicalCountry(name, null))] || null;
  // A couple of our ckeys don't appear as their own row on Wikipedia's table (old-naming
  // duplicate / unrecognised state) - fall back to the country they actually belong to.
  const LIFE_EXP_ALIAS = { "tfyr macedonia": "north macedonia", somaliland: "somalia" };
  // The primary (UN 2023) table explicitly excludes countries under 50,000 population -
  // filled instead from the same Wikipedia page's secondary WHO-sourced table, which has
  // no such cutoff. Different methodology/year than the primary table, so treat these as
  // approximate. Vatican City has no meaningful published figure (no general resident
  // population - ~800 people, nearly all clergy) and is left unset.
  const MICROSTATE_LIFE_EXP = {
    monaco: 89.8, "san marino": 84.2, liechtenstein: 83.0,
    "saint kitts and nevis": 77.6, "marshall islands": 75.2, palau: 75.2, tuvalu: 69.0,
  };
  const lifeExpectancyFor = (ckey) =>
    (lifeExp[ckey] ?? lifeExp[LIFE_EXP_ALIAS[ckey]])?.lifeExpectancy ?? MICROSTATE_LIFE_EXP[ckey] ?? null;

  // Encode a daily series to base64 int8 (compact; keeps multi-year data small).
  const encTemp = (arr) => {
    if (!arr) return null;
    const a = new Int8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      a[i] = v == null ? -128 : Math.max(-128, Math.min(127, Math.round(v)));
    }
    return Buffer.from(a.buffer).toString("base64");
  };
  const encPrecip = (arr) => {
    if (!arr) return null;
    const a = new Int8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      a[i] = v == null ? 0 : Math.max(0, Math.min(127, Math.round(v)));
    }
    return Buffer.from(a.buffer).toString("base64");
  };
  // Capital gains for listed shares/ETFs: zero-CGT list -> 0; else Wikipedia's value;
  // else the curated listed-shares table (fills the countries Wikipedia leaves blank).
  const cgtFor = (name, t) => {
    const canon = canonicalCountry(name, null);
    if (isZeroCgt(canon)) return 0;
    if (t && t.capitalGainsTax != null) return t.capitalGainsTax;
    return cgtListedShares(canon);
  };
  // Caveat text for the capital-gains value (curated / zero-list values carry conditions).
  const cgtNoteFor = (name, t) => {
    const canon = canonicalCountry(name, null);
    const zero = isZeroCgt(canon);
    const fromWiki = !zero && t && t.capitalGainsTax != null;
    const curated = !zero && !fromWiki && cgtListedShares(canon) != null;
    return cgtNote(canon, { zero, curated });
  };

  const built = [];
  const cov = { tax: 0, income: 0, capgains: 0, col: 0, weather: 0, netIncome: 0, lifeExpectancy: 0 };
  for (const c of cities) {
    const t = taxFor(c.country);
    const nb = numbeo[c.id];
    const w = weather[c.id];
    const inc = income[c.id];
    const capgains = cgtFor(c.country, t);
    const ckey = normCountry(canonicalCountry(c.country, null));
    const lifeExpectancy = lifeExpectancyFor(ckey);
    if (t) cov.tax++;
    if (t && t.incomeTax != null) cov.income++;
    if (capgains != null) cov.capgains++;
    if (nb) cov.col++;
    if (w) cov.weather++;
    if (inc) cov.netIncome++;
    if (lifeExpectancy != null) cov.lifeExpectancy++;

    built.push({
      id: c.id,
      name: c.name,
      country: c.country,
      countryCode: c.countryCode,
      ckey, // join key to world.geojson
      continent: continentFor(ckey),

      lat: c.lat,
      lon: c.lon,
      population: c.population,
      incomeTax: t ? t.incomeTax : null,
      capitalGainsTax: capgains,
      cgtNote: capgains == null ? null : cgtNoteFor(c.country, t),
      colIndex: nb ? nb.colIndex : null,
      colSource: nb ? nb.colSource : null,
      netIncome: inc ? inc.netIncome : null,
      netIncomeSource: inc ? inc.netIncomeSource : null,
      lifeExpectancy,                       // years at birth, country-level (Wikipedia/UN)
      days: w ? w.tmax.length : 0,          // number of daily records (365 = 1yr, 1826 = 5yr)
      tmax: w ? encTemp(w.tmax) : null,     // base64 int8
      precip: w ? encPrecip(w.precip) : null,
    });
  }

  // Rank each country's life expectancy among the countries actually present in our data
  // (i.e. that have at least one city here), 1 = highest life expectancy.
  const lifeExpByCkey = new Map();
  for (const c of built) if (!lifeExpByCkey.has(c.ckey)) lifeExpByCkey.set(c.ckey, c.lifeExpectancy);
  const ranked = [...lifeExpByCkey.entries()].filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const lifeExpRankByCkey = new Map(ranked.map(([ckey], i) => [ckey, i + 1]));
  const lifeExpectancyTotal = ranked.length;
  for (const c of built) {
    c.lifeExpectancyRank = lifeExpRankByCkey.get(c.ckey) ?? null;
    c.lifeExpectancyTotal = lifeExpectancyTotal;
  }

  const data = {
    meta: { weatherStart: 2021, weatherEnd: 2025, generatedAt: new Date().toISOString(), cityCount: built.length },
    cities: built,
  };
  writeFileSync(join(PUBLIC, "data.json"), JSON.stringify(data));

  // Enrich world geojson with tax by matching feature name -> tax.
  const geo = readJson(join(__dirname, "..", "src", "assets", "world.geojson"));
  let geoMatched = 0;
  for (const f of geo.features) {
    const t = taxFor(f.properties.name);
    f.properties.incomeTax = t ? t.incomeTax : null;
    f.properties.capitalGainsTax = cgtFor(f.properties.name, t);
    f.properties.ckey = normCountry(canonicalCountry(f.properties.name, null)); // join key to cities
    f.properties.continent = continentFor(f.properties.ckey);
    if (f.properties.name === "United States of America") f.properties.name = "USA";
    if (t) geoMatched++;
  }
  writeFileSync(join(PUBLIC, "world.geojson"), JSON.stringify(geo));

  const n = built.length;
  console.log(`Built public/data.json with ${n} cities.`);
  console.log(`Coverage: tax ${cov.tax}/${n}, income ${cov.income}, capgains ${cov.capgains}, col ${cov.col}, weather ${cov.weather}, netIncome ${cov.netIncome}, lifeExpectancy ${cov.lifeExpectancy}`);
  console.log(`GeoJSON countries matched to tax: ${geoMatched}/${geo.features.length}`);
  const size = (readFileSync(join(PUBLIC, "data.json")).length / 1e6).toFixed(2);
  console.log(`data.json size: ${size} MB`);
}

main();
