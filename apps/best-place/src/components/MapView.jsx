import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { buildTempCdf, daysInRange } from "../climate.js";

const WATER = "#000000";  // black ocean (map background)
const LAND = "#223247";   // land base tint (shown where no climate grid covers)
const DEFAULT_CENTER = [25, 10];
const DEFAULT_ZOOM = 2;

// ---- Heat gradient: viridis (few qualifying days -> many) ----------------------------
// A perceptually-uniform, colour-blind-safe sequential map. Chosen over a single-hue
// white->green ramp because that only varied lightness, which the eye discriminates poorly
// - climatically-similar regions read as one flat colour. Viridis sweeps hue (purple ->
// blue -> teal -> green -> yellow), so equal value steps produce clearly distinct colours.
const STOPS = [
  [0.0, [68, 1, 84]],
  [0.1, [72, 40, 120]],
  [0.2, [62, 74, 137]],
  [0.3, [49, 104, 142]],
  [0.4, [38, 130, 142]],
  [0.5, [31, 158, 137]],
  [0.6, [53, 183, 121]],
  [0.7, [110, 206, 88]],
  [0.8, [181, 222, 43]],
  [0.9, [253, 231, 37]],
];
function viridisRgb(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
// Precompute a 256-entry palette of rgb() strings once, so the innermost draw loop (up to
// SUB*SUB fills per cell) is a plain table lookup instead of a per-fill palette scan + array
// and string allocation.
const PALETTE = Array.from({ length: 256 }, (_, i) => {
  const [r, g, b] = viridisRgb(i / 255);
  return `rgb(${r},${g},${b})`;
});
const heatColor = (t) => PALETTE[t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0];

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

function countryFailsTax(income, capgains, taxFilters) {
  if (taxFilters.maxIncomeTax != null && (income == null || income > taxFilters.maxIncomeTax)) return true;
  if (taxFilters.maxCapGainsTax != null && (capgains == null || capgains > taxFilters.maxCapGainsTax)) return true;
  return false;
}

// ---- Fine-grained climate grid, drawn on a canvas overlay ---------------------------
function GridHeatLayer({
  grid, cellDays, taxActive, taxFilters, geojson,
  continentsActive, selectedContinents, ckeyToContinent,
}) {
  const map = useMap();

  useEffect(() => {
    // cellDays is already null unless the parent has both grid and a climate filter.
    if (!grid || !cellDays) return undefined;

    const pane = map.getPane("gridHeat") || map.createPane("gridHeat");
    pane.style.zIndex = 250;
    pane.style.pointerEvents = "none";
    const canvas = L.DomUtil.create("canvas", "grid-heat-canvas", pane);
    canvas.style.opacity = "0.72"; // layer-level transparency (avoids overlap darkening)
    const ctx = canvas.getContext("2d");
    const { cells, res, countryTax } = grid;

    // Which cells are hidden by the current tax / continent filters. Constant across the many
    // pan/zoom redraws (it depends only on the effect's filter deps), so resolve it once into a
    // flat array the hot loops can index, rather than re-deriving it per cell on every draw.
    const excludedCell = new Uint8Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      const ckey = cells[i].ckey;
      let ex = false;
      if (taxActive) {
        const t = countryTax[ckey] || {};
        if (countryFailsTax(t.incomeTax ?? null, t.capitalGainsTax ?? null, taxFilters)) ex = true;
      }
      if (!ex && continentsActive && !selectedContinents.has(ckeyToContinent.get(ckey))) ex = true;
      excludedCell[i] = ex ? 1 : 0;
    }

    // Colour by percentile rank rather than a fixed value/365: qualifying-day counts cluster
    // tightly within any one region (most of temperate Europe sits in a narrow band of the
    // 0-365 domain), so a fixed scale paints that whole region nearly one flat colour.
    //
    // The rank is computed over just the cells CURRENTLY ON SCREEN (rebuilt every draw, so it
    // re-scales on pan/zoom and whenever the climate filter changes). Ranking globally instead
    // collapses to one colour again the moment the visible region all sits at one end of the
    // world distribution - e.g. lowering the max-temp filter pushes all of temperate Europe to
    // the global top at once. Local ranking always spreads whatever variation is actually in
    // view across the full palette. Trade-off: a given cell's colour is relative to the current
    // view, not an absolute day-count (the legend reads "fewer/more days" accordingly).
    const allDays = []; // fallback when too few cells are visible to rank meaningfully
    for (let i = 0; i < cells.length; i++) if (!excludedCell[i]) allDays.push(cellDays[i]);
    allDays.sort((a, b) => a - b);

    function searchRank(sorted, v) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
      return sorted.length ? lo / sorted.length : 0.5;
    }
    let rankOf = () => 0.5; // reassigned each draw to rank over the currently-visible cells

    // Index cells by integer lattice position (all cells sit on integer lat/lon multiples of
    // res) so neighbour lookups on the hot path are integer-keyed, with no per-lookup toFixed()
    // string allocation.
    const ikey = (lat, lon) => Math.round(lat / res) * 100000 + Math.round(lon / res);
    const byCorner = new Map();
    for (let i = 0; i < cells.length; i++) byCorner.set(ikey(cells[i].lat, cells[i].lon), i);
    // Value of a neighbour cell, or null when missing / filtered out.
    const valAt = (lat, lon) => {
      const j = byCorner.get(ikey(lat, lon));
      if (j === undefined || excludedCell[j]) return null;
      return rankOf(cellDays[j]);
    };

    // Precompute one entry per land polygon with its lon/lat bounding box (once, not per
    // redraw). The detailed 10m world outline has a huge number of coastline vertices;
    // re-projecting all of them on every zoom/pan was the main source of lag. With the bboxes
    // cached, each redraw skips every polygon that's entirely off-screen and only projects the
    // land actually in view.
    const landPolys = [];
    if (geojson) {
      for (const f of geojson.features) {
        const g = f.geometry;
        if (!g) continue;
        const list = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        for (const rings of list) {
          const outer = rings[0];
          let minX = 180, minY = 90, maxX = -180, maxY = -90;
          for (let k = 0; k < outer.length; k++) {
            const x = outer[k][0], y = outer[k][1];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
          landPolys.push({ rings, minX, minY, maxX, maxY });
        }
      }
    }

    // Build a canvas clip path from the on-screen land polygons so nothing paints over the ocean.
    const clipToLand = (south, north, west, east) => {
      ctx.beginPath();
      const addRing = (ring) => {
        for (let k = 0; k < ring.length; k++) {
          const p = map.latLngToContainerPoint([ring[k][1], ring[k][0]]);
          if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };
      for (const poly of landPolys) {
        if (poly.maxY < south || poly.minY > north) continue;
        if (poly.maxX < west || poly.minX > east) continue;
        poly.rings.forEach(addRing);
      }
      ctx.clip();
    };

    const draw = () => {
      const size = map.getSize();
      // Back the canvas above CSS resolution, but capped. Sized at 1x it was upscaled by the
      // browser, and upscaling interpolates alpha as well as colour, so every one-pixel seam
      // became a three-pixel dark line on a 3x phone. Going to the full ratio fixed that but
      // squares the fill cost — 9x the work per redraw on the same phone, on every pan and
      // zoom. Two is the sweet spot: still twice the density that produced the artifact, at
      // less than half the pixels of a full 3x buffer. The layer is a soft 72%-opacity
      // gradient, so the last of the sharpness is not worth the frame time.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size.x * dpr);
      canvas.height = Math.round(size.y * dpr);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // keep drawing in CSS pixels
      ctx.clearRect(0, 0, size.x, size.y);
      const W = size.x, H = size.y;
      // Snap a CSS-pixel coordinate onto the device-pixel grid, so neighbouring fills share an
      // exact edge: no gap for the land base to show through, and no double-drawn seam.
      const snap = (v) => Math.round(v * dpr) / dpr;

      // Re-rank against the cells NEAR the current view so the full colour range always maps to
      // the variation actually on screen (see the rankOf comment above). The window starts at
      // the viewport and widens outward until it holds enough cells to rank against - crucially
      // it does NOT fall back to the GLOBAL spread when few cells are in view: a deep zoom (e.g.
      // a mostly-ocean coast, where <12 land-cell centres are on screen) then sits entirely at
      // one end of the world distribution and collapses to a single flat colour. Widening the
      // local window keeps the palette mapped to the regional variation at every zoom level.
      // worldCopyJump can widen the bounds past a full turn; treating that as "no longitude
      // limit" (±Infinity) lets every lon cull below stay a plain range test with no guard.
      const b = map.getBounds();
      const south = b.getSouth(), north = b.getNorth();
      let west = b.getWest(), east = b.getEast();
      if (east - west >= 359) { west = -Infinity; east = Infinity; }
      let src = [], pad = 0;
      do {
        src = [];
        const s = south - pad, n = north + pad, w = west - pad, e = east + pad;
        for (let i = 0; i < cells.length; i++) {
          if (excludedCell[i]) continue;
          const clat = cells[i].lat + res / 2, clon = cells[i].lon + res / 2;
          if (clat < s || clat > n || clon < w || clon > e) continue;
          src.push(cellDays[i]);
        }
        pad += res * 4;
      } while (src.length < 12 && pad <= 64);
      // Sort for percentile lookup; only if even a wide window found nothing (all excluded
      // nearby) fall back to the global spread.
      src = src.length ? src.sort((a, b2) => a - b2) : allDays;
      rankOf = (v) => searchRank(src, v);

      // Pixel size of one cell at the current zoom, to choose how finely to sub-sample the
      // bilinear gradient: fine enough that sub-squares are only a few pixels (smooth) when
      // cells are large on screen, coarse when they're tiny.
      const cellPx = Math.abs(
        map.latLngToContainerPoint([0, res]).x - map.latLngToContainerPoint([0, 0]).x
      );
      // Sub-squares every ~8 CSS px rather than ~4, capped at 12 a side rather than 24. That is
      // up to 144 fills per cell instead of 576 — a 4x cut in draw calls for a gradient that is
      // interpolated and then shown at 72% opacity, where the extra sampling is not visible.
      const SUB = Math.max(2, Math.min(12, Math.ceil(cellPx / 8)));

      ctx.save();
      clipToLand(south, north, west, east); // confine fills to on-screen land
      // Fills are opaque (overlaps overwrite instead of stacking); the canvas element's
      // CSS opacity provides the see-through effect uniformly.
      for (let i = 0; i < cells.length; i++) {
        if (excludedCell[i]) continue;
        const c = cells[i];
        // Cheap lat/lon cull before the (costlier) projection: skip cells whose square is well
        // outside the view. The exact pixel cull below still trims the boundary precisely.
        if (c.lat > north + res || c.lat + res < south - res) continue;
        if (c.lon > east + res || c.lon + res < west - res) continue;
        const p1 = map.latLngToContainerPoint([c.lat, c.lon]);
        const p2 = map.latLngToContainerPoint([c.lat + res, c.lon + res]);
        const x0 = Math.min(p1.x, p2.x), y0 = Math.min(p1.y, p2.y);
        const cw = Math.abs(p2.x - p1.x), ch = Math.abs(p2.y - p1.y);
        if (x0 + cw < 0 || y0 + ch < 0 || x0 > W || y0 > H) continue; // off-screen

        // Corner values for bilinear interpolation (fall back to this cell where a
        // neighbour is missing, so colour transitions stay smooth).
        const v00 = rankOf(cellDays[i]);
        const vE = valAt(c.lat, c.lon + res) ?? v00;             // east
        const vN = valAt(c.lat + res, c.lon) ?? v00;             // north
        const vNE = valAt(c.lat + res, c.lon + res) ?? ((vE + vN) / 2); // north-east
        const sw = cw / SUB, sh = ch / SUB;
        for (let sy = 0; sy < SUB; sy++) {
          const fy = (sy + 0.5) / SUB; // 0 south, 1 north
          // screen y increases downward while fy increases northward -> north is smaller y
          const yA = snap(y0 + (SUB - 1 - sy) * sh);
          const yB = snap(y0 + (SUB - sy) * sh);
          for (let sx = 0; sx < SUB; sx++) {
            const fx = (sx + 0.5) / SUB; // 0 west, 1 east
            const top = v00 + (vE - v00) * fx;      // south edge
            const bot = vN + (vNE - vN) * fx;       // north edge
            const v = top + (bot - top) * fy;
            ctx.fillStyle = heatColor(v);
            // Both edges are snapped to the device-pixel grid, so this rect ends exactly where
            // its neighbour begins — including across cell boundaries, since adjacent cells
            // project to the same shared edge before snapping.
            const xA = snap(x0 + sx * sw);
            const xB = snap(x0 + (sx + 1) * sw);
            ctx.fillRect(xA, yA, xB - xA, yB - yA);
          }
        }
      }
      ctx.restore();
    };

    // Redraw on the next frame rather than inside the event handler. Drawing synchronously meant
    // a pan's moveend blocked whatever the user did next — pan, then immediately pinch, and the
    // zoom waited on a full repaint before it was even handled. Coalescing also collapses a
    // burst of events (moveend + zoomend + viewreset arrive together) into a single repaint.
    let rafId = null;
    const scheduleDraw = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => { rafId = null; draw(); });
    };

    draw();
    map.on("moveend zoomend resize viewreset", scheduleDraw);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      map.off("moveend zoomend resize viewreset", scheduleDraw);
      L.DomUtil.remove(canvas);
    };
  }, [
    map, grid, cellDays, taxActive, taxFilters.maxIncomeTax, taxFilters.maxCapGainsTax, geojson,
    continentsActive, selectedContinents, ckeyToContinent,
  ]);

  return null;
}

