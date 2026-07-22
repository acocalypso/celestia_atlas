export type EquatorialFrame = "ICRS" | "J2000";
export type CoordinateMode = "horizontal" | "equatorial";
export interface EquatorialCoordinates {
  raDeg: number;
  decDeg: number;
  frame: EquatorialFrame;
  epochJulianYear?: number;
}
export interface Observer {
  latitudeDeg: number;
  longitudeDeg: number;
  elevationM: number;
}
export interface HorizontalCoordinates {
  /** Azimuth in degrees, with north=0 and east=90. */
  azimuthDeg: number;
  /** Geometric altitude in degrees; atmospheric refraction is not applied. */
  altitudeDeg: number;
}
export interface HourAngleCoordinates {
  /** West-positive local hour angle in the range [-180, 180]. */
  hourAngleDeg: number;
  declinationDeg: number;
}
export interface FieldOfViewOverlay {
  widthDeg: number;
  heightDeg: number;
  rotationDeg: number;
  rotationConvention:
    "clockwise-from-celestial-north" | "counterclockwise-from-celestial-north";
  mosaic?: { columns: number; rows: number; overlapPercent: number };
}
export interface ImagingTrain {
  sensorWidthPx: number;
  sensorHeightPx: number;
  pixelSizeMicrons: number;
  focalLengthMm: number;
  apertureMm?: number;
}
export interface CameraFieldOfView {
  sensorWidthMm: number;
  sensorHeightMm: number;
  widthDeg: number;
  heightDeg: number;
  diagonalDeg: number;
  pixelScaleArcsecPerPixel: number;
  focalRatio: number | null;
}
export interface MountPosition {
  coordinates: EquatorialCoordinates;
  connected: boolean;
  stale: boolean;
  timestampUtcMs: number;
}
export interface HorizonPoint {
  azimuthDeg: number;
  altitudeDeg: number;
}
export interface LandscapeSource {
  url: string;
  key: string;
}
export interface SkySurveySource {
  url: string;
  key: string;
  label?: string;
  /** Visible credit rendered whenever survey pixels are on screen. */
  creditLabel?: string;
  frame?: "ICRS" | "J2000" | "equatorial" | "GALACTIC" | "galactic";
  minOrder?: number;
  maxOrder: number;
  tileWidth?: number;
  format?: "jpg" | "jpeg" | "png" | "webp";
  /** FOV where survey imagery begins fading in. Defaults to 20 degrees. */
  blendStartFovDeg?: number;
  /** FOV where survey imagery reaches full opacity. Defaults to 10 degrees. */
  blendFullFovDeg?: number;
  attribution?: string;
  attributionUrl?: string;
  rightsUrl?: string;
}
export interface SkySurveyRuntimeState {
  enabled: boolean;
  configured: boolean;
  active: boolean;
  opacity: number;
  targetOrder: number | null;
  renderedOrder: number | null;
  loadedTiles: number;
  pendingTiles: number;
  failedTiles: number;
  lastError: string | null;
  source: Pick<
    SkySurveySource,
    | "key"
    | "label"
    | "creditLabel"
    | "attribution"
    | "attributionUrl"
    | "rightsUrl"
  > | null;
}
export interface CelestiaAtlasDisplayOptions {
  grid: boolean;
  azimuthalGrid: boolean;
  meridian: boolean;
  ecliptic: boolean;
  atmosphere: boolean;
  milkyWay: boolean;
  skySurvey: boolean;
  cardinals: boolean;
  constellations: boolean;
  labels: boolean;
  starMagnitudeLimit: number;
  galaxyMagnitudeLimit: number;
  deepSkyMagnitudeLimit: number;
  deepSkyObjectTypes: string[] | null;
  deepSkyCatalogueGroups: string[] | null;
  starScale: number;
  deepSkyObjects: boolean;
  solarSystem: boolean;
  comets: boolean;
  horizon: boolean;
  hideBelowHorizon: boolean;
  nightMode: boolean;
}
export interface CelestiaAtlasState {
  observer: Observer;
  utcMs: number;
  timeRate: number;
  view: ViewState;
  coordinateMode: CoordinateMode;
  display: CelestiaAtlasDisplayOptions;
  skySurvey: SkySurveyRuntimeState;
  paused: boolean;
}
export interface CatalogueSourceMetadata {
  catalogue?: string;
  identifier?: string;
  vizierId?: string;
  table?: string;
  originalIdentifier?: string;
  originalFrame?: string;
  coordinateOrigin?: string;
  catalogueGroup?: string;
  catalogueId?: string;
  sourceId?: string;
  title?: string;
  citation?: string;
  [key: string]: unknown;
}
export interface CatalogueShape {
  kind?: "circle" | "ellipse" | "point" | string;
  majorArcmin?: number;
  minorArcmin?: number;
  diameterArcmin?: number;
  positionAngleDeg?: number;
  approximate?: boolean;
  isApproximate?: boolean;
  derivation?: string;
  [key: string]: unknown;
}
export interface CatalogueLayerMetadata {
  name?: string;
  version?: string;
  versionLabel?: string;
  objectCount?: number;
  catalogueGroups?: string[];
  supplements?: CatalogueLayerMetadata[];
  supplementAttachmentPositionConflicts?: number;
  [key: string]: unknown;
}
export interface SelectedTarget {
  uid?: string;
  id?: string;
  name: string;
  displayName?: string;
  primaryName?: string;
  aliases?: string[];
  coordinates: EquatorialCoordinates;
  raDeg?: number;
  decDeg?: number;
  frame?: EquatorialFrame;
  type?: string;
  typeCode?: string;
  objectType?: string;
  parentBody?: string;
  mag?: number;
  magnitude?: number;
  angularSizeArcMin?: { major?: number; minor?: number };
  shape?: CatalogueShape;
  properties?: Record<string, unknown>;
  sources?: CatalogueSourceMetadata[];
  catalogueGroups?: string[];
  catalogSource?: string;
  catalogueSource?: string;
}
export type DeepSkyCatalogueObject = Omit<
  SelectedTarget,
  "name" | "coordinates" | "raDeg" | "decDeg" | "frame"
