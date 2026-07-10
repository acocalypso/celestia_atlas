import test from 'node:test';
import assert from 'node:assert/strict';
import { equatorialToHorizontal, normalizeDegrees, validateEquatorialCoordinates, validateObserver } from '../src/index.js';

test('normalizes RA wrap and east-positive longitude', () => {
  assert.equal(validateEquatorialCoordinates({ raDeg: 360, decDeg: 0, frame: 'ICRS' }).raDeg, 0);
  assert.equal(validateObserver({ latitudeDeg: 0, longitudeDeg: 181, elevationM: 0 }).longitudeDeg, -179);
  assert.equal(normalizeDegrees(-1), 359);
});

test('rejects untagged command-producing coordinates', () => {
  assert.throws(() => validateEquatorialCoordinates({ raDeg: 10, decDeg: 20 }), /explicit/);
  assert.throws(() => validateEquatorialCoordinates({ raDeg: 10, decDeg: 91, frame: 'ICRS' }), /decDeg/);
});

test('Greenwich meridian transit places an equatorial target on the celestial equator horizon geometry', () => {
  const timestampUtcMs = Date.UTC(2000, 0, 1, 12);
  const result = equatorialToHorizontal(
    { raDeg: 280.46061837, decDeg: 0, frame: 'J2000', epochJulianYear: 2000 },
    { latitudeDeg: 0, longitudeDeg: 0, elevationM: 0 },
    timestampUtcMs,
  );
  assert.ok(Math.abs(result.altitudeDeg - 90) < 1e-7);
});
