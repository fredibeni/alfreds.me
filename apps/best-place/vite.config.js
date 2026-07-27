import { rmSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/grid.json is the data pipeline's source of truth and its incremental cache
// (scripts/06-grid.mjs reads it back), but the browser only ever loads the packed form that
// scripts/10-pack.mjs derives from it. Keep it out of the deployed bundle — it is 16 MB.
const SOURCE_ONLY = ["grid.json"];

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