> & {
  id: string;
  name?: string;
  coordinates?: EquatorialCoordinates;
  raDeg: number;
  decDeg: number;
  frame: EquatorialFrame;
};
export interface StarCatalogueObject {
  id?: string;
  name: string;
  alias?: string;
  aliases?: string[];
  coordinates?: EquatorialCoordinates;
  raDeg: number;
  decDeg: number;
  frame: EquatorialFrame;
  mag?: number;
  magnitude?: number;
  [key: string]: unknown;
}
export type CatalogueTarget =
  SelectedTarget | DeepSkyCatalogueObject | StarCatalogueObject;
export interface SolarSystemObject extends SelectedTarget {
  id: string;
  objectType: string;
  magnitude: number;
  phaseFraction: number;
  distanceAu: number;
  catalogueSource: "Astronomy Engine";
  raDeg: number;
  decDeg: number;
  frame: "J2000";
  epochJulianYear: 2000;
}
export interface CometObject extends SelectedTarget {
  id: string;
  objectType: "comet";
  distanceAu: number;
  heliocentricDistanceAu: number;
  catalogueSource: "IAU Minor Planet Center";
  raDeg: number;
  decDeg: number;
  frame: "J2000";
  epochJulianYear: 2000;
}
export interface ViewState {
  center: EquatorialCoordinates;
  fovDeg: number;
}
export interface CelestiaAtlasViewer {
  pause(): void;
  resume(): void;
  resize(): void;
  destroy(): void;
  setCoordinateMode(value: CoordinateMode): void;
  setObserver(value: Observer): void;
  setTime(timestampUtcMs: number): void;
  setTimeRate(value: number): void;
  getTime(): number;
  getView(): ViewState;
  setView(value: ViewState): void;
  setMountPosition(value: MountPosition | null): void;
  setMountFollow(value: boolean): void;
  focusMount(): boolean;
  setFieldOfView(value: FieldOfViewOverlay | null): void;
  setHorizon(value: HorizonPoint[]): void;
  setLandscape(value: LandscapeSource | null): Promise<boolean>;
  /** Replace or disable the optional progressive photographic sky survey. */
  setSkySurvey(value: SkySurveySource | null): void;
  setDisplayOptions(value: Partial<CelestiaAtlasDisplayOptions>): void;
  focusTarget(
    target: CatalogueTarget | EquatorialCoordinates,
    fovDeg?: number,
  ): void;
  select(value: CatalogueTarget): void;
  search(
    query: string,
  ): Array<CatalogueTarget | SolarSystemObject | CometObject>;
  getState(): CelestiaAtlasState;
}
export function createCelestiaAtlasViewer(options: {
  container: HTMLElement;
  catalog?: DeepSkyCatalogueObject[];
  stars?: StarCatalogueObject[];
  constellations?: Record<string, Array<[string, string]>>;
  observer?: Observer;
  utcMs?: number;
  devicePixelRatioCap?: number;
  /** Panorama URL, or null to disable loading the synthetic Milky Way asset. */
  milkyWayPanoramaUrl?: string | null;
  /** Defaults to the online DSS2 Color HiPS; pass null for a local-only viewer. */
  skySurveySource?: SkySurveySource | null;
  onSelect?: (value: SelectedTarget) => void;
  onViewChange?: (value: ViewState) => void;
  onError?: (error: Error) => void;
}): CelestiaAtlasViewer;
export const DEFAULT_DSS_SKY_SURVEY_SOURCE: Readonly<
  Required<Omit<SkySurveySource, "frame">> & { frame: "ICRS" }
