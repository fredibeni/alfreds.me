import { climateSummary, netIncomePercentOf, colPercentOf, yearsOf } from "../hooks/useMatches.js";
import { buildTempCdfOne, daysInRange } from "../climate.js";
import InfoIcon from "./InfoIcon.jsx";

const pct = (v) => (v == null ? "—" : `${v}%`);
const money = (v) => (v == null ? "—" : `$${v.toLocaleString()}`);
const lifeExp = (c) => (c.lifeExpectancy == null ? "—" : `${c.lifeExpectancy} yrs`);
const lifeExpRank = (c) => (c.lifeExpectancy == null ? null : `(${c.lifeExpectancyRank}/${c.lifeExpectancyTotal})`);
const cnt = (n) => (n == null ? "—" : `${n}`);
const numOf = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// Days per year outside the set daytime temperature thresholds (daytime = the daily maximum).
// Module-level so the full detail list and the map's quick preview report the same figures.
// These ignore rainfall, so they read the histogram's unconstrained temperature marginal.
const marginal = (c) => (c && c.packed && c.index != null ? buildTempCdfOne(c.packed, c.index, null) : null);
const daysAboveOf = (c, maxT) => {
  const m = maxT == null ? null : marginal(c);
  return m ? Math.round(daysInRange(m, 0, maxT + 1, null) / yearsOf(c)) : null;
};
const daysBelowOf = (c, minT) => {
  const m = minT == null ? null : marginal(c);
  return m ? Math.round(daysInRange(m, 0, null, minT - 1) / yearsOf(c)) : null;
};

function Row({ label, a, b, hasCompare, note, noteB, info }) {
  return (
    <div className={hasCompare ? "detail-row compare" : "detail-row"}>
      <span className="detail-label">{label}{info && <InfoIcon text={info} />}</span>
      <span className="detail-value">{a}{note && <em className="detail-note"> {note}</em>}</span>
      {hasCompare && (
        <span className="detail-value compare-col">{b}{noteB && <em className="detail-note"> {noteB}</em>}</span>
      )}
    </div>
  );
}

