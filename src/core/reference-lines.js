import { normalizeDegrees } from "./coordinates.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000_OBLIQUITY_DEG = 23.439291111;
const GALACTIC_TO_EQUATORIAL = [
  [-0.0548755604, 0.4941094279, -0.867666149],
  [-0.8734370902, -0.44482963, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];

function vectorToEquatorial([x, y, z]) {
  return {
    raDeg: normalizeDegrees(Math.atan2(y, x) * RAD),
    decDeg: Math.asin(Math.max(-1, Math.min(1, z))) * RAD,
    frame: "J2000",
    epochJulianYear: 2000,
  };
}

export function eclipticToEquatorial(longitudeDeg, latitudeDeg = 0) {
  const longitude = longitudeDeg * DEG;
  const latitude = latitudeDeg * DEG;
  const obliquity = J2000_OBLIQUITY_DEG * DEG;
  const ecliptic = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  return vectorToEquatorial([
    ecliptic[0],
    ecliptic[1] * Math.cos(obliquity) - ecliptic[2] * Math.sin(obliquity),
    ecliptic[1] * Math.sin(obliquity) + ecliptic[2] * Math.cos(obliquity),
  ]);
}

export function galacticToEquatorial(longitudeDeg, latitudeDeg = 0) {
  const longitude = longitudeDeg * DEG;
  const latitude = latitudeDeg * DEG;
  const galactic = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  return vectorToEquatorial(
    GALACTIC_TO_EQUATORIAL.map(
      (row) => row[0] * galactic[0] + row[1] * galactic[1] + row[2] * galactic[2],
    ),
  );
}
