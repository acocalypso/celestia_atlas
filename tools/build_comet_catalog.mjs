import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.resolve(root, process.argv[2] ?? "data/sources/CometEls.txt");
const source = fs.readFileSync(input, "utf8");

function number(line, start, end) {
  const value = Number.parseFloat(line.slice(start, end).trim());
  return Number.isFinite(value) ? value : null;
}

function terrestrialDaysSinceJ2000(year, month, day) {
  const wholeDay = Math.floor(day);
  const utcMs = Date.UTC(year, month - 1, wholeDay);
  return utcMs / 86400000 + 2440587.5 + (day - wholeDay) - 2451545;
}

const objects = source
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line, index) => {
    if (line.length < 158)
      throw new Error(`Invalid MPC comet record at line ${index + 1}`);
    const year = number(line, 14, 18);
    const month = number(line, 19, 21);
    const day = number(line, 22, 29);
    const qAu = number(line, 30, 39);
    const eccentricity = number(line, 41, 49);
    const argumentPerihelionDeg = number(line, 51, 59);
    const ascendingNodeDeg = number(line, 61, 69);
    const inclinationDeg = number(line, 71, 79);
    const absoluteMagnitude = number(line, 91, 95);
    const slope = number(line, 96, 100);
    const name = line.slice(102, 158).trim();
    const packedDesignation = line.slice(0, 12).trim();
    if (
      !name ||
      ![year, month, day, qAu, eccentricity, argumentPerihelionDeg,
        ascendingNodeDeg, inclinationDeg].every(Number.isFinite)
    )
      throw new Error(`Incomplete MPC comet record at line ${index + 1}`);
    return {
      id: `comet:${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name,
      packedDesignation,
      perihelionTt: terrestrialDaysSinceJ2000(year, month, day),
      qAu,
      eccentricity,
      argumentPerihelionDeg,
      ascendingNodeDeg,
      inclinationDeg,
      absoluteMagnitude,
      slope,
      reference: line.slice(159, 168).trim(),
    };
  });

const payload = {
  meta: {
    source: "IAU Minor Planet Center CometEls",
    format: "MPC Ephemerides and Orbital Elements comet format",
    sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
    objectCount: objects.length,
  },
  objects,
};
const json = `${JSON.stringify(payload)}\n`;
fs.writeFileSync(path.join(root, "data/comets.json"), json);
fs.writeFileSync(path.join(root, "data/comets.js"), `export default ${json}`);
console.log(`Generated ${objects.length} comet records.`);
