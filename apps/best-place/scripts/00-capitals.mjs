// 00-capitals.mjs — fetch every country's capital city (name, coordinates, population)
// from Natural Earth's populated-places dataset, so the map can include all capitals even
// when they are below the UN 300k threshold.
//
// Output: scripts/out/capitals.json  [{ country, capital, lat, lon, population, a3 }]

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCountry } from "./lib/countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson";

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": "best_place-data/0.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const geo = await res.json();

  const caps = geo.features.filter((f) => f.properties.adm0cap === 1);
  const out = [];
  const seen = new Set();
  for (const f of caps) {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const country = canonicalCountry(p.adm0name, null);
    const capital = String(p.nameascii || p.name).split(",")[0].trim();
    const key = `${country}|${capital}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      country,
      capital,
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      population: p.pop_max || p.pop_min || null,
      a3: p.adm0_a3 || null,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "capitals.json"), JSON.stringify(out, null, 2));
  console.log(`Capitals: ${out.length} national capitals written.`);
  console.log("Sample:", out.slice(0, 6).map((c) => `${c.capital} (${c.country})`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
