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
export interface SelectedTarget {
  id?: string;
  name: string;
  aliases?: string[];
  coordinates: EquatorialCoordinates;
  objectType?: string;
  parentBody?: string;
  magnitude?: number;
  angularSizeArcMin?: { major?: number; minor?: number };
  catalogueSource?: string;
}
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
  setDisplayOptions(
    value: Partial<{
      grid: boolean;
      azimuthalGrid: boolean;
      meridian: boolean;
      ecliptic: boolean;
      atmosphere: boolean;
      milkyWay: boolean;
      cardinals: boolean;
      constellations: boolean;
      labels: boolean;
      starMagnitudeLimit: number;
      galaxyMagnitudeLimit: number;
      deepSkyMagnitudeLimit: number;
      starScale: number;
      deepSkyObjects: boolean;
      solarSystem: boolean;
      comets: boolean;
      horizon: boolean;
      hideBelowHorizon: boolean;
      nightMode: boolean;
    }>,
  ): void;
  focusTarget(
    target: SelectedTarget | EquatorialCoordinates,
    fovDeg?: number,
  ): void;
  select(value: SelectedTarget): void;
  search(query: string): unknown[];
  getState(): unknown;
}
export function createCelestiaAtlasViewer(options: {
  container: HTMLElement;
  catalog?: unknown[];
  stars?: unknown[];
  constellations?: Record<string, Array<[string, string]>>;
  observer?: Observer;
  utcMs?: number;
  devicePixelRatioCap?: number;
  milkyWayPanoramaUrl?: string;
  onSelect?: (value: SelectedTarget) => void;
  onViewChange?: (value: ViewState) => void;
  onError?: (error: Error) => void;
}): CelestiaAtlasViewer;
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
): number;
export function alignViewToHorizon(
  view: ViewState,
  observer: Observer,
  timestampUtcMs: number,
): ViewState & { rotationDeg: number };
export function isGalaxyObject(object: unknown): boolean;
export function passesDeepSkyMagnitudeFilter(
  object: unknown,
  galaxyMagnitudeLimit: number,
  deepSkyMagnitudeLimit: number,
): boolean;
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
