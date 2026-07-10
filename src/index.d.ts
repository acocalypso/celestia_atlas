export type EquatorialFrame = "ICRS" | "J2000";
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
export interface SelectedTarget {
  id?: string;
  name: string;
  aliases?: string[];
  coordinates: EquatorialCoordinates;
  objectType?: string;
  magnitude?: number;
  angularSizeArcMin?: { major?: number; minor?: number };
  catalogueSource?: string;
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
  setObserver(value: Observer): void;
  setTime(timestampUtcMs: number): void;
  setView(value: ViewState): void;
  setMountPosition(value: MountPosition | null): void;
  setFieldOfView(value: FieldOfViewOverlay | null): void;
  setHorizon(value: HorizonPoint[]): void;
  setDisplayOptions(
    value: Partial<{
      grid: boolean;
      labels: boolean;
      deepSkyObjects: boolean;
      horizon: boolean;
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
  onSelect?: (value: SelectedTarget) => void;
  onViewChange?: (value: ViewState) => void;
}): CelestiaAtlasViewer;
