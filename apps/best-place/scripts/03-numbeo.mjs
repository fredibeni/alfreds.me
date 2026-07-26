// 03-numbeo.mjs — collect Numbeo Cost of Living Index at city level (with country-level
// fallback) and match it to our curated cities.
//
// Numbeo publishes the whole ranking on one page, so a single request gets ~500 cities.
//   City ranking:    /cost-of-living/rankings_current.jsp   (table id "t2")
//   Country ranking: /cost-of-living/rankings_by_country.jsp
// In each row the FIRST numeric column is the Cost of Living Index.
//
// Output: scripts/out/numbeo.json  (keyed by city id) + a coverage report to stdout.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normKey } from "./lib/names.mjs";
import { normCountry } from "./lib/countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function getHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Our (metro) city name -> the name Numbeo uses for the core city.
const CITY_ALIASES = {
  "Phoenix-Mesa": "Phoenix",
  "San Francisco-Oakland": "San Francisco",
  "Minneapolis-St. Paul": "Minneapolis",
  "Tampa-St. Petersburg": "Tampa",
  "Denver-Aurora": "Denver",
  "Tel Aviv-Jaffa": "Tel Aviv",
  "Kyiv": "Kiev",
  "Kozhikode": "Calicut",
};

// Parse a Numbeo ranking table into { label, col } rows.
function parseRanking(html, tableId) {
  const tbl = html.match(new RegExp(`<table[^>]*id="${tableId}"[\\s\\S]*?</table>`, "i"));
  const body = tbl ? tbl[0] : html;
  const rows = [...body.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  const out = [];
  for (const tr of rows) {
    const cells = [...tr.matchAll(/<td[\s\S]*?<\/td>/gi)].map((c) => c[0]);
    if (cells.length < 3) continue;
    // Label cell carries this class in both the city and country tables (the country
    // table's label is plain text with no anchor).
    const labelCell = cells.find((c) => /cityOrCountryInIndicesTable/.test(c))
      || cells.find((c) => /<a\b/i.test(c));
    if (!labelCell) continue;
    const label = strip(labelCell);
    // Numbeo city URL slug (e.g. href=".../cost-of-living/in/Zurich" -> "Zurich").
    const hrefM = labelCell.match(/\/cost-of-living\/in\/([^"?]+)/);
    const slug = hrefM ? hrefM[1] : null;
    // First numeric cell after the label = Cost of Living Index.
    const nums = cells.map(strip).filter((v) => /^\d+(\.\d+)?$/.test(v));
    if (!label || nums.length === 0) continue;
    out.push({ label, col: Number(nums[0]), slug });
  }
  return out;
}

async function main() {
  const cities = JSON.parse(readFileSync(join(OUT_DIR, "cities.json"), "utf8"));

  const cityHtml = await getHtml("https://www.numbeo.com/cost-of-living/rankings_current.jsp");
  const countryHtml = await getHtml("https://www.numbeo.com/cost-of-living/rankings_by_country.jsp");

  // City index: key -> list of { country, col, slug }
  const cityIndex = new Map();
  for (const { label, col, slug } of parseRanking(cityHtml, "t2")) {
    const parts = label.split(",").map((s) => s.trim());
    const country = parts.length > 1 ? parts[parts.length - 1] : "";
    const cityName = parts[0];
    const key = normKey(cityName);
    if (!cityIndex.has(key)) cityIndex.set(key, []);
    cityIndex.get(key).push({ country: normCountry(country), col, slug });
  }

  // Country index: countryKey -> col
  const countryIndex = new Map();
  for (const { label, col } of parseRanking(countryHtml, "t2")) {
    countryIndex.set(normCountry(label), col);
  }

  const out = {};
  let cityHits = 0, countryHits = 0, misses = 0;
  const missList = [];
  for (const c of cities) {
    const key = normKey(c.name);
    const ck = normCountry(c.country);
    const candidates = cityIndex.get(key) || cityIndex.get(normKey(CITY_ALIASES[c.name] || ""));
    let col = null, source = null, slug = null;
    if (candidates && candidates.length) {
      const match = candidates.find((x) => x.country === ck) || candidates[0];
      col = match.col; source = "city"; slug = match.slug; cityHits++;
    } else if (countryIndex.has(ck)) {
      col = countryIndex.get(ck); source = "country"; countryHits++;
    } else {
      misses++; missList.push(`${c.name} (${c.country})`);
    }
    if (col != null) out[c.id] = { colIndex: col, colSource: source, slug };
  }

  writeFileSync(join(OUT_DIR, "numbeo.json"), JSON.stringify(out, null, 2));
  console.log(`Numbeo COL: city-level ${cityHits}, country-fallback ${countryHits}, missing ${misses}`);
  if (missList.length) console.log("  missing:", missList.join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