>;
export function validateSkySurveyConfig(
  value: SkySurveySource,
): Readonly<
  Required<
    Pick<
      SkySurveySource,
      "key" | "url" | "minOrder" | "maxOrder" | "tileWidth" | "format"
    >
  > & { frame: "ICRS" | "GALACTIC" }
>;
export function skySurveyPixelAngularSizeDeg(
  order: number,
  tileWidth?: number,
): number;
export function skySurveyBlendOpacity(
  fovDeg: number,
  startFovDeg?: number,
  fullFovDeg?: number,
): number;
export function selectSkySurveyOrder(
  survey: SkySurveySource,
  fovDeg: number,
  viewportWidthPixels: number,
): number;
export function equatorialToHipsTile(
  coordinates: EquatorialCoordinates,
  survey: SkySurveySource,
  order: number,
): {
  tileIndex: number;
  tileX: number;
  tileY: number;
  pixelColumn: number;
  pixelRow: number;
  pixelX: number;
  pixelY: number;
};
export function skySurveyTileKey(order: number, tileIndex: number): string;
export function skySurveyTilePath(
  order: number,
  tileIndex: number,
  format?: SkySurveySource["format"],
): string;
export function skySurveyTileUrl(
  survey: SkySurveySource,
  order: number,
  tileIndex: number,
): string;
export interface SkySurveyTileDiscoveryOptions {
  survey: SkySurveySource;
  order: number;
  view: ViewState & { rotationDeg?: number };
  observer?: Observer;
  timestampUtcMs?: number;
  canvasWidth: number;
  canvasHeight: number;
  outputWidth?: number;
  sampleStep?: number;
  hideBelowHorizon?: boolean;
  horizon?: HorizonPoint[];
}
export function discoverVisibleSkySurveyTiles(
  options: SkySurveyTileDiscoveryOptions,
): number[];
export interface SkySurveyTilePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface SkySurveyRasterOptions {
  survey: SkySurveySource;
  order: number;
  tiles: Map<string | number, SkySurveyTilePixels>;
  view: ViewState & { rotationDeg?: number };
  observer?: Observer;
  timestampUtcMs?: number;
  canvasWidth: number;
  canvasHeight: number;
  outputWidth?: number;
  fallbackMinOrder?: number;
  hideBelowHorizon?: boolean;
  horizon?: HorizonPoint[];
}
export interface SkySurveyRasterResult {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  usedTileIndices: number[];
  usedTileKeys: string[];
  usedOrders: number[];
  /** Target-order tiles still absent, even when cached parents painted them. */
  missingTileIndices: number[];
}
export interface SkySurveyAsyncRasterOptions extends SkySurveyRasterOptions {
  /** Positive number of output rows computed before yielding; defaults to 8. */
  rowsPerChunk?: number;
  /** Returning true rejects the operation with an AbortError. */
  isCancelled?: () => boolean;
}
export function rasterizeSkySurvey(
  options: SkySurveyRasterOptions,
): SkySurveyRasterResult;
export function rasterizeSkySurveyAsync(
  options: SkySurveyAsyncRasterOptions,
): Promise<SkySurveyRasterResult>;
export function normalizeDegrees(value: number): number;
export function validateEquatorialCoordinates(
  value: EquatorialCoordinates,
): EquatorialCoordinates;
export function validateObserver(value: Observer): Observer;
export function transformEquatorialVectorFrame(
  vector: { x: number; y: number; z: number },
  fromFrame: EquatorialFrame,
  toFrame: EquatorialFrame,
): { x: number; y: number; z: number };
export function combineCatalogLayers<
  TBase extends object,
  TSupplement extends object,
