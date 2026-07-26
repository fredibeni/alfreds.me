import { useMemo, useRef, useState } from "react";
import { EMPTY_FILTERS } from "../hooks/useMatches.js";

const MIN_POP = 300000;

// Small "i" icon that reveals explanatory text on hover.
function InfoIcon({ text }) {
  return (
    <span className="info" tabIndex={0} role="img" aria-label={text}>
      i<span className="info-tip">{text}</span>
    </span>
  );
}

// A slider that supports an "Any" (unset) state at its non-constraining extreme.
// `anyAt` is the slider value that means "no constraint" -> stored as null.
function Slider({ label, hint, info, min, max, step, anyAt, value, onChange, format }) {
  const cur = value ?? anyAt;
  const isAny = value === null || value === undefined;
  return (
    <label className="field slider-field">
      <span className="field-label">
        <span className="label-text">{label}{info && <InfoIcon text={info} />}</span>
        <b className={isAny ? "val any" : "val"}>{isAny ? "Any" : format(cur)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={cur}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v === anyAt ? null : v);
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// Free-text city picker with type-ahead suggestions.
function CityAutocomplete({ cities, valueId, onChange }) {
  const selected = valueId ? cities.find((c) => c.id === valueId) : null;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef(null);

  // Show the selected city's label unless the user is actively typing.
  const shownText = focused ? text : selected ? `${selected.name}, ${selected.country}` : "";

  // Always search the full city list; rank name/prefix matches first, then by population,
  // so a smaller city isn't pushed off the list by larger ones sharing the substring.
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const c of cities) {
      const name = c.name.toLowerCase();
      let score;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (`${name} ${c.country.toLowerCase()}`.includes(q)) score = 3;
      else continue;
      scored.push([score, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || (b[1].population || 0) - (a[1].population || 0));
    return scored.slice(0, 10).map((x) => x[1]);
  }, [text, cities]);

  const pick = (c) => {
    onChange(c.id);
    setText(`${c.name}, ${c.country}`);
    setOpen(false);
  };

  return (
    <div className="autocomplete">
      <input
        type="text"
        placeholder="Type a city…"
        value={shownText}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (e.target.value.trim() === "") onChange(null);
        }}
        onFocus={() => { setFocused(true); setText(selected ? `${selected.name}, ${selected.country}` : ""); setOpen(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => { setOpen(false); setFocused(false); }, 150); }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((c, i) => (
            <li
              key={c.id}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => { e.preventDefault(); clearTimeout(blurTimer.current); pick(c); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="s-name">{c.name}</span>
              <span className="s-country">{c.country}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pctFmt = (v) => `${v}%`;
const tempFmt = (v) => `${v}°C`;
const rainFmt = (v) => `${v} mm`;
const popFmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`);

export default function FilterPanel({ draft, setDraft, onApply, onClear, cities, dirty }) {
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const needsCity =
    (draft.maxColPercent != null || draft.minNetIncomePercent != null) && !draft.currentCityId;

  return (
    <aside className="panel filters">
      <h1>Best Place</h1>
      <p className="tagline">Find where to live. All filters are optional.</p>

      <section>
        <h2>Taxes</h2>
        <Slider label="Max income tax band" min={0} max={60} step={1} anyAt={60}
          value={draft.maxIncomeTax} onChange={set("maxIncomeTax")} format={pctFmt} />
        <Slider label="Max capital gains tax band" min={0} max={55} step={1} anyAt={55}
          info="Applies to capital gains on Listed Shares & ETFs for individual investors."
          value={draft.maxCapGainsTax} onChange={set("maxCapGainsTax")} format={pctFmt} />
      </section>

      <section>
        <h2>Cost of living &amp; income</h2>
        <label className="field">
          <span className="field-label">Your current city</span>
          <CityAutocomplete
            cities={cities || []}
            valueId={draft.currentCityId}
            onChange={set("currentCityId")}
          />
        </label>
        {needsCity && (
          <p className="field-error">Select your current city to use the cost-of-living and income filters.</p>
        )}
        <Slider label="Max cost of living (% of current)" min={10} max={200} step={5} anyAt={200}
          value={draft.maxColPercent} onChange={set("maxColPercent")} format={pctFmt} />
        <Slider label="Min post-tax income (% of current)" min={0} max={300} step={5} anyAt={0}
          info="Average monthly net salary (after tax) compared with your current city. City-level where available, otherwise country-level."
          value={draft.minNetIncomePercent} onChange={set("minNetIncomePercent")} format={pctFmt} />
      </section>

      <section>
        <h2>Climate</h2>
        <p className="section-note">Define what an ideal day is like.</p>
        <Slider label="Max rainfall / day" min={0} max={50} step={1} anyAt={50}
          value={draft.maxRain} onChange={set("maxRain")} format={rainFmt} />
        <Slider label="Min daytime temp" min={-20} max={40} step={1} anyAt={-20}
          value={draft.minTemp} onChange={set("minTemp")} format={tempFmt} />
        <Slider label="Max daytime temp" min={-10} max={45} step={1} anyAt={45}
          value={draft.maxTemp} onChange={set("maxTemp")} format={tempFmt} />
      </section>

      <section>
        <h2>City population</h2>
        <Slider label="Min population" min={MIN_POP} max={40000000} step={100000} anyAt={MIN_POP}
          value={draft.minPopulation} onChange={set("minPopulation")} format={popFmt} />
        <Slider label="Max population" min={MIN_POP} max={40000000} step={100000} anyAt={40000000}
          value={draft.maxPopulation} onChange={set("maxPopulation")} format={popFmt} />
      </section>

      <div className="actions">
        <button className="btn primary" onClick={onApply} disabled={!dirty}>
          {dirty ? "Apply filters" : "Applied"}
        </button>
        <button className="btn ghost" onClick={onClear}>Clear</button>
      </div>
    </aside>
  );
}

export { MIN_POP, EMPTY_FILTERS };
