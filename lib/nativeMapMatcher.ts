import geohash from "ngeohash";
import MapMatcher from "../modules/map-matcher";
import { API_CONFIG } from "./config";
import type { Candidate, Gps, MatchedGpsPoint } from "./mapmatchApi";

/**
 * High-level wrapper around the native MapMatcher module.
 * Mirrors the same API surface as the old WasmMapMatcher class,
 * but calls the Go-compiled native module instead of WASM.
 */

export interface NativeMatchResult {
  matched_gps_point: MatchedGpsPoint;
  new_candidates: Candidate[];
  new_speed_mean: number;
  new_speed_std: number;
}

export interface MapMatchResponseData {
  matched_gps_point: MatchedGpsPoint;
  candidates: Candidate[];
  speed_mean_k: number;
  speed_std_k: number;
  edge_initial_bearing: number;
}

class NativeMapMatcher {
  private isReady = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private apiUrl = API_CONFIG.ROUTER_API_URL;

  private currentTile: string | null = null;
  private requestedTile: string | null = null;
  private loadingTiles = new Set<string>();

  async init(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = this.initialize();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      this.isInitializing = false;
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    try {
      // 1. Fetch tile metadata (number of vertices)
      const initResponse = await fetch(`${this.apiUrl}/api/tile-init`);
      if (!initResponse.ok) {
        throw new Error(
          `Failed to fetch tile metadata: ${initResponse.status}`,
        );
      }

      const initPayload = await initResponse.json();
      const numberOfVertices = initPayload?.data?.number_of_vertices;
      if (typeof numberOfVertices !== "number") {
        throw new Error(
          `Invalid number_of_vertices received: ${numberOfVertices}`,
        );
      }

      // 2. Initialize the graph in the native module
      MapMatcher.initializeMapMatchingGraph(numberOfVertices);

      // 3. Fetch transition matrix binary
      const matrixResponse = await fetch(
        `${this.apiUrl}/api/tile-init-transition-matrix`,
      );
      if (!matrixResponse.ok) {
        throw new Error(
          `Failed to fetch transition matrix: ${matrixResponse.status}`,
        );
      }

      const matrixBuffer = await matrixResponse.arrayBuffer();
      const matrixBytes = new Uint8Array(matrixBuffer);
      MapMatcher.setMatrix(matrixBytes);

      this.isReady = true;
      this.isInitializing = false;
      console.log("[NativeMapMatcher] Initialized successfully");
    } catch (error: any) {
      console.error("[NativeMapMatcher] Init Error:", error);
      this.isInitializing = false;
      throw error;
    }
  }

  /**
   * Loads a map matching tile for the area around the given coordinates.
   * Uses geohash-6 precision to determine tile boundaries.
   */
  async loadTile(lat: number, lon: number): Promise<void> {
    if (!this.isReady) return;

    const gh = geohash.encode(lat, lon, 6);
    if (this.currentTile === gh) return;
    this.requestedTile = gh;
    if (this.loadingTiles.has(gh)) return;

    this.loadingTiles.add(gh);
    try {
      const response = await fetch(`${this.apiUrl}/api/tile/${gh}`);
      if (!response.ok) {
        throw new Error(`Tile ${gh} request failed: ${response.status}`);
      }

      const tileBuffer = await response.arrayBuffer();
      const tileData = new Uint8Array(tileBuffer);
      if (this.requestedTile !== gh) return;

      MapMatcher.rebuildMapMatchGraph(tileData);
      this.currentTile = gh;

      // Initialize the online matcher AFTER the tile (graph + R-tree) is loaded
      MapMatcher.initializeOnlineMatcher(
        8.33333, // initialSpeedMean (m/s ~30 km/h)
        8.3333, // initialSpeedStd
        0.0001, // posteriorThreshold
        4.07, // gpsStd (meters)
        0.0000001, // lp
        0.06, // lc (km ~60m search radius)
        3.0, // accelerationStd
      );
      console.log("[NativeMapMatcher] Online matcher initialized for tile", gh);
    } catch (error) {
      console.warn(`[NativeMapMatcher] Failed to load tile ${gh}:`, error);
    } finally {
      this.loadingTiles.delete(gh);
    }
  }

  /**
   * Converts an original Graph edge ID to the local graph index.
   * Returns 1000000001 if the edge ID is not found in the loaded tile.
   */
  getLocalEdgeId(originalId: number): number {
    if (!this.isReady) return 1000000001;
    return MapMatcher.getLocalEdgeId(originalId);
  }

  /**
   * Performs online map matching for a single GPS observation.
   * Returns the matched result or null if not ready.
   */
  onlineMapMatch(
    gpsPoint: Gps,
    k: number,
    candidates: Candidate[],
    speedMeanK: number,
    speedStdK: number,
    lastBearing: number,
  ): MapMatchResponseData | null {
    if (!this.isReady) return null;

    const timeUnix = Math.floor(
      (gpsPoint.time instanceof Date ? gpsPoint.time.getTime() : Date.now()) /
        1000,
    );

    const resultJSON = MapMatcher.onlineMapMatch(
      {
        lat: gpsPoint.lat,
        lon: gpsPoint.lon,
        time: timeUnix,
        speed: gpsPoint.speed,
        delta_time: gpsPoint.delta_time,
        dead_reckoning: gpsPoint.dead_reckoning,
      },
      k,
      JSON.stringify(candidates),
      speedMeanK,
      speedStdK,
      lastBearing,
    );

    if (!resultJSON || resultJSON === "[]") return null;

    try {
      const result: NativeMatchResult = JSON.parse(resultJSON);
      // Map the native result to the expected format (matching WASM response shape)
      return {
        matched_gps_point: result.matched_gps_point,
        candidates: result.new_candidates,
        speed_mean_k: result.new_speed_mean,
        speed_std_k: result.new_speed_std,
        edge_initial_bearing:
          result.matched_gps_point?.edge_initial_bearing ?? 0,
      };
    } catch (e) {
      console.error("[NativeMapMatcher] Failed to parse match result:", e);
      return null;
    }
  }

  reset(): void {
    this.currentTile = null;
    this.requestedTile = null;
  }

  getIsReady(): boolean {
    return this.isReady;
  }
}

export const nativeMapMatcher = new NativeMapMatcher();
