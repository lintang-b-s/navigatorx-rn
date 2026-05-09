import { NativeModule, requireNativeModule } from "expo";

import { MapMatcherModuleEvents } from "./MapMatcher.types";

declare class MapMatcherModule extends NativeModule<MapMatcherModuleEvents> {
  initializeMapMatchingGraph(numVertices: number): void;
  setMatrix(matrixBytes: Uint8Array): void;
  rebuildMapMatchGraph(tileBytes: Uint8Array): void;
  getLocalEdgeId(originalId: number): number;
  initializeOnlineMatcher(
    initialSpeedMean: number,
    initialSpeedStd: number,
    posteriorThreshold: number,
    gpsStd: number,
    lp: number,
    lc: number,
    accelerationStd: number,
  ): void;
  onlineMapMatch(
    gps: {
      lat: number;
      lon: number;
      time: number;
      speed: number;
      delta_time: number;
      dead_reckoning: boolean;
    },
    k: number,
    candidatesJSON: string,
    speedMeanK: number,
    speedStdK: number,
    lastBearing: number,
  ): string;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MapMatcherModule>("MapMatcher");
