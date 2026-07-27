import { useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import FilterPanel, { MIN_POP } from "./components/FilterPanel.jsx";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import CityDetail from "./components/CityDetail.jsx";
import { BackHome, TITLE, TAGLINE } from "./components/AppHeader.jsx";
import { EMPTY_FILTERS, useMatches } from "./hooks/useMatches.js";
import useIsMobile from "./hooks/useIsMobile.js";
import { CONTINENTS } from "./continents.js";

const TABS = [
  { id: "filters", label: "Filters" },
  { id: "cities", label: "Cities" },
  { id: "map", label: "Map" },
];

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
  const isMobile = useIsMobile();

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
  const [tab, setTab] = useState("filters");

  // The map's two heavy assets (grid.json ~17 MB, world.geojson ~3 MB) are only ever used by
  // MapView, so on mobile they wait until the Map tab is first opened. That keeps the initial
  // mobile payload to data.json alone, and the Filters/Cities tabs are usable straight away.
  const mapNeeded = !isMobile || tab === "map";

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
  }, []);

  const mapAssetsRequested = useRef(false);
  useEffect(() => {
    if (!mapNeeded || mapAssetsRequested.current) return;
    mapAssetsRequested.current = true;
    fetch(`${import.meta.env.BASE_URL}world.geojson`).then((r) => r.json()).then(setGeojson).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}grid.json`)
      .then((r) => r.json())
      .then((g) => setGrid({ ...g, tmax: decodeI8(g.tmax), precip: decodeI8(g.precip) }))
      .catch(() => {});
  }, [mapNeeded]);

  // Once the Map tab has been opened, keep it mounted (hidden) so Leaflet doesn't re-initialise
  // — and so the user's pan/zoom survives tab switches.
  const [mapMounted, setMapMounted] = useState(!isMobile);
  useEffect(() => {
    if (mapNeeded) setMapMounted(true);
  }, [mapNeeded]);

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

  const onApply = () => {
    // On mobile the button stays live even when nothing changed (it doubles as "show me the
    // results"), so skip the state write in that case — it would re-run the whole match
    // computation over every city for an identical result.
    if (dirty) setApplied(normalizeFilters(draft));
    // On mobile the results live on their own tab, so applying takes you straight there.
    if (isMobile) setTab("cities");
  };
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

  const filterPanel = (
    <FilterPanel
      draft={draft}
      setDraft={setDraft}
      onApply={onApply}
      onClear={onClear}
      cities={cities}
      dirty={dirty}
      showHeader={!isMobile}
      mobile={isMobile}
    />
  );

  const citiesPanel = (
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
      expandable={isMobile}
      filters={applied}
      currentCity={currentCity}
      visible={!isMobile || tab === "cities"}
      showCount={!isMobile}
      onShowOnMap={(c) => { setSelectedCity(c); setTab("map"); }}
    />
  );

  const mapPanel = (
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
        active={!isMobile || tab === "map"}
      />
      {selected && (
        <CityDetail
          city={selected}
          filters={applied}
          currentCity={currentCity}
          climate={climate}
          onClose={() => setSelectedCity(null)}
          compact={isMobile}
          onExpand={() => setTab("cities")}
        />
      )}
      {!geojson && <div className="map-toast neutral">Loading map…</div>}
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
  );

  if (isMobile) {
    return (
      <>
        <div className="mobile-shell">
          <header className="mobile-head">
            <BackHome short />
            <div className="mobile-title">
              <h1>{TITLE}</h1>
              <p className="tagline">{TAGLINE}</p>
            </div>
          </header>

          <nav className="tabs" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                aria-selected={tab === t.id}
                className="tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "cities" && <span className="tab-count">{matches.length}</span>}
              </button>
            ))}
          </nav>

          <div className="tab-panels">
            <section
              className="tab-panel" role="tabpanel" id="panel-filters"
              aria-labelledby="tab-filters" hidden={tab !== "filters"}
            >
              {filterPanel}
            </section>
            <section
              className="tab-panel" role="tabpanel" id="panel-cities"
              aria-labelledby="tab-cities" hidden={tab !== "cities"}
            >
              {citiesPanel}
            </section>
            <section
              className="tab-panel" role="tabpanel" id="panel-map"
              aria-labelledby="tab-map" hidden={tab !== "map"}
            >
              {mapMounted && mapPanel}
            </section>
          </div>
        </div>
        <Analytics />
        <SpeedInsights />
      </>
    );
  }

  return (
    <>
      <div className="layout">
        {filterPanel}
        {mapPanel}
        {citiesPanel}
      </div>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
