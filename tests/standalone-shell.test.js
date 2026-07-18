import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("standalone shell boots the shared public viewer", async () => {
  const [
    html,
    application,
    styles,
    standaloneStyles,
    publicApi,
    types,
    serviceWorker,
  ] =
    await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../standalone-app.js", import.meta.url), "utf8"),
      readFile(new URL("../styles.css", import.meta.url), "utf8"),
      readFile(new URL("../standalone.css", import.meta.url), "utf8"),
      readFile(new URL("../src/public-api.js", import.meta.url), "utf8"),
      readFile(new URL("../src/index.d.ts", import.meta.url), "utf8"),
      readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    ]);
  assert.match(html, /type="module" src="standalone-app\.js"/);
  assert.match(
    html,
    /catalog\.js[\s\S]*hyg-star-catalog\.js[\s\S]*dso-catalog\.js[\s\S]*abell-pn-catalog\.js[\s\S]*stellarium-supplement\.js[\s\S]*standalone-app\.js/,
  );
  assert.doesNotMatch(html, /app-v8\.js|standalone-engine-bridge\.js/);
  assert.match(application, /createCelestiaAtlasViewer/);
  assert.match(application, /combineCatalogLayers/);
  assert.match(application, /STELLARIUM_DSO_SUPPLEMENT_DATA/);
  assert.match(application, /globalThis\.ABELL_PN_CATALOG_DATA/);
  assert.match(application, /catalogWithAbellPlanetaryNebulae/);
  assert.match(application, /globalThis\.HYG_STAR_DATA/);
  assert.match(application, /\.\.\.\(globalThis\.STAR_DATA \?\? \[\]\)/);
  assert.match(application, /\.\.\.\(globalThis\.HYG_STAR_DATA \?\? \[\]\)/);
  assert.match(html, /id="magLimit"[\s\S]*max="6\.5"[\s\S]*value="6\.5"/);
  assert.match(application, /viewer\.setLandscape/);
  assert.match(application, /viewer\.setFieldOfView/);
  assert.match(application, /calculateCameraFieldOfView/);
  assert.match(html, /id="sensorWidthInput"/);
  assert.match(html, /id="sensorHeightInput"/);
  assert.match(html, /id="pixelSizeInput"/);
  assert.match(html, /id="focalLengthInput"/);
  assert.match(html, /id="apertureInput"/);
  assert.match(html, /id="fovOpticsReadout"/);
  assert.doesNotMatch(html, /id="fov(?:Width|Height)Input"/);
  assert.match(application, /viewer\.setDisplayOptions/);
  assert.match(html, /id="skySurveySwitch" type="checkbox" checked/);
  assert.match(application, /celestia-atlas\.sky-survey/);
  assert.match(application, /skySurvey: state\.skySurvey/);
  assert.match(application, /CELESTIA_ATLAS_SKY_SURVEY_SOURCE/);
  assert.match(
    html,
    /bounded cache of recently viewed tiles when browser storage permits/,
  );
  assert.match(application, /viewer\.setCoordinateMode\(state\.mode\)/);
  assert.match(
    html,
    /id="controlPanel"[\s\S]*class="floating-panel control-panel glass closed"[\s\S]*aria-hidden="true"/,
  );
  assert.match(html, /id="hideBelowHorizonSwitch" type="checkbox" checked/);
  assert.match(application, /hideBelowHorizon: state\.hideBelowHorizon/);
  assert.match(html, /id="galaxyMagLimit"/);
  assert.match(html, /id="dsoMagLimit"/);
  assert.match(
    application,
    /galaxyMagnitudeLimit: state\.galaxyMagnitudeLimit/,
  );
  assert.match(
    application,
    /deepSkyMagnitudeLimit: state\.deepSkyMagnitudeLimit/,
  );
  assert.match(html, /id="dsoTypeFilters"/);
  assert.match(html, /id="dsoSourceFilters"/);
  assert.match(html, /data-catalog-filter-action="all"/);
  assert.match(html, /data-catalog-filter-action="none"/);
  assert.match(
    application,
    /deepSkyObjectTypes: state\.deepSkyObjectTypes/,
  );
  assert.match(
    application,
    /deepSkyCatalogueGroups: state\.deepSkyCatalogueGroups/,
  );
  assert.match(application, /Number\.isFinite\(object\.raDeg\)/);
  assert.match(application, /globalThis\.DSO_CATALOG_META/);
  assert.match(application, /object\.primaryName \|\| object\.name/);
  assert.match(application, /Source catalogues and identifiers/);
  assert.match(application, /Source-specific property values/);
  assert.match(application, /sourcePropertyConflicts/);
  assert.match(application, /source\.vizierId/);
  assert.match(application, /source\.originalIdentifier/);
  assert.match(application, /Approximate geometry/);
  assert.match(application, /properties\.opacity/);
  assert.doesNotMatch(application, /aliases \?\? \[\]\)\.slice/);
  assert.match(styles, /\.catalog-filter-options/);
  assert.match(
    styles,
    /@media\(max-width:560px\)\{\.catalog-filter-options\{grid-template-columns:1fr/,
  );
  assert.match(standaloneStyles, /\.search\s*\{[^}]*min-width:\s*0;/s);
  assert.match(
    standaloneStyles,
    /@media \(max-width: 560px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    standaloneStyles,
    /@media \(max-width: 560px\)[\s\S]*\.top-actions\s*\{[^}]*flex: 0 0 auto;/,
  );
  for (const inset of ["top", "right", "left"])
    assert.match(
      standaloneStyles,
      new RegExp(`env\\(safe-area-inset-${inset}, 0px\\)`),
    );
  assert.match(
    standaloneStyles,
    /\.left-rail,[\s\S]*\.details-panel\s*\{[^}]*safe-area-inset-top/,
  );
  assert.match(types, /hideBelowHorizon: boolean/);
  assert.match(types, /setSkySurvey\(value: SkySurveySource \| null\)/);
  assert.match(types, /skySurveySource\?: SkySurveySource \| null/);
  assert.match(types, /skySurvey: boolean/);
  assert.match(types, /setCoordinateMode\(value: CoordinateMode\)/);
  assert.match(types, /galaxyMagnitudeLimit: number/);
  assert.match(types, /deepSkyMagnitudeLimit: number/);
  assert.match(publicApi, /assets\/milky-way\.webp/);
  assert.match(publicApi, /DEFAULT_DSS_SKY_SURVEY_SOURCE/);
  assert.match(publicApi, /stpubdata\.s3\.us-east-1\.amazonaws\.com/);
  assert.match(publicApi, /skySurveyBlendOpacity\(view\.fovDeg\)/);
  assert.match(
    publicApi,
    /\(projectionView\.rotationDeg \?\? 0\)\.toFixed\(1\),\s*Boolean\(projectionView\.mirrorX\),\s*coordinateMode/,
  );
  assert.match(publicApi, /rasterizeSkySurveyAsync/);
  assert.match(
    publicApi,
    /if \(interactive\) return Math\.min\(baseWidth, coarsePointer \? 64 : 128\)/,
  );
  assert.match(publicApi, /const skySurveyCacheLimit = coarsePointer \? 24 : 64/);
  assert.match(publicApi, /const skySurveyLoadConcurrency = coarsePointer \? 2 : 4/);
  assert.match(publicApi, /SKY_SURVEY_PERSISTENT_CACHE = "celestia-atlas-survey-v1"/);
  assert.match(publicApi, /SKY_SURVEY_PERSISTENT_CACHE_LIMIT = 96/);
  assert.match(publicApi, /globalThis\.caches\.open\(SKY_SURVEY_PERSISTENT_CACHE\)/);
  assert.match(publicApi, /navigator\.onLine === false/);
  assert.match(publicApi, /cachedAncestorOrders = offline[\s\S]*cacheOnly: true/);
  assert.match(publicApi, /error\?\.name === "CacheMissError"/);
  assert.match(publicApi, /Photographic survey unavailable; using the offline sky background/);
  assert.match(publicApi, /drawDsoGlyph/);
  assert.doesNotMatch(publicApi, /if \(!display\.azimuthalGrid\) return view/);
  const landscapeDraw = publicApi.indexOf(
    "    drawLandscape(width, height, projectionView, referenceUtcMs, dpr);",
  );
  const horizontalGridDraw = publicApi.indexOf(
    "    if (display.azimuthalGrid)",
  );
  assert.ok(landscapeDraw > 0);
  assert.ok(landscapeDraw < horizontalGridDraw);
  const surveyDraw = publicApi.indexOf(
    "    drawSkySurvey(width, height, projectionView, referenceUtcMs, dpr);",
  );
  assert.ok(surveyDraw > 0 && surveyDraw < landscapeDraw);
  assert.match(types, /milkyWayPanoramaUrl\?: string/);
  assert.match(types, /calculateCameraFieldOfView/);
  assert.match(types, /cameraFrameScreenRotationDeg/);
  assert.match(
    publicApi,
    /cameraFrameScreenRotationDeg\(\s*projectionView\.rotationDeg \?\? 0,/,
  );
  assert.match(serviceWorker, /\.\/src\/core\/optics\.js/);
  assert.match(serviceWorker, /\.\/src\/core\/catalog-filters\.js/);
  assert.match(serviceWorker, /\.\/src\/core\/catalog-layers\.js/);
  assert.match(serviceWorker, /\.\/src\/core\/sky-survey\.js/);
  assert.match(serviceWorker, /celestia-atlas-survey-v1/);
  assert.match(serviceWorker, /SURVEY_CACHE_LIMIT=96/);
  assert.match(serviceWorker, /\.\/stellarium-supplement\.js/);
  assert.match(serviceWorker, /\.\/abell-pn-catalog\.js/);
  assert.match(serviceWorker, /\.\/hyg-star-catalog\.js/);
});

test("standalone package contains all twelve offline landscape faces", async () => {
  await access(
    new URL("../assets/landscapes/guereins/properties", import.meta.url),
  );
  await Promise.all(
    Array.from({ length: 12 }, (_, face) =>
      access(
        new URL(
          `../assets/landscapes/guereins/Norder0/Dir0/Npix${face}.webp`,
          import.meta.url,
        ),
      ),
    ),
  );
});

test("mobile renderer keeps expensive work inside bounded frame contracts", async () => {
  const [publicApi, coordinates, landscape] = await Promise.all([
    readFile(new URL("../src/public-api.js", import.meta.url), "utf8"),
    readFile(new URL("../src/core/coordinates.js", import.meta.url), "utf8"),
    readFile(new URL("../src/core/landscape.js", import.meta.url), "utf8"),
  ]);
  assert.match(publicApi, /landscapeRasterWidth\([\s\S]*coarsePointer/);
  assert.match(publicApi, /if \(canvas\.width !== backingWidth\)/);
  assert.match(publicApi, /if \(canvas\.height !== backingHeight\)/);
  assert.match(publicApi, /landscapeUploadKey !== landscapeRasterCache\.key/);
  assert.match(publicApi, /milkyWayUploadKey !== milkyWayRasterCache\.key/);
  assert.match(publicApi, /const refineSkySurveyRaster = \(\) =>/);
  assert.match(publicApi, /skySurveyRasterCache\.viewKey === rasterViewKey/);
  assert.match(publicApi, /presentSkySurveyRaster\(/);
  assert.match(publicApi, /projectionView\.fovDeg \* 1\.3/);
  assert.match(publicApi, /sampleStep: 8/);
  assert.doesNotMatch(
    publicApi,
    /abortSkySurveyRequests\([\s\S]{0,160}!wanted\.has\(request\.requestKey\)/,
  );
  assert.match(publicApi, /currentSolarSystemObjects/);
  assert.match(publicApi, /interactionViewChangePending = true/);
  assert.match(publicApi, /const dsoLabelBudget/);
  assert.match(publicApi, /placedDsoLabelBoxes\.some/);
  assert.match(publicApi, /const renderStars = stars[\s\S]*\.sort\(/);
  assert.match(publicApi, /function starColorFromBv\(/);
  assert.match(publicApi, /const interactionStarMagnitudeLimit/);
  assert.match(publicApi, /if \(!pendingSelectedStar\) break/);
  assert.match(publicApi, /const drawDsoFootprint = \(/);
  assert.match(publicApi, /projectAngularExtent\(/);
  assert.match(publicApi, /addEventListener\("contextlost"/);
  assert.match(publicApi, /removeEventListener\("contextrestored"/);
  assert.match(coordinates, /let observedFrameCache = null/);
  assert.match(landscape, /createEquatorialToHorizontalVectorTransform/);
  assert.doesNotMatch(landscape, /localSiderealDegrees/);

  const dsoLoopStart = publicApi.indexOf("let catalogIndex = 0;");
  const dsoLoopEnd = publicApi.indexOf("if (display.solarSystem)");
  assert.ok(dsoLoopStart > 0 && dsoLoopEnd > dsoLoopStart);
  const dsoLoop = publicApi.slice(dsoLoopStart, dsoLoopEnd);
  assert.ok(dsoLoop.indexOf("const point = project(object)") > 0);
  assert.ok(
    dsoLoop.indexOf("const point = project(object)") <
      dsoLoop.indexOf("if (!isAboveHorizon(object))"),
  );
});
