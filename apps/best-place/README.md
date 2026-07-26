# Best Place — find where to live

A static single-page app to discover cities to relocate to, filtering by tax, cost of
living, climate, and population, on an interactive world map.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

The app reads two pre-built files from `public/`:
- `data.json` — 200 largest global cities with tax, cost-of-living, and a full year of daily climate
- `world.geojson` — world country polygons enriched with tax rates (for greying out countries)

## Features

- **Filters** (all optional, applied on **Apply**, reset with **Clear**):
  max income tax band, max capital gains tax band, cost of living as a % of your current
  city, climate (max rain mm/day, min & max daytime temperature, and minimum number of
  qualifying days/year), and min/max population (min floored at 300k).
- **World map**: a climate **heatmap** weighted by qualifying days; countries failing the
  tax filters are **greyed out**; **pins** mark cities meeting every filter.
- **Sidebar**: matching cities ranked best-first (most qualifying days, then cheaper).
- **Detail view**: click a pin or a sidebar row to see every filter value for that city.

## Rebuilding the data

```bash
node scripts/01-cities.mjs    # parse UN population spreadsheet -> top 200 cities
node scripts/02-tax.mjs       # scrape Wikipedia income + capital gains tax rates
node scripts/03-numbeo.mjs    # scrape Numbeo cost-of-living index (city + country fallback)
node scripts/04-weather.mjs   # fetch a year of daily climate per city (Open-Meteo, resumable)
node scripts/09-life-expectancy.mjs  # scrape Wikipedia life expectancy at birth, per country
node scripts/05-build.mjs     # join everything -> public/data.json + public/world.geojson
```

Change coverage with env vars: `TOP_N=300 node scripts/01-cities.mjs`,
`WEATHER_YEAR=2024 node scripts/04-weather.mjs`.

## Data sources

- Population & coordinates: UN World Urbanization Prospects (the provided spreadsheet).
- Taxes: Wikipedia, *List of countries by tax rates* (highest band per cell).
- Cost of living: Numbeo cost-of-living index (city rankings, country-level fallback).
- Climate: [Open-Meteo](https://open-meteo.com/) historical daily archive (free, no key).
  "Daytime temperature" = daily maximum.
- Life expectancy: Wikipedia, *List of countries by life expectancy* (at birth, both sexes,
  country-level).

## Known limitations

- Capital-gains rates are sparse on Wikipedia (~65% of cities); missing values show as “—”
  and are excluded when that filter is active.
- 6 cities lack Numbeo cost-of-living data (countries Numbeo doesn't cover).
- Climate is a single representative year (2025); re-run `04-weather.mjs` for another year.
