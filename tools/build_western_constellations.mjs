#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "node:path";
import { createInterface } from "node:readline";

const args = Object.fromEntries(
  process.argv.slice(2).map((value, index, values) => {
    if (!value.startsWith("--")) return [value, true];
    return [value.slice(2), values[index + 1]?.startsWith("--") ? true : values[index + 1]];
  }),
);
const sourcePath = args.source;
const hygPath = args.hyg;
if (!sourcePath || !hygPath) {
  throw new Error(
    "Usage: node tools/build_western_constellations.mjs --source <western/index.json> --hyg <hygdata_v41.csv>",
  );
}

const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes);
if (!Array.isArray(source.constellations) || source.constellations.length !== 88) {
  throw new Error("Western source must contain all 88 IAU constellations");
}

function csvFields(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += character;
  }
  fields.push(field);
  return fields;
}

const requiredHipIds = new Set(
  source.constellations.flatMap((constellation) => constellation.lines.flat()),
);
const coordinates = new Map();
const input = createInterface({ input: createReadStream(hygPath), crlfDelay: Infinity });
let headers;
for await (const line of input) {
  const fields = csvFields(line);
  if (!headers) {
    headers = fields;
    continue;
  }
  const hipIndex = headers.indexOf("hip");
  const hip = Number(fields[hipIndex]);
  if (!requiredHipIds.has(hip)) continue;
  const raHours = Number(fields[headers.indexOf("ra")]);
  const decDeg = Number(fields[headers.indexOf("dec")]);
  if (!Number.isFinite(raHours) || !Number.isFinite(decDeg)) {
    throw new Error(`HYG row for HIP ${hip} has invalid coordinates`);
  }
  coordinates.set(hip, [Number((raHours * 15).toFixed(8)), Number(decDeg.toFixed(8))]);
}
const missing = [...requiredHipIds].filter((hip) => !coordinates.has(hip));
if (missing.length) throw new Error(`HYG does not resolve HIP IDs: ${missing.join(", ")}`);

const constellations = source.constellations
  .map((entry) => ({
    iau: entry.iau,
    name: entry.common_name?.native || entry.common_name?.english || entry.iau,
    lines: entry.lines,
  }))
  .sort((left, right) => left.iau.localeCompare(right.iau));
const vertices = Object.fromEntries(
  [...coordinates].sort(([left], [right]) => left - right),
);
const payload = {
  meta: {
    name: "Celestia Atlas Western constellation lines",
    schemaVersion: 1,
    frame: "ICRS",
    constellationCount: constellations.length,
    vertexCount: requiredHipIds.size,
    segmentCount: constellations.reduce(
      (count, constellation) =>
        count + constellation.lines.reduce((sum, line) => sum + line.length - 1, 0),
      0,
    ),
    source: "Stellarium Western sky culture",
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    coordinateSource: "HYG v4.1",
    coordinateSourceSha256: "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd",
    license: "GPL-2.0-or-later",
    modifications:
      "Retained only the 88 IAU line paths and Latin names; removed illustrations, boundaries, translations and Stellarium runtime fields; resolved HIP vertices to ICRS/J2000 coordinates using HYG v4.1.",
  },
  vertices,
  constellations,
};
const json = `${JSON.stringify(payload)}\n`;
await Promise.all([
  writeFile(new URL("../data/western-constellations.json", import.meta.url), json),
  writeFile(
    new URL("../western-constellations.js", import.meta.url),
    `globalThis.WESTERN_CONSTELLATIONS = ${JSON.stringify(payload)};\n`,
  ),
]);
console.log(
  `Generated ${constellations.length} constellations, ${requiredHipIds.size} vertices and ${payload.meta.segmentCount} segments from ${parse(sourcePath).base}`,
);
