import { readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(
  new URL("../catalog.js", import.meta.url),
  "utf8",
);
const context = { window: {} };
runInNewContext(source, context, { filename: "catalog.js" });

const stars = (context.window.STAR_DATA ?? []).map((star) => ({
  ...star,
  id: star.name,
  type: "Star",
  raDeg: star.ra * 15,
  decDeg: star.dec,
  frame: "ICRS",
}));
if (stars.length < 100) {
  throw new Error("Refusing to write an incomplete bright-sky catalogue");
}
// Constellations have their own complete, independently licensed HIP-path
// asset. Do not copy the obsolete hand-written compatibility lines from
// catalog.js into this star-only package export.
const payload = { stars };
await writeFile(
  new URL("../data/bright-sky.json", import.meta.url),
  `${JSON.stringify(payload)}\n`,
  "utf8",
);
console.log(
  `Generated ${stars.length} curated bright stars`,
);
