import { useEffect, useRef, useState } from "react";
import { CONTINENTS } from "../continents.js";
import { CityDetailBody } from "./CityDetail.jsx";

function fmtPop(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${Math.round(n / 1e3)}k`;
}

const SIDEBAR_LIMIT = 250;

// The conventional disclosure chevron. Rotated 180° by CSS when its section is open —
// see .continent-caret / .match-caret.
function Chevron({ className }) {
  return (
    <svg
      className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

function MapPin() {
  return (
    <svg
      viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="2.8" />
    </svg>
  );
}

// `collapsible` (mobile) folds the pills away behind the heading — eight of them otherwise eat
// most of the first screenful of results.
function ContinentFilter({ selectedContinents, setSelectedContinents, collapsible = false }) {
  const [open, setOpen] = useState(false);
  const allSelected = selectedContinents.size === CONTINENTS.length;
  const pillsShown = !collapsible || open;
  const toggle = (continent) => {
    setSelectedContinents((prev) => {
      const next = new Set(prev);
      if (next.has(continent)) next.delete(continent);
      else next.add(continent);
      // Never allow an empty selection - that would just hide every city.
      return next.size === 0 ? prev : next;
    });
  };

  const heading = (
    <>
      {collapsible && <Chevron className="continent-caret" />}
      <span className="field-label">Continents</span>
      {/* Only meaningful while the pills are on screen — it describes clicking them. */}
      {allSelected && pillsShown && <span className="continent-hint">(click to deselect)</span>}
    </>
  );

  return (
    <div className={pillsShown ? "continent-filter" : "continent-filter collapsed"}>
      <div className="continent-filter-head">
        {collapsible ? (
          <button type="button" className="continent-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {heading}
          </button>
        ) : (
          <span className="continent-toggle">{heading}</span>
        )}
        {!allSelected && (
          <button className="link-btn" onClick={() => setSelectedContinents(new Set(CONTINENTS))}>
            reset
          </button>
        )}
      </div>
      {pillsShown && (
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
      )}
    </div>
  );
}

// `expandable` (mobile) turns each row into an accordion that reveals the city's full detail
// inline, since on mobile the map — and its floating detail card — live on a separate tab.
export default function Sidebar({
  matches, climate, taxFilters, incomeActive, selectedCity, onSelect, totalCount,
  selectedContinents, setSelectedContinents, onHoverCity, selectedCountry, onClearCountry,
  expandable = false, filters, currentCity, visible = true, showCount = true, onShowOnMap,
}) {
  // A tax chip appears only when you've actually filtered on that tax.
  const showIT = taxFilters.maxIncomeTax != null;
  const showCGT = taxFilters.maxCapGainsTax != null;
  const shown = matches.slice(0, SIDEBAR_LIMIT);

  // Reveal the expanded row when the selection came from elsewhere — tapping a pin on the Map
  // tab, then "See full details". `visible` is a dependency because the panel is display:none
  // while another tab is showing, and a hidden element measures as all-zero: the scroll has to
  // happen on the switch back, not when the selection changed. Only scrolls when the row isn't
  // already comfortably in view, so tapping a row you can see doesn't yank the list under your
  // finger.
  const openRowRef = useRef(null);
  const openId = selectedCity ? selectedCity.id : null;
  useEffect(() => {
    if (!expandable || !visible || openId == null) return;
    const el = openRowRef.current;
    const panel = el && el.closest(".panel");
    if (!panel) return;
    const row = el.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    if (row.top < box.top || row.top > box.bottom - 60) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [expandable, visible, openId]);

  return (
    <aside className="panel sidebar">
      <div className="sidebar-head">
        <h2>Best matches by # ideal days</h2>
        {/* Mobile hides this — the Cities tab already carries the match count. */}
        {showCount && <span className="count">{matches.length} / {totalCount}</span>}
      </div>

      {selectedCountry && (
        <div className="country-filter">
          <span>Showing only <b>{selectedCountry.name}</b></span>
          <button className="link-btn" onClick={onClearCountry}>clear</button>
        </div>
      )}

      <ContinentFilter
        selectedContinents={selectedContinents}
        setSelectedContinents={setSelectedContinents}
        collapsible={expandable}
      />

      {matches.length === 0 && (
        <p className="empty">No cities match the current filters. Loosen a filter and Apply.</p>
      )}

      <ol className="match-list">
        {shown.map((c, i) => {
          const open = !!selectedCity && selectedCity.id === c.id;
          const toggle = () => onSelect(open ? null : c);
          return (
            <li key={c.id} className={open ? "match selected" : "match"} ref={open ? openRowRef : null}>
              <div
                className="match-row"
                role="button"
                tabIndex={0}
                aria-expanded={expandable ? open : undefined}
                onClick={toggle}
                onKeyDown={(e) => {
                  // Ignore keys aimed at the nested pin button, or Enter on it would expand
                  // the row as well as jumping to the map.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
                }}
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
                  {showIT && c.incomeTax != null && (
                    <span className="chip tax">{c.incomeTax}% IT</span>
                  )}
                  {showCGT && c.capitalGainsTax != null && (
                    <span className="chip tax">{c.capitalGainsTax}% CGT</span>
                  )}
                </div>
                {expandable && (
                  <button
                    type="button"
                    className="match-pin"
                    aria-label={`Show ${c.name} on the map`}
                    onClick={(e) => { e.stopPropagation(); onShowOnMap(c); }}
                  >
                    <MapPin />
                  </button>
                )}
                {expandable && <Chevron className="match-caret" />}
              </div>

              {expandable && open && (
                <div className="match-detail">
                  <CityDetailBody city={c} filters={filters} currentCity={currentCity} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {matches.length > SIDEBAR_LIMIT && (
        <p className="empty">Showing top {SIDEBAR_LIMIT}. Add filters to narrow down {matches.length} matches.</p>
      )}
    </aside>
  );
}
