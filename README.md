# alfreds.me

Source for my personal website, built as a static site and deployed on [Vercel](https://vercel.com).

## Project Structure

```
├── public/                  # Landing page and static project pages
│   ├── index.html           # Home page
│   ├── capybreak/           # CapyBreak page, assets and shared styles
│   ├── robots.txt
│   └── sitemap.xml
├── apps/
│   └── best-place/          # "Best Place" app (React + Vite), served at /best-place/
│       ├── public/          # Pre-built data: cities, climate grid, country polygons
│       ├── scripts/         # Data pipeline that regenerates public/*.json
│       └── src/             # App source
├── scripts/
│   └── assemble.mjs         # Combines the landing page + built app into dist/
├── vercel.json              # Deployment, caching and header configuration
└── package.json             # Build orchestration
```

## Commands

| Command                   | Action                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `npm run build`           | Builds the whole site to `./dist/`                          |
| `npm run dev:best-place`  | Runs the Best Place app locally at `localhost:5173`         |
| `npm run preview`         | Serves the built `./dist/` locally                          |

The landing page is plain HTML with no build step - edit `public/index.html` directly.

## Projects

### CapyBreak

A private macOS menu bar timer that reminds people to get up regularly. Its product,
support, privacy and accessibility information share one static page under
`public/capybreak/`. Web-optimised screenshots are derived from the app's own App Store
assets.

CapyBreak artwork and screenshots under `public/capybreak/assets/` are Copyright 2026
Alfred Strabel. All rights reserved. They are not covered by this repository's MIT
License.

### Best Place

An interactive world map for deciding where to live. Filters the 200 largest global
cities by income and capital-gains tax, cost of living, climate, and population, then
ranks the matches on a Leaflet map with a climate heatmap.

Data sources: UN World Urbanization Prospects (population), Wikipedia (tax rates, life
expectancy), Numbeo (cost of living), and [Open-Meteo](https://open-meteo.com/) (climate).
See `apps/best-place/README.md` for the regeneration pipeline.

## Deployment

The repository is connected to Vercel. Pull-request branches receive preview builds.
After a pull request is merged into `main`, Vercel runs `npm run build` and serves
`dist/` as the production site.

## License

MIT - see [LICENSE](LICENSE).
