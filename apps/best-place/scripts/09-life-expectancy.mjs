// 09-life-expectancy.mjs — scrape the Wikipedia "List of countries by life expectancy"
// page for life expectancy at birth (both sexes) per country/territory.
//
// Output: scripts/out/life_expectancy.json  (keyed by normCountry(canonicalCountry(name)))

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCountry, normCountry } from "./lib/countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const URL = "https://en.wikipedia.org/wiki/List_of_countries_by_life_expectancy";

// The page has several wikitables (WHO, UN, World Bank...); find the one whose header
// mentions "Life expectancy overall" - it carries a single clean value per country plus
// male/female, with the most standard country-name spellings of the bunch.
function parseWikiTable(html) {
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const table = tables.find((t) => /Life expectancy overall/.test(t));
  if (!table) throw new Error("life expectancy table not found");

  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  const out = {};
  for (const tr of rows) {
    const cells = [...tr.matchAll(/<t[hd]\b[\s\S]*?>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1]);
    if (cells.length < 2) continue;
    const name = cells[0]
      .replace(/<sup[\s\S]*?<\/sup>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ").trim();
    const value = cells[1].replace(/<[^>]+>/g, "").trim();
    const years = Number(value);
    if (!name || !Number.isFinite(years) || years <= 0) continue; // skip header/section rows
    const country = canonicalCountry(name, null);
    out[normCountry(country)] = { country, lifeExpectancy: years };
  }
  return out;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": "best_place-data/0.1 (personal project)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const life = parseWikiTable(html);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "life_expectancy.json"), JSON.stringify(life, null, 2));

  const n = Object.keys(life).length;
  console.log(`Parsed life expectancy rows: ${n}`);
  for (const c of ["japan", "united states", "nigeria", "hong kong", "central african republic"]) {
    if (life[c]) console.log(`  ${life[c].country}: ${life[c].lifeExpectancy} yrs`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
