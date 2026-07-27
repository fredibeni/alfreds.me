import { useMemo } from "react";
import { buildTempCdf, daysInRange } from "../climate.js";

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

// Number of whole years of daily data behind a city's climate figures.
export function yearsOf(city) {
  return city.days ? Math.max(1, Math.round(city.days / 365)) : 1;
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
// These read exact per-city totals rather than the histogram, whose end buckets are clamped and
// so could not reproduce a true sum or maximum.
export function climateSummary(city) {
  if (!city.days) return null;
  return {
    avgHigh: +(city.tSum / city.nObs).toFixed(1),
    maxHigh: city.tHigh,
    // Rainfall totalled over all years, then averaged back to a single year.
    annualRain: city.hasPrecip ? Math.round(city.pSum / yearsOf(city)) : null,
  };
}

// Compute, for every city, its derived metrics + whether it matches the applied filters.
// Returns { rows, matches } where matches are sorted best-first.
export function useMatches(cities, filters, packed) {
  // Collapsing the rain axis is the only expensive step and depends on maxRain alone, so it is
  // memoised apart from the rest — moving a temperature slider then costs two array reads per
  // city instead of a 1826-day scan.
  const maxRain = num(filters.maxRain);
  const tempCdf = useMemo(
    () => (cities && packed ? buildTempCdf(packed, cities.length, maxRain) : null),
    [cities, packed, maxRain]
  );

  return useMemo(() => {
    if (!cities) return { rows: [], matches: [] };
    const f = filters;
    const climate = hasClimateFilter(f);
    const minTemp = num(f.minTemp);
    const maxTemp = num(f.maxTemp);
    // Raw record for the internal % comparisons (needs colIndex / netIncome, which it has).
    const currentRaw = f.currentCityId ? cities.find((c) => c.id === f.currentCityId) : null;

    const maxIncome = num(f.maxIncomeTax);
    const maxCG = num(f.maxCapGainsTax);
    const maxCol = num(f.maxColPercent);
    const minNetIncome = num(f.minNetIncomePercent);
    const minPop = num(f.minPopulation);
    const maxPop = num(f.maxPopulation);

    const rows = cities.map((c, i) => {
      // Averaged across the years held: counting per year then averaging == total / years.
      const qualifyingDays = tempCdf ? Math.round(daysInRange(tempCdf, i, minTemp, maxTemp) / yearsOf(c)) : 0;
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
  }, [cities, filters, tempCdf, maxRain]);
}
