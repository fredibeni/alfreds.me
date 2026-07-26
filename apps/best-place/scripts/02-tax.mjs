// 02-tax.mjs — scrape the Wikipedia "List of countries by tax rates" main table for the
// highest individual income tax rate and the highest capital gains tax rate per country.
//
// Output: scripts/out/tax.json  (keyed by canonical country name)

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCountry, normCountry } from "./lib/countries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const URL = "https://en.wikipedia.org/wiki/List_of_countries_by_tax_rates";

// Pull the single largest percentage out of a messy cell like
// "45% (+ 39.2% social security ... up to €90,600)" -> 45.
// Returns null for "0%", "None", "No", "Inactive", "N/A", empty.
function maxPercent(html) {
  if (html == null) return null;
  const text = html
    .replace(/<sup[^>]*>.*?<\/sup>/gis, " ") // drop footnote markers
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /^(none|no|n\/a|inactive|abolished|—|-)$/i.test(text)) return null;
  // Normalise European decimal commas ("31,4%" -> "31.4%") but leave thousands separators
  // (they won't be followed by "%", so they're ignored anyway).
  const norm = text.replace(/(\d),(\d)/g, "$1.$2");
  const nums = [...norm.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  if (nums.length === 0) return null;
  const max = Math.max(...nums);
  return Number.isFinite(max) ? max : null;
}

// Very small HTML table parser tuned for the Wikipedia wikitable.
function parseWikiTable(html) {
  // Grab the first sortable wikitable.
  const tblMatch = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/i);
  if (!tblMatch) throw new Error("wikitable not found");
  const table = tblMatch[0];

  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  const parsed = rows.map((tr) =>
    [...tr.matchAll(/<(t[hd])\b[\s\S]*?>([\s\S]*?)<\/\1>/gi)].map((c) => c[2])
  );

  // The trailing columns are fixed regardless of an extra un-headered column some rows carry:
  //   ... Wealth | Property | Inheritance | VAT | Further reading  (Further reading = last)
  // Counting from the right: capital gains = len-6, individual income = len-7.
  const CG_FROM_END = 6;
  const INCOME_FROM_END = 7;

  const out = {};
  for (const r of parsed) {
    if (r.length < 8) continue; // section/subheader rows
    const name = r[0]
      .replace(/<sup[\s\S]*?<\/sup>/gi, "")     // footnote markers
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\[[^\]]*\]/g, "")               // [citation needed], [note 1]
      .replace(/\s+/g, " ").trim()
      .replace(/\s*\d+$/, "");                    // trailing footnote number
    if (!name || /individual income|jurisdiction|tax rate/i.test(name)) continue;
    const country = canonicalCountry(name, null);
    out[normCountry(country)] = {
      country,
      incomeTax: maxPercent(r[r.length - INCOME_FROM_END]),
      capitalGainsTax: maxPercent(r[r.length - CG_FROM_END]),
    };
  }
  return out;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": "best_place-data/0.1 (personal project)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const tax = parseWikiTable(html);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "tax.json"), JSON.stringify(tax, null, 2));

  const n = Object.keys(tax).length;
  const withIncome = Object.values(tax).filter((t) => t.incomeTax != null).length;
  const withCG = Object.values(tax).filter((t) => t.capitalGainsTax != null).length;
  console.log(`Parsed tax rows: ${n} (income:${withIncome}, capgains:${withCG})`);
  for (const c of ["germany", "united states", "singapore", "united arab emirates", "japan"]) {
    if (tax[c]) console.log(`  ${tax[c].country}: income ${tax[c].incomeTax}%, capgains ${tax[c].capitalGainsTax}%`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