// A Leaflet control (stacks below the zoom buttons in the same top-left corner) that
// resets the view back to the initial center/zoom.
function ResetViewControl() {
  const map = useMap();
  useEffect(() => {
    const ResetControl = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const link = L.DomUtil.create("a", "", container);
        link.href = "#";
        link.title = "Reset view";
        link.setAttribute("aria-label", "Reset view");
        link.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">' +
          '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>';
        L.DomEvent.on(link, "click", (e) => {
          L.DomEvent.stop(e);
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
        });
        return container;
      },
    });
    const control = new ResetControl();
    control.addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}

// On mobile the map lives in a tab panel that is display:none while another tab is showing,
// so Leaflet measures a 0x0 container. Re-measure once the panel is visible again (the
// resulting `resize` event is also what makes the climate-grid canvas repaint at the right
// size). rAF so the browser has actually laid the panel out before we measure.
function InvalidateOnShow({ active }) {
  const map = useMap();
  useEffect(() => {
    if (!active) return undefined;
    const id = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    return () => cancelAnimationFrame(id);
  }, [active, map]);
  return null;
}

function FlyTo({ city }) {
  const map = useMap();
  useEffect(() => {
    // setView (animated pan/zoom) drives the same pane-translate + zoomanim hooks the grid
    // canvas tracks; flyTo's custom animation loop bypasses them and leaves the heatmap behind.
    if (city) map.setView([city.lat, city.lon], Math.max(map.getZoom(), 5), { animate: true, duration: 0.6 });
  }, [city, map]);
  return null;
}

