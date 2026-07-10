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
const constellations = context.window.CONSTELLATION_LINES ?? {};
if (stars.length < 100 || Object.keys(constellations).length < 10) {
  throw new Error("Refusing to write an incomplete bright-sky catalogue");
}
const payload = { stars, constellations };
await writeFile(
  new URL("../data/bright-sky.json", import.meta.url),
  `${JSON.stringify(payload)}\n`,
  "utf8",
);
console.log(
  `Generated ${stars.length} stars and ${Object.keys(constellations).length} constellations`,
);