// The metric rows on their own, so they can be rendered either inside the floating card on
// the map (desktop) or inline underneath a city row in the Cities tab (mobile).
export function CityDetailBody({ city, filters = {}, currentCity }) {
  if (!city) return null;
  const cmp = currentCity && currentCity.id !== city.id ? currentCity : null;
  const has = !!cmp;
  const s = climateSummary(city);
  const cs = cmp ? climateSummary(cmp) : null;

  const colPercent = colPercentOf(city, currentCity);
  const netPercent = netIncomePercentOf(city, currentCity);

  const days = (c) => (c && c.qualifyingDays != null ? `${c.qualifyingDays}` : "—");
  const srcNote = (src) => (src === "country" ? "(country-level)" : "");

  const maxT = numOf(filters.maxTemp);
  const minT = numOf(filters.minTemp);
  const daysAbove = (c) => daysAboveOf(c, maxT);
  const daysBelow = (c) => daysBelowOf(c, minT);

  // Label the actual span of daily data behind the averages (currently 2021-2025 for every
  // city, but derived from the data itself rather than hardcoded so it can't go stale again).
  const WEATHER_END_YEAR = 2025;
  const climateYearLabel = (c) => {
    if (!c || !c.days) return "no data";
    const yrs = yearsOf(c);
    return yrs > 1 ? `${WEATHER_END_YEAR - yrs + 1}–${WEATHER_END_YEAR}` : `${WEATHER_END_YEAR}`;
  };

  return (
    <>
      {has && (
        <div className="detail-row compare detail-heads">
          <span className="detail-label" />
          <span className="detail-value">{city.name}</span>
          <span className="detail-value compare-col">{cmp.name}</span>
        </div>
      )}

      <Row label="Population" hasCompare={has}
        a={city.population.toLocaleString()} b={has ? cmp.population.toLocaleString() : null} />
      <Row label="Life expectancy" hasCompare={has}
        note={lifeExpRank(city)} noteB={has ? lifeExpRank(cmp) : null}
        a={lifeExp(city)} b={has ? lifeExp(cmp) : null} />

      <div className="detail-section">Taxes</div>
      <Row label="Max income tax" hasCompare={has} a={pct(city.incomeTax)} b={has ? pct(cmp.incomeTax) : null} />
      <Row label="Max capital gains" hasCompare={has} info={city.cgtNote}
        a={pct(city.capitalGainsTax)} b={has ? pct(cmp.capitalGainsTax) : null} />

      <div className="detail-section">Cost of living &amp; income</div>
      <Row label="CoL index" hasCompare={has}
        a={city.colIndex == null ? "—" : city.colIndex} b={has ? (cmp.colIndex == null ? "—" : cmp.colIndex) : null}
        note={srcNote(city.colSource)} />
      <Row label="Post-tax income /mo" hasCompare={has}
        a={money(city.netIncome)} b={has ? money(cmp.netIncome) : null}
        note={srcNote(city.netIncomeSource)} />
      {has && (
        <>
          <Row label="CoL vs. yours" a={colPercent == null ? "—" : `${Math.round(colPercent)}%`} />
          <Row label="Income vs. yours" a={netPercent == null ? "—" : `${Math.round(netPercent)}%`} />
        </>
      )}

      <div className="detail-section">Climate ({climateYearLabel(city)})</div>
      <Row label="Ideal days / yr" hasCompare={has} a={days(city)} b={has ? days(cmp) : null} />
      {s && (
        <>
          <Row label={maxT != null ? `Days above ${maxT}°C` : "Days above max"} hasCompare={has}
            a={cnt(daysAbove(city))} b={has ? cnt(daysAbove(cmp)) : null} />
          <Row label={minT != null ? `Days below ${minT}°C` : "Days below min"} hasCompare={has}
            a={cnt(daysBelow(city))} b={has ? cnt(daysBelow(cmp)) : null} />
          <Row label="Annual rainfall" hasCompare={has}
            a={s.annualRain == null ? "—" : `${s.annualRain} mm`} b={cs ? (cs.annualRain == null ? "—" : `${cs.annualRain} mm`) : null} />
        </>
      )}
    </>
  );
}

const fmtPop = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);

// Mobile: the full metric list already lives in the Cities tab, so the card over the map is
// just a peek — enough to identify the pin without burying the map under a full-height sheet.
// Laid out two per row, so the entries pair up as climate, climate, tax, tax.
function QuickStats({ city, climate, filters = {} }) {
  const maxT = numOf(filters.maxTemp);
  const minT = numOf(filters.minTemp);

  const stats = [
    ["Population", fmtPop(city.population)],
    climate ? ["Ideal days / yr", `${city.qualifyingDays}`] : null,
    maxT != null ? [`Days above ${maxT}°C`, `☀️ ${cnt(daysAboveOf(city, maxT))}`] : null,
    minT != null ? [`Days below ${minT}°C`, `❄️ ${cnt(daysBelowOf(city, minT))}`] : null,
    ["Max income tax", pct(city.incomeTax)],
    ["Max capital gains", pct(city.capitalGainsTax)],
  ].filter(Boolean);

  return (
    <div className="detail-quick">
      {stats.map(([label, value]) => (
        <div className="quick-stat" key={label}>
          <span className="quick-label">{label}</span>
          <span className="quick-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

// Floating card anchored to the map.
export default function CityDetail({ city, filters, currentCity, climate, onClose, compact = false, onExpand }) {
  if (!city) return null;
  const wide = !compact && currentCity && currentCity.id !== city.id;

  return (
    <div className={`detail-card${wide ? " wide" : ""}${compact ? " compact" : ""}`}>
      <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      <h2>{city.name}</h2>
      <div className="detail-country">{city.country}</div>
      {compact ? (
        <>
          <QuickStats city={city} climate={climate} filters={filters} />
          <button className="btn ghost detail-more" onClick={onExpand}>
            See full details <span aria-hidden="true">&#8594;</span>
          </button>
        </>
      ) : (
        <CityDetailBody city={city} filters={filters} currentCity={currentCity} />
      )}
    </div>
  );
}