>(
  baseObjects: readonly TBase[],
  supplementObjects: readonly TSupplement[],
  baseMeta?: CatalogueLayerMetadata,
  supplementMeta?: CatalogueLayerMetadata,
): {
  objects: Array<TBase | Omit<TSupplement, "mergeKeys">>;
  meta: CatalogueLayerMetadata;
};
export function julianDate(timestampUtcMs: number): number;
export function localSiderealDegrees(
  timestampUtcMs: number,
  longitudeDeg: number,
): number;
export function hourAngleToHorizontal(
  hourAngleDeg: number,
  declinationDeg: number,
  latitudeDeg: number,
): HorizontalCoordinates;
export function horizontalToHourAngle(
  horizontal: HorizontalCoordinates,
  latitudeDeg: number,
): HourAngleCoordinates;
export function equatorialToHorizontal(
  coordinates: EquatorialCoordinates,
  observer: Observer,
  timestampUtcMs: number,
): HorizontalCoordinates;
export function horizontalToEquatorial(
  horizontal: HorizontalCoordinates,
  observer: Observer,
  timestampUtcMs: number,
  frame?: EquatorialFrame,
): EquatorialCoordinates;
export function calculateCameraFieldOfView(
  value: ImagingTrain,
): CameraFieldOfView;
export function projectAngularExtent(
  angularExtentDeg: number,
  focalLengthPixels: number,
): number;
export function cameraFrameScreenRotationDeg(
  projectionRotationDeg: number,
  cameraRotationDeg: number,
  rotationConvention: FieldOfViewOverlay["rotationConvention"],
  mirrorX?: boolean,
): number;
/**
 * Canvas rotation for a local +X major axis whose astronomical position
 * angle is measured from celestial north through east.
 */
export function celestialPositionAngleCanvasRotationDeg(
  projectionRotationDeg: number,
  positionAngleDeg: number,
  mirrorX?: boolean,
): number;
export function alignViewToHorizon(
  view: ViewState,
  observer: Observer,
  timestampUtcMs: number,
): ViewState & { rotationDeg: number; mirrorX: true };
export function isGalaxyObject(object: unknown): boolean;
export type DeepSkyVisualKind =
  | "galaxy"
  | "globular-cluster"
  | "open-cluster"
  | "dark-nebula"
  | "reflection-nebula"
  | "emission-nebula"
  | "nebula"
  | "other";
export function deepSkyObjectTypeKey(object: unknown): string;
export function deepSkyCatalogueGroupKeys(object: unknown): string[];
export function classifyDeepSkyObject(object: unknown): DeepSkyVisualKind;
export function hasApproximateCatalogShape(object: unknown): boolean;
export function deepSkyUnknownMagnitudeFovLimit(object: unknown): number;
export function passesDeepSkyCatalogFilter(
  object: unknown,
  deepSkyObjectTypes?: string[] | null,
  deepSkyCatalogueGroups?: string[] | null,
): boolean;
export function passesDeepSkyMagnitudeFilter(
  object: unknown,
  galaxyMagnitudeLimit: number,
  deepSkyMagnitudeLimit: number,
): boolean;
export function normalizeCatalogIdentifier(value: unknown): string;
export function messierDesignation(object: unknown): string;
export function deepSkyObjectLabel(object: unknown): string;
export interface CatalogSearchIndexEntry<T = unknown> {
  item: T;
  terms: readonly string[];
}
export function createCatalogSearchIndex<T>(
  items: T[],
): CatalogSearchIndexEntry<T>[];
export function searchCatalogIndex<T>(
  index: CatalogSearchIndexEntry<T>[],
  query: unknown,
  limit?: number,
): T[];
export function getSolarSystemObjects(
  timestampUtcMs: number,
  observer: Observer,
): SolarSystemObject[];
export function getJupiterMoonObjects(
  timestampUtcMs: number,
  observer: Observer,
): SolarSystemObject[];
export function getCometObjects(
  timestampUtcMs: number,
  observer: Observer,
  elements?: unknown[],
): CometObject[];
