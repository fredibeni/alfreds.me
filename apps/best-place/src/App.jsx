import { useEffect, useMemo, useState } from "react";
import FilterPanel, { MIN_POP } from "./components/FilterPanel.jsx";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import CityDetail from "./components/CityDetail.jsx";
import { EMPTY_FILTERS, useMatches } from "./hooks/useMatches.js";
import { CONTINENTS } from "./continents.js";

// Normalise the draft before applying: coerce numbers, enforce the 300k population floor.
function normalizeFilters(draft) {
  const f = { ...draft };
  if (f.minPopulation != null && f.minPopulation !== "") {
    f.minPopulation = Math.max(MIN_POP, Number(f.minPopulation));
  }
  return f;
}

// Decode a base64 string into an Int8Array (grid climate arrays are stored this way).
function decodeI8(b64) {
  const bin = atob(b64);
  const arr = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) << 24 >> 24;
  return arr;
}

export default function App() {
  const [data, setData] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [grid, setGrid] = useState(null);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [selectedCity, setSelectedCity] = useState(null);
  const [hoveredCityId, setHoveredCityId] = useState(null);
  const [selectedContinents, setSelectedContinents] = useState(() => new Set(CONTINENTS));
  const [selectedCountry, setSelectedCountry] = useState(null); // { ckey, name } | null

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then((r) => r.json())
      .then((d) => {
        for (const c of d.cities) {
          c.tmax = c.tmax ? decodeI8(c.tmax) : null;
          c.precip = c.precip ? decodeI8(c.precip) : null;
          c.years = c.tmax ? Math.max(1, Math.round(c.tmax.length / 365)) : 0;
        }
        setData(d);
      })
      .catch((e) => setError(String(e)));
    fetch(`${import.meta.env.BASE_URL}world.geojson`).then((r) => r.json()).then(setGeojson).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}grid.json`)
      .then((r) => r.json())
      .then((g) => setGrid({ ...g, tmax: decodeI8(g.tmax), precip: decodeI8(g.precip) }))
      .catch(() => {});
  }, []);

  const cities = data?.cities;
  const { rows, matches: allMatches, currentCity, climate } = useMatches(cities, applied);

  const continentsActive = selectedContinents.size < CONTINENTS.length;
  const continentMatches = useMemo(
    () => (continentsActive ? allMatches.filter((c) => selectedContinents.has(c.continent)) : allMatches),
    [allMatches, continentsActive, selectedContinents]
  );
  const matches = useMemo(
    () => (selectedCountry ? continentMatches.filter((c) => c.ckey === selectedCountry.ckey) : continentMatches),
    [continentMatches, selectedCountry]
  );

  // Keep the selected city object in sync with recomputed rows.
  const selected = useMemo(
    () => (selectedCity ? rows.find((r) => r.id === selectedCity.id) || selectedCity : null),
    [selectedCity, rows]
  );

  const dirty = useMemo(
    () => JSON.stringify(normalizeFilters(draft)) !== JSON.stringify(applied),
    [draft, applied]
  );

  const onApply = () => setApplied(normalizeFilters(draft));
  const onClear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  const taxFilters = {
    maxIncomeTax: applied.maxIncomeTax != null && applied.maxIncomeTax !== "" ? Number(applied.maxIncomeTax) : null,
    maxCapGainsTax: applied.maxCapGainsTax != null && applied.maxCapGainsTax !== "" ? Number(applied.maxCapGainsTax) : null,
  };
  const taxActive = taxFilters.maxIncomeTax != null || taxFilters.maxCapGainsTax != null;
  const incomeActive = applied.minNetIncomePercent != null && applied.minNetIncomePercent !== "";
  const appliedVersion = useMemo(() => JSON.stringify(applied), [applied]);

  if (error) return <div className="loading">Failed to load data: {error}</div>;
  if (!data) return <div className="loading">Loading cities…</div>;

  return (
    <div className="layout">
      <FilterPanel
        draft={draft}
        setDraft={setDraft}
        onApply={onApply}
        onClear={onClear}
        cities={cities}
        dirty={dirty}
      />

      <main className="map-wrap">
        <MapView
          geojson={geojson}
          grid={grid}
          appliedClimate={{
            maxRain: applied.maxRain, minTemp: applied.minTemp, maxTemp: applied.maxTemp,
          }}
          matches={matches}
          climate={climate}
          taxFilters={taxFilters}
          taxActive={taxActive}
          selectedContinents={selectedContinents}
          continentsActive={continentsActive}
          appliedVersion={appliedVersion}
          selectedCity={selected}
          onSelect={setSelectedCity}
          hoveredCityId={hoveredCityId}
          selectedCountry={selectedCountry}
          onSelectCountry={setSelectedCountry}
        />
        {selected && (
          <CityDetail
            city={selected}
            filters={applied}
            currentCity={currentCity}
            climate={climate}
            onClose={() => setSelectedCity(null)}
          />
        )}
        <div className="legend">
          <span className="legend-title">
            Climate heatmap
            {!climate && (
              <>
                <br />
                <span>(climate filter not set)</span>
              </>
            )}
          </span>
          <div className="legend-bar" />
          <div className="legend-labels"><span>fewer days</span><span>more days</span></div>
          <div className="legend-hint">days/year meeting climate filters</div>
        </div>
      </main>

      <Sidebar
        matches={matches}
        climate={climate}
        taxFilters={taxFilters}
        incomeActive={incomeActive}
        selectedCity={selected}
        onSelect={setSelectedCity}
        totalCount={cities.length}
        selectedContinents={selectedContinents}
        setSelectedContinents={setSelectedContinents}
        onHoverCity={setHoveredCityId}
        selectedCountry={selectedCountry}
        onClearCountry={() => setSelectedCountry(null)}
      />
    </div>
  );
}
