// 07-income.mjs — collect post-tax average income (Numbeo "Average Monthly Net Salary
// (After Tax)") per city in a common currency (USD), with country-level fallback.
//
// City page:    /cost-of-living/in/<slug>?displayCurrency=USD
// Country page: /cost-of-living/country_result.jsp?country=<Country>&displayCurrency=USD
//
// Output: scripts/out/income.json  (keyed by city id) { netIncome, netIncomeSource }
// Resumable via a checkpoint so rate-limit interruptions can be retried.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const OUT = join(OUT_DIR, "income.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Numbeo country param spellings that differ from our canonical names.
const COUNTRY_PARAM = {
  "United States": "United+States",
  "United Kingdom": "United+Kingdom",
  "South Korea": "South+Korea",
  "North Korea": "North+Korea",
  "DR Congo": "Congo",
  "Ivory Coast": "Cote+D'Ivoire",
  "Hong Kong": "Hong+Kong+(China)",
  "United Arab Emirates": "United+Arab+Emirates",
  "Saudi Arabia": "Saudi+Arabia",
  "Czech Republic": "Czech+Republic",
  "Dominican Republic": "Dominican+Republic",
  "Guatemala": "Guatemala",
};

function parseSalaryUSD(html) {
  const idx = html.search(/Average Monthly Net Salary[^<]*\(After Tax\)/i);
  if (idx === -1) return null;
  const seg = html.slice(idx, idx + 400);
  const m = seg.match(/(?:\$|&#36;)\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) ? Math.round(v) : null;
}

async function getSalary(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" }, signal: AbortSignal.timeout(15000) });
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      await sleep(2500 * attempt); return getSalary(url, attempt + 1);
    }
    if (!res.ok) return null;
    return parseSalaryUSD(await res.text());
  } catch {
    if (attempt <= 3) { await sleep(1500 * attempt); return getSalary(url, attempt + 1); }
    return null;
  }
}

async function main() {
  const cities = JSON.parse(readFileSync(join(OUT_DIR, "cities.json"), "utf8"));
  const numbeo = JSON.parse(readFileSync(join(OUT_DIR, "numbeo.json"), "utf8"));
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const countryCache = {};

  async function countrySalary(country) {
    if (country in countryCache) return countryCache[country];
    const param = COUNTRY_PARAM[country] || encodeURIComponent(country);
    const url = `https://www.numbeo.com/cost-of-living/country_result.jsp?country=${param}&displayCurrency=USD`;
    const v = await getSalary(url);
    countryCache[country] = v;
    await sleep(300);
    return v;
  }

  let done = 0, cityHits = 0, countryHits = 0, misses = 0;
  for (const c of cities) {
    if (out[c.id]) { done++; continue; }
    const slug = numbeo[c.id]?.slug;
    let netIncome = null, source = null;
    // COUNTRY_ONLY skips per-city page fetches (far fewer requests -> less likely to hit the cap).
    if (slug && !process.env.COUNTRY_ONLY) {
      netIncome = await getSalary(`https://www.numbeo.com/cost-of-living/in/${slug}?displayCurrency=USD`);
      if (netIncome != null) source = "city";
      await sleep(350);
    }
    if (netIncome == null) {
      const cs = await countrySalary(c.country);
      if (cs != null) { netIncome = cs; source = "country"; }
    }
    if (netIncome != null) {
      out[c.id] = { netIncome, netIncomeSource: source };
      if (source === "city") cityHits++; else countryHits++;
    } else {
      misses++;
    }
    done++;
    if (done % 20 === 0) { console.log(`  ${done}/${cities.length} (city ${cityHits}, country ${countryHits}, miss ${misses})`); writeFileSync(OUT, JSON.stringify(out, null, 2)); }
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Net income: city ${cityHits}, country ${countryHits}, missing ${misses}. Total ${Object.keys(out).length}/${cities.length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
