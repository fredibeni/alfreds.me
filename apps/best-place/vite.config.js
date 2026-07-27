import { rmSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// These stay in the repo as the data pipeline's source of truth (scripts/06-grid.mjs reads
// grid.json back as its incremental cache), but the browser only ever loads the packed forms
// that scripts/10-pack.mjs derives from them. Keep 28 MB of source data out of the bundle.
const SOURCE_ONLY = ["grid.json", "data.json", "world.geojson"];

function dropSourceData() {
  return {
    name: "drop-source-data",
    apply: "build",
    closeBundle() {
      for (const f of SOURCE_ONLY) rmSync(new URL(`./dist/${f}`, import.meta.url), { force: true });
    },
  };
}

export default defineConfig({
  base: "/best-place/",
  plugins: [react(), dropSourceData()],
  server: { port: 5173 },
});
