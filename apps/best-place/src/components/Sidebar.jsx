import { CONTINENTS } from "../continents.js";

function fmtPop(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${Math.round(n / 1e3)}k`;
}

const SIDEBAR_LIMIT = 250;

function ContinentFilter({ selectedContinents, setSelectedContinents }) {
  const allSelected = selectedContinents.size === CONTINENTS.length;
  const toggle = (continent) => {
    setSelectedContinents((prev) => {
      const next = new Set(prev);
      if (next.has(continent)) next.delete(continent);
      else next.add(continent);
      // Never allow an empty selection - that would just hide every city.
      return next.size === 0 ? prev : next;
    });
  };

  return (
    <div className="continent-filter">
      <div className="continent-filter-head">
        <span className="field-label">Continents</span>
        {!allSelected && (
          <button className="link-btn" onClick={() => setSelectedContinents(new Set(CONTINENTS))}>
            reset
          </button>
        )}
      </div>
      <div className="continent-pills">
        {CONTINENTS.map((c) => (
          <button
            key={c}
            className={selectedContinents.has(c) ? "pill active" : "pill"}
            onClick={() => toggle(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({
  matches, climate, taxFilters, incomeActive, selectedCity, onSelect, totalCount,
  selectedContinents, setSelectedContinents, onHoverCity, selectedCountry, onClearCountry,
}) {
  const showIT = taxFilters.maxIncomeTax != null;
  const showCGT = taxFilters.maxCapGainsTax != null;
  const showDefaultTax = !showIT && !showCGT; // with no tax filter, show income tax as default
  const shown = matches.slice(0, SIDEBAR_LIMIT);

  return (
    <aside className="panel sidebar">
      <div className="sidebar-head">
        <h2>Best matches</h2>
        <span className="count">{matches.length} / {totalCount}</span>
      </div>

      {selectedCountry && (
        <div className="country-filter">
          <span>Showing only <b>{selectedCountry.name}</b></span>
          <button className="link-btn" onClick={onClearCountry}>clear</button>
        </div>
      )}

      <ContinentFilter selectedContinents={selectedContinents} setSelectedContinents={setSelectedContinents} />

      {matches.length === 0 && (
        <p className="empty">No cities match the current filters. Loosen a filter and Apply.</p>
      )}

      <ol className="match-list">
        {shown.map((c, i) => (
          <li
            key={c.id}
            className={selectedCity && selectedCity.id === c.id ? "match selected" : "match"}
            onClick={() => onSelect(selectedCity && selectedCity.id === c.id ? null : c)}
            onMouseEnter={() => onHoverCity(c.id)}
            onMouseLeave={() => onHoverCity(null)}
          >
            <span className="rank">{i + 1}</span>
            <div className="match-main">
              <div className="match-name">{c.name}</div>
              <div className="match-sub">{c.country} · {fmtPop(c.population)}</div>
            </div>
            <div className="match-metrics">
              {climate && <span className="chip climate">{c.qualifyingDays}d</span>}
              {incomeActive && c.netIncomePercent != null && (
                <span className="chip income">{Math.round(c.netIncomePercent)}% inc</span>
              )}
              {c.colPercent != null && <span className="chip col">{Math.round(c.colPercent)}% CoL</span>}
              {(showIT || showDefaultTax) && c.incomeTax != null && (
                <span className="chip tax">{c.incomeTax}% IT</span>
              )}
              {showCGT && c.capitalGainsTax != null && (
                <span className="chip tax">{c.capitalGainsTax}% CGT</span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {matches.length > SIDEBAR_LIMIT && (
        <p className="empty">Showing top {SIDEBAR_LIMIT}. Add filters to narrow down {matches.length} matches.</p>
      )}
    </aside>
  );
}
