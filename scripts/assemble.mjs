// Assembles the deployable site into ./dist
//   public/*              -> dist/            (landing page, robots, sitemap)
//   apps/best-place/dist  -> dist/best-place/ (built Best Place app)
import { cp, rm, mkdir } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("apps/best-place/dist", "dist/best-place", { recursive: true });

console.log("Assembled dist/ (landing + /best-place/)");
