import { useMemo } from "react";

// Empty filter state. `null` means "not set" (optional filters).
export const EMPTY_FILTERS = {
  maxIncomeTax: null,
  maxCapGainsTax: null,
  currentCityId: null,
  maxColPercent: null,
  maxRain: 2,      // mm/day (default)
  minTemp: 10,     // daytime (daily high) low bound, °C (default)
  maxTemp: 30,     // daytime (daily high) high bound, °C (default)
  minNetIncomePercent: null, // min post-tax income as % of current city
  minPopulation: null, // enforced >= 300000
  maxPopulation: null,
};

const isSet = (v) => v !== null && v !== undefined && v !== "";
const num = (v) => (isSet(v) ? Number(v) : null);

// Does the city use any climate constraint? (drives whether qualifyingDays is meaningful)
export function hasClimateFilter(f) {
  return isSet(f.maxRain) || isSet(f.minTemp) || isSet(f.maxTemp);
}

// Count days in the year meeting the set rain/temperature constraints.
// Daytime temperature = daily maximum (tmax).
export function countQualifyingDays(city, f) {
  if (!city.tmax) return 0;
  const maxRain = num(f.maxRain);
  const minTemp = num(f.minTemp);
  const maxTemp = num(f.maxTemp);
  let n = 0;
  for (let i = 0; i < city.tmax.length; i++) {
    const t = city.tmax[i];
    const p = city.precip ? city.precip[i] : 0;
    if (t === -128) continue; // no-data sentinel
    if (maxRain !== null && !(p != null && p <= maxRain)) continue;
    if (minTemp !== null && !(t != null && t >= minTemp)) continue;
    if (maxTemp !== null && !(t != null && t <= maxTemp)) continue;
    n++;
  }
  // Average across the years of data held (counting per year then averaging == total / years).
  return Math.round(n / yearsOf(city));
}

// Number of whole years of daily data stored for a city (1 now, 5 after the 2021-2025 backfill).
export function yearsOf(city) {
  if (city.years) return city.years;
  return city.tmax ? Math.max(1, Math.round(city.tmax.length / 365)) : 1;
}

// Cost-of-living percentage vs. the chosen current city.
export function colPercentOf(city, currentCity) {
  if (!currentCity || currentCity.colIndex == null || city.colIndex == null) return null;
  return (city.colIndex / currentCity.colIndex) * 100;
}

// Post-tax income as a percentage of the chosen current city's post-tax income.
export function netIncomePercentOf(city, currentCity) {
  if (!currentCity || !currentCity.netIncome || city.netIncome == null) return null;
  return (city.netIncome / currentCity.netIncome) * 100;
}

// Annual climate summaries for the detail view (daily maximum = "daytime" temperature).
export function climateSummary(city) {
  if (!city.tmax) return null;
  const valid = (a) => a.filter((v) => v != null && v !== -128);
  const t = valid(city.tmax);
  const years = yearsOf(city);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  return {
    avgHigh: +avg(t).toFixed(1),
    maxHigh: t.length ? Math.max(...t) : null,
    // Rainfall totalled over all years, then averaged back to a single year.
    annualRain: city.precip ? Math.round(valid(city.precip).reduce((s, v) => s + v, 0) / years) : null,
  };
}

// Compute, for every city, its derived metrics + whether it matches the applied filters.
// Returns { rows, matches } where matches are sorted best-first.
export function useMatches(cities, filters) {
  return useMemo(() => {
    if (!cities) return { rows: [], matches: [] };
    const f = filters;
    const climate = hasClimateFilter(f);
    // Raw record for the internal % comparisons (needs colIndex / netIncome, which it has).
    const currentRaw = f.currentCityId ? cities.find((c) => c.id === f.currentCityId) : null;

    const maxIncome = num(f.maxIncomeTax);
    const maxCG = num(f.maxCapGainsTax);
    const maxCol = num(f.maxColPercent);
    const minNetIncome = num(f.minNetIncomePercent);
    const minPop = num(f.minPopulation);
    const maxPop = num(f.maxPopulation);

    const rows = cities.map((c) => {
      const qualifyingDays = countQualifyingDays(c, f);
      const colPercent = colPercentOf(c, currentRaw);
      const netIncomePercent = netIncomePercentOf(c, currentRaw);

      const reasons = [];
      if (maxIncome !== null) {
        if (c.incomeTax == null || c.incomeTax > maxIncome) reasons.push("income tax");
      }
      if (maxCG !== null) {
        if (c.capitalGainsTax == null || c.capitalGainsTax > maxCG) reasons.push("capital gains tax");
      }
      if (maxCol !== null) {
        if (colPercent == null || colPercent > maxCol) reasons.push("cost of living");
      }
      if (minNetIncome !== null) {
        if (netIncomePercent == null || netIncomePercent < minNetIncome) reasons.push("post-tax income");
      }
      // Climate is no longer a hard gate — it drives the heatmap fill and the ranking below.
      if (minPop !== null && c.population < minPop) reasons.push("min population");
      if (maxPop !== null && c.population > maxPop) reasons.push("max population");

      return { ...c, qualifyingDays, colPercent, netIncomePercent, matched: reasons.length === 0, failReasons: reasons };
    });

    const matches = rows
      .filter((r) => r.matched)
      .sort((a, b) => {
        // Best match: more qualifying days first, then cheaper, then bigger.
        if (climate && b.qualifyingDays !== a.qualifyingDays) return b.qualifyingDays - a.qualifyingDays;
        const ac = a.colPercent ?? (a.colIndex ?? Infinity);
        const bc = b.colPercent ?? (b.colIndex ?? Infinity);
        if (ac !== bc) return ac - bc;
        return b.population - a.population;
      });

    // Return the computed row for the current city so the detail view has its qualifyingDays.
    const currentCity = f.currentCityId ? rows.find((r) => r.id === f.currentCityId) || currentRaw : null;
    return { rows, matches, currentCity, climate };
  }, [cities, filters]);
}
