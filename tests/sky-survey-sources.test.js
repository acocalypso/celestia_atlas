import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DSS_SKY_SURVEY_SOURCE,
  NORTHERN_SKY_NARROWBAND_SURVEY_SOURCE,
  validateSkySurveyConfig,
  skySurveyTileUrl,
} from "../src/index.js";

test("NSNS uses the publisher's PNG equatorial DR0.2 OHS HiPS metadata", () => {
  const source = NORTHERN_SKY_NARROWBAND_SURVEY_SOURCE;
  const config = validateSkySurveyConfig(source);
  assert.equal(config.frame, "ICRS");
  assert.equal(config.maxOrder, 6);
  assert.equal(config.tileWidth, 512);
  assert.equal(config.format, "png");
  assert.equal(skySurveyTileUrl(config, 0, 0), "https://www.simg.de/nebulae3/dr0_2/ohs8/Norder0/Dir0/Npix0.png");
  assert.notEqual(source.key, DEFAULT_DSS_SKY_SURVEY_SOURCE.key);
  assert.match(source.creditLabel, /Stefan Ziegenbalg/);
  assert.match(source.rightsUrl, /by-nc-sa\/4.0/);
});
