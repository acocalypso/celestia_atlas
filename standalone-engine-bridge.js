import { getCometObjects, getSolarSystemObjects } from "./src/index.js";

function toStandaloneObject(object, kind) {
  return {
    ...object,
    kind,
    type: object.objectType,
    ra: object.raDeg / 15,
    dec: object.decDeg,
    catalogSource: object.catalogueSource,
    description: `${object.name} at its apparent topocentric J2000 position for the selected observer and time.`,
  };
}

globalThis.CelestiaAtlasSolarSystem = Object.freeze({
  getObjects(timestampUtcMs, observer) {
    return getSolarSystemObjects(timestampUtcMs, observer).map((object) =>
      toStandaloneObject(object, "solar-system"),
    );
  },
});

globalThis.CelestiaAtlasComets = Object.freeze({
  getObjects(timestampUtcMs, observer) {
    return getCometObjects(timestampUtcMs, observer).map((object) =>
      toStandaloneObject(object, "comet"),
    );
  },
});

globalThis.dispatchEvent?.(new Event("celestiaatlasengineloaded"));
