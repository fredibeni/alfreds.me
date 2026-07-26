import { climateSummary, netIncomePercentOf, colPercentOf, yearsOf } from "../hooks/useMatches.js";

const pct = (v) => (v == null ? "—" : `${v}%`);
const money = (v) => (v == null ? "—" : `$${v.toLocaleString()}`);
const lifeExp = (c) => (c.lifeExpectancy == null ? "—" : `${c.lifeExpectancy} yrs`);
const lifeExpRank = (c) => (c.lifeExpectancy == null ? null : `(${c.lifeExpectancyRank}/${c.lifeExpectancyTotal})`);

function InfoIcon({ text }) {
  return (
    <span className="info" tabIndex={0} role="img" aria-label={text}>
      i<span className="info-tip">{text}</span>
    </span>
  );
}

function Row({ label, a, b, hasCompare, note, info }) {
  return (
    <div className={hasCompare ? "detail-row compare" : "detail-row"}>
      <span className="detail-label">{label}{info && <InfoIcon text={info} />}</span>
      <span className="detail-value">{a}{note && <em className="detail-note"> {note}</em>}</span>
      {hasCompare && <span className="detail-value compare-col">{b}</span>}
    </div>
  );
}

export default function CityDetail({ city, filters, currentCity, climate, onClose }) {
  if (!city) return null;
  const cmp = currentCity && currentCity.id !== city.id ? currentCity : null;
  const has = !!cmp;
  const s = climateSummary(city);
  const cs = cmp ? climateSummary(cmp) : null;

  const colPercent = colPercentOf(city, currentCity);
  const netPercent = netIncomePercentOf(city, currentCity);

  const days = (c) => (c && c.qualifyingDays != null ? `${c.qualifyingDays}` : "—");
  const srcNote = (src) => (src === "country" ? "(country-level)" : "");

  // Day counts vs. the set daytime temperature thresholds (using the daily maximum).
  const numOf = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const maxT = numOf(filters.maxTemp);
  const minT = numOf(filters.minTemp);
  const daysAbove = (c) => (c && c.tmax && maxT != null
    ? Math.round(c.tmax.filter((t) => t != null && t !== -128 && t > maxT).length / yearsOf(c)) : null);
  const daysBelow = (c) => (c && c.tmax && minT != null
    ? Math.round(c.tmax.filter((t) => t != null && t !== -128 && t < minT).length / yearsOf(c)) : null);
  const cnt = (n) => (n == null ? "—" : `${n}`);

  // Label the actual span of daily data behind the averages (currently 2021-2025 for every
  // city, but derived from the data itself rather than hardcoded so it can't go stale again).
  const WEATHER_END_YEAR = 2025;
  const climateYearLabel = (c) => {
    if (!c || !c.tmax) return "no data";
    const yrs = yearsOf(c);
    return yrs > 1 ? `${WEATHER_END_YEAR - yrs + 1}–${WEATHER_END_YEAR}` : `${WEATHER_END_YEAR}`;
  };

  return (
    <div className={has ? "detail-card wide" : "detail-card"}>
      <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      <h2>{city.name}</h2>
      <div className="detail-country">{city.country}</div>

      {has && (
        <div className="detail-row compare detail-heads">
          <span className="detail-label" />
          <span className="detail-value">{city.name}</span>
          <span className="detail-value compare-col">{cmp.name}</span>
        </div>
      )}

      <Row label="Population" hasCompare={has}
        a={city.population.toLocaleString()} b={has ? cmp.population.toLocaleString() : null} />
      <Row label="Life expectancy" hasCompare={has} note={lifeExpRank(city)}
        a={lifeExp(city)} b={has ? lifeExp(cmp) : null} />

      <div className="detail-section">Taxes</div>
      <Row label="Max income tax" hasCompare={has} a={pct(city.incomeTax)} b={has ? pct(cmp.incomeTax) : null} />
      <Row label="Max capital gains" hasCompare={has} info={city.cgtNote}
        a={pct(city.capitalGainsTax)} b={has ? pct(cmp.capitalGainsTax) : null} />

      <div className="detail-section">Cost of living &amp; income</div>
      <Row label="Numbeo CoL index" hasCompare={has}
        a={city.colIndex == null ? "—" : city.colIndex} b={has ? (cmp.colIndex == null ? "—" : cmp.colIndex) : null}
        note={srcNote(city.colSource)} />
      <Row label="Post-tax income /mo" hasCompare={has}
        a={money(city.netIncome)} b={has ? money(cmp.netIncome) : null}
        note={srcNote(city.netIncomeSource)} />
      {has && (
        <>
          <Row label="Cost of living vs. yours" a={colPercent == null ? "—" : `${Math.round(colPercent)}%`} />
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
    </div>
  );
}