export default function MapView({
  geojson,
  grid,
  appliedClimate,
  matches,
  climate,
  taxFilters,
  taxActive,
  selectedContinents,
  continentsActive,
  appliedVersion,
  selectedCity,
  onSelect,
  hoveredCityId,
  selectedCountry,
  onSelectCountry,
  active = true,
}) {
  const [hoveredCkey, setHoveredCkey] = useState(null);
  // A one-shot id (not just a boolean) so repeated clicks on ineligible countries each
  // restart the auto-hide timer, even while the message is already showing.
  const [ineligibleMsgId, setIneligibleMsgId] = useState(null);

  useEffect(() => {
    if (ineligibleMsgId == null) return undefined;
    const t = setTimeout(() => setIneligibleMsgId(null), 2200);
    return () => clearTimeout(t);
  }, [ineligibleMsgId]);

  // ckey -> continent, derived once per geojson load so both the country layer and the
  // grid heat canvas can grey out continents the user has deselected.
  const ckeyToContinent = useMemo(() => {
    const m = new Map();
    if (geojson) for (const f of geojson.features) m.set(f.properties.ckey, f.properties.continent);
    return m;
  }, [geojson]);

  // Collapsing the rain axis is the expensive half, and it only depends on maxRain — so it is
  // memoised apart from the temperature sliders, which then cost two array reads per cell.
  const tempCdf = useMemo(
    () => (grid && climate ? buildTempCdf(grid.packed, grid.cells.length, num(appliedClimate.maxRain)) : null),
    [grid, climate, appliedClimate.maxRain]
  );

  // Per-cell qualifying-day counts for the applied climate thresholds.
  const cellDays = useMemo(() => {
    if (!grid || !tempCdf) return null;
    const minTemp = num(appliedClimate.minTemp);
    const maxTemp = num(appliedClimate.maxTemp);
    const years = Math.max(1, Math.round(grid.days / 365));
    const out = new Int16Array(grid.cells.length);
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.round(daysInRange(tempCdf, i, minTemp, maxTemp) / years); // days per year
    }
    return out;
  }, [grid, tempCdf, appliedClimate.minTemp, appliedClimate.maxTemp]);

  // NOTE: the country layer used to be keyed on `${appliedVersion}|${climate}` to force a
  // restyle, which remounted all 258 detailed coastline polygons on every Apply (measured ~1s
  // of frozen UI). react-leaflet already calls setStyle() whenever the `style` prop identity
  // changes, and styleFn is a fresh closure every render, so the remount bought nothing.

  // Fully declarative: border colour reflects selection/hover state directly (rather than
  // mutating layers imperatively), so it can never be clobbered by react-leaflet re-applying
  // this same style prop on the next render (that was the cause of a highlight-doesn't-show-
  // until-you-re-hover bug: a click triggers a re-render, and any imperative style set at
  // click time was immediately overwritten by that re-render's own style pass).
  const styleFn = (feature) => {
    const p = feature.properties;
    const failsTax = taxActive && countryFailsTax(p.incomeTax, p.capitalGainsTax, taxFilters);
    const failsContinent = continentsActive && !selectedContinents.has(p.continent);
    const excluded = failsTax || failsContinent;
    const isSelected = selectedCountry && selectedCountry.ckey === p.ckey;
    const isHovered = hoveredCkey === p.ckey;

    // Fully opaque when excluded so no climate-grid cell shows through; otherwise the land
    // base + climate grid show through and we keep just a thin border.
    const base = excluded ? { fillColor: "#3f3f3f", fillOpacity: 1 } : { fillColor: "#8fb3c9", fillOpacity: 0 };
    if (isSelected) return { ...base, color: "#3aa0ff", weight: 2.5 };
    if (isHovered) return { ...base, color: "#ffffff", weight: 2.5 };
    return { ...base, color: excluded ? "#4a5a68" : "#3a4a5a", weight: excluded ? 0.5 : 0.6 };
  };

  return (
    <>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={2}
        worldCopyJump
        /* Draw vectors into a canvas rather than as SVG nodes. The 1753 city markers plus 258
           country polygons are 2271 SVG elements that Leaflet re-projects and rewrites on every
           pan and zoom; that cost a measured 743 ms per zoom, and Safari — including every iOS
           browser — is far slower at it than Chrome, which is why the map dragged worst there. */
        preferCanvas
        zoomAnimation={false} /* the heatmap is a custom canvas that can't transform in perfect
                                 lockstep with the SVG borders mid-animation (it visibly lagged);
                                 with animation off, borders + heatmap re-render together in one
                                 frame - kept snappy by the off-screen culling in the draw above */
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: WATER }}
      >
        <ResetViewControl />
        <InvalidateOnShow active={active} />
        <MapLayers
          geojson={geojson}
          grid={grid}
          cellDays={cellDays}
          climate={climate}
          taxActive={taxActive}
          taxFilters={taxFilters}
          continentsActive={continentsActive}
          selectedContinents={selectedContinents}
          ckeyToContinent={ckeyToContinent}
          styleFn={styleFn}
          matches={matches}
          selectedCity={selectedCity}
          onSelect={onSelect}
          hoveredCityId={hoveredCityId}
          selectedCountry={selectedCountry}
          onSelectCountry={onSelectCountry}
          hoveredCkey={hoveredCkey}
          onHoverCountry={setHoveredCkey}
          onIneligibleClick={() => setIneligibleMsgId(Date.now())}
        />
      </MapContainer>

      {ineligibleMsgId != null && (
        <div className="map-toast">Only eligible countries can be further filtered for</div>
      )}
    </>
  );
}

