# alfreds.me

Source for my personal website, built as a static site and deployed on [Vercel](https://vercel.com).

## Project Structure

```
├── public/                  # Landing page, served at the site root
│   ├── index.html           # Home page
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

### Best Place

An interactive world map for deciding where to live. Filters the 200 largest global
cities by income and capital-gains tax, cost of living, climate, and population, then
ranks the matches on a Leaflet map with a climate heatmap.

Data sources: UN World Urbanization Prospects (population), Wikipedia (tax rates, life
expectancy), Numbeo (cost of living), and [Open-Meteo](https://open-meteo.com/) (climate).
See `apps/best-place/README.md` for the regeneration pipeline.

## Deployment

Connect the repository to Vercel. It runs `npm run build` and serves `dist/` on every
push to `main`.

## License

MIT - see [LICENSE](LICENSE).