// Inner content: creates rendering panes (so the climate grid sits between the land base
// and the country borders/greying), then draws the layers.
function MapLayers({
  geojson, grid, cellDays, climate, taxActive, taxFilters, continentsActive, selectedContinents, ckeyToContinent,
  styleFn, matches, selectedCity, onSelect, hoveredCityId, selectedCountry, onSelectCountry,
  hoveredCkey, onHoverCountry, onIneligibleClick,
}) {
  const map = useMap();
  const [ready, setReady] = useState(false);
  const markerRefs = useRef(new Map());
  const countryLayerRef = useRef(null); // the whole country group, for draw-order control
  // Track the one pin tooltip that should be open. In a dense cluster of overlapping pins,
  // fast mouse movement can make the browser skip a mouseout (the element never actually
  // moves out from under the cursor, it just gets covered/uncovered by a neighbour), which
  // leaves stray tooltips stuck open. Closing whatever was previously tracked on every new
  // mouseover is self-correcting regardless of whether the earlier mouseout ever fired.
  const openTooltipRef = useRef(null);

  // onEachFeature below binds its click handler once per GeoJSON mount (tied to geoKey), so
  // reading these props directly inside it would go stale whenever something changes without
  // remounting the layer (e.g. toggling a continent pill doesn't touch geoKey). Mutating a ref
  // in the render body keeps the handler reading always-current values without re-binding.
  const latestRef = useRef(null);
  latestRef.current = { taxActive, taxFilters, continentsActive, selectedContinents, selectedCountry };

  useEffect(() => {
    for (const [name, z] of [["landBase", 230], ["gridHeat", 250]]) {
      const p = map.getPane(name) || map.createPane(name);
      p.style.zIndex = String(z);
      p.style.pointerEvents = "none";
    }
    setReady(true);
  }, [map]);

  // Pop the hovered pin above any overlapping neighbours.
  useEffect(() => {
    if (hoveredCityId == null) return;
    markerRefs.current.get(hoveredCityId)?.bringToFront();
  }, [hoveredCityId]);

  // Safety nets for missed native mouseout events on a pin (the mouseover/mouseout
  // self-correction in the pins below only fires when the cursor lands on ANOTHER pin):
  // 1) moving to empty map space (still inside the map, over no interactive layer) fires
  //    neither a pin event nor a map-leave event, so validate on every mousemove instead -
  //    if the tracked tooltip's own element isn't what's actually under the cursor, it's
  //    stale and gets closed.
  // 2) moving off the map entirely stops mousemove from firing on it at all, so also close
  //    on the map's own mouseout.
  useEffect(() => {
    const close = () => {
      openTooltipRef.current?.closeTooltip();
      openTooltipRef.current = null;
    };
    const onMapMouseMove = (e) => {
      if (!openTooltipRef.current) return;
      const el = openTooltipRef.current.getElement?.();
      // Canvas-rendered layers have no element of their own. There Leaflet hit-tests the
      // pointer itself on every mousemove and fires a reliable mouseout, so this net is not
      // needed — and without the guard it would close every tooltip the instant it opened.
      if (!el) return;
      const under = document.elementFromPoint(e.originalEvent.clientX, e.originalEvent.clientY);
      if (under === el) return;
      close();
    };
    map.on("mousemove", onMapMouseMove);
    map.on("mouseout", close);
    return () => {
      map.off("mousemove", onMapMouseMove);
      map.off("mouseout", close);
    };
  }, [map]);

  // Countries and city pins share one canvas renderer, and there draw order IS hit-test order:
  // Leaflet walks the draw chain and keeps the LAST layer containing the point. So the country
  // polygons have to stay behind the pins, or a pin's own country answers the hover and click
  // instead of the pin.
  //
  // Two things used to break that. Countries were promoted with bringToFront() on hover and on
  // selection, which parks them above every pin — that is why hovering a pin showed the country
  // name. And the layers can mount in either order: cities.json is far smaller than the world
  // outline, so the pins usually exist before the country layer is added, leaving countries last
  // by default. Sending the country group to the back once it mounts fixes both, in one call per
  // country rather than one per pin.
  //
  // The cost is that a hovered country's border is no longer lifted above its neighbours'. Its
  // highlight is still drawn from styleFn (white, 2.5px against 0.6px), so only shared edges can
  // be partly overdrawn.
  useEffect(() => {
    countryLayerRef.current?.bringToBack();
  }, [geojson]);

  // If the selected country stops being eligible (tax/continent filters changed under it),
  // drop the country filter rather than leave the sidebar silently stuck on it.
  useEffect(() => {
    if (!selectedCountry || !geojson) return;
    const feature = geojson.features.find((f) => f.properties.ckey === selectedCountry.ckey);
    const p = feature?.properties;
    const failsTax = p && taxActive && countryFailsTax(p.incomeTax, p.capitalGainsTax, taxFilters);
    const failsContinent = p && continentsActive && !selectedContinents.has(p.continent);
    if (!p || failsTax || failsContinent) onSelectCountry(null);
  }, [
    selectedCountry, geojson, taxActive, taxFilters.maxIncomeTax, taxFilters.maxCapGainsTax,
    continentsActive, selectedContinents, onSelectCountry,
  ]);

  if (!ready) return null;

  return (
    <>
      {geojson && (
        <GeoJSON
          key="land-base"
          data={geojson}
          pane="landBase"
          interactive={false}
          style={() => ({ fillColor: LAND, fillOpacity: 1, stroke: false })}
        />
      )}

      <GridHeatLayer
        grid={grid}
        cellDays={cellDays}
        climate={climate}
        taxActive={taxActive}
        taxFilters={taxFilters}
        continentsActive={continentsActive}
        selectedContinents={selectedContinents}
        ckeyToContinent={ckeyToContinent}
        geojson={geojson}
      />

      {geojson && (
        <GeoJSON
          key="countries"
          ref={countryLayerRef}
          data={geojson}
          style={styleFn}
          onEachFeature={(feature, layer) => {
            const p = feature.properties;
            const inc = p.incomeTax == null ? "n/a" : `${p.incomeTax}%`;
            const cg = p.capitalGainsTax == null ? "n/a" : `${p.capitalGainsTax}%`;
            layer.bindTooltip(`${p.name} — income ${inc}, cap. gains ${cg}`, { sticky: true });
            layer.on("mouseover", (e) => {
              onHoverCountry(p.ckey);
              // Same stuck-tooltip fix as the city pins below: force-close whatever tooltip
              // was previously tracked (city pin or another country), even if its own
              // mouseout never fired - a densely packed cluster of small countries (e.g. the
              // Balkans) hits the exact same missed-mouseout issue as overlapping pins.
              if (openTooltipRef.current && openTooltipRef.current !== e.target) {
                openTooltipRef.current.closeTooltip();
              }
              openTooltipRef.current = e.target;
              e.target.openTooltip();
            });
            layer.on("mouseout", (e) => {
              onHoverCountry(null);
              e.target.closeTooltip();
              if (openTooltipRef.current === e.target) openTooltipRef.current = null;
            });
            layer.on("click", () => {
              const { taxActive, taxFilters, continentsActive, selectedContinents, selectedCountry } = latestRef.current;
              // Only an "eligible" country (passing the current tax/continent filters, i.e.
              // not greyed out) can be clicked to filter the sidebar down to its cities.
              const failsTax = taxActive && countryFailsTax(p.incomeTax, p.capitalGainsTax, taxFilters);
              const failsContinent = continentsActive && !selectedContinents.has(p.continent);
              if (failsTax || failsContinent) {
                onIneligibleClick();
                return;
              }
              // Clicking the already-selected country again clears the filter.
              const isSelected = selectedCountry && selectedCountry.ckey === p.ckey;
              onSelectCountry(isSelected ? null : { ckey: p.ckey, name: p.name });
            });
          }}
        />
      )}

      {matches.map((c) => {
        const selected = selectedCity && selectedCity.id === c.id;
        const hovered = hoveredCityId === c.id;
        const label = `${c.name}${climate ? ` · ${c.qualifyingDays}d` : ""}`;
        return (
          <CircleMarker
            key={c.id}
            ref={(el) => {
              if (el) markerRefs.current.set(c.id, el);
              else markerRefs.current.delete(c.id);
            }}
            center={[c.lat, c.lon]}
            radius={selected ? 9 : hovered ? 8 : 5}
            /* Deliberately NOT pane="markerPane". Under the canvas renderer each pane gets its
               own canvas, and a marker canvas sitting above the country canvas would receive
               every mouse event and stop countries being hoverable or clickable. Sharing the
               default overlay pane puts markers and countries in one renderer, which hit-tests
               them together; markers still draw on top because they are added later. */
            pathOptions={{
              color: selected || hovered ? "#3aa0ff" : "#ffffff",
              weight: selected || hovered ? 2 : 1,
              fillColor: selected ? "#3aa0ff" : "#ffb400",
              fillOpacity: 0.95,
            }}
            eventHandlers={{
              // Bind tooltip content imperatively (lighter than a Tooltip component per pin);
              // Leaflet only builds the tooltip DOM on hover.
              add: (e) => e.target.bindTooltip(label, { direction: "top" }),
              mouseover: (e) => {
                // Force-close whatever was previously tracked, even if its own mouseout
                // never fired (see openTooltipRef comment above) - self-correcting.
                if (openTooltipRef.current && openTooltipRef.current !== e.target) {
                  openTooltipRef.current.closeTooltip();
                }
                openTooltipRef.current = e.target;
                e.target.openTooltip();
              },
              mouseout: (e) => {
                e.target.closeTooltip();
                if (openTooltipRef.current === e.target) openTooltipRef.current = null;
              },
              click: () => onSelect(c),
            }}
          />
        );
      })}

      <FlyTo city={selectedCity} />
    </>
  );
}
