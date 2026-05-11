import geohash from "ngeohash";
import MapMatcher from "../modules/map-matcher";
import { API_CONFIG } from "./config";
import {
  MAP_MATCHER_GEOHASH_PRECISION,
  MAP_MATCHER_MAX_RETRIES,
  MAP_MATCHER_RETRY_DELAY_MS,
} from "./constants";
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

  private abortController: AbortController | null = null;

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
   * The backend endpoint /api/tile/:gh already returns the geohash and its 8 neighbors.
   */
  async loadTile(lat: number, lon: number): Promise<boolean> {
    if (!this.isReady) return false;

    const gh = geohash.encode(lat, lon, MAP_MATCHER_GEOHASH_PRECISION);
    if (this.currentTile === gh) return false;
    this.requestedTile = gh;

    // If already loading this exact tile, wait for it instead of skipping
    if (this.loadingTiles.has(gh)) {
      console.log(`waiting graph to complete its rebuild, geohash tile ${gh}`);
      return this.currentTile === gh;
    }

    this.loadingTiles.add(gh);

    let success = false;
    let tileData: Uint8Array | null = null;

    for (let attempt = 1; attempt <= MAP_MATCHER_MAX_RETRIES; attempt++) {
      // Abort any existing fetch
      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();
      const currentController = this.abortController;

      const startTime = Date.now();
      try {
        const cacheBuster = `?cb=${Date.now()}`;
        console.log(
          `[NativeMapMatcher] Fetching tile ${gh} (Attempt ${attempt}/${MAP_MATCHER_MAX_RETRIES})... `,
        );

        const response = await fetch(
          `${this.apiUrl}/api/tile/${gh}${cacheBuster}`,
          {
            signal: currentController.signal,
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Accept: "*/*",
            },
          },
        );

        if (!response.ok) {
          console.warn(
            `[NativeMapMatcher] Tile ${gh} failed (Status ${response.status})`,
          );
          // Don't retry if it's a client error (tile file not found or bad request)
          if (response.status === 400 || response.status === 404) {
            break;
          }
          continue;
        }

        const tileBuffer = await response.arrayBuffer();
        tileData = new Uint8Array(tileBuffer);
        success = true;
        console.log(
          `[NativeMapMatcher] Tile ${gh} downloaded in ${Date.now() - startTime}ms`,
        );
        break;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        if (error.name === "AbortError") {
          console.log(
            `[NativeMapMatcher] Tile ${gh} fetch was aborted (new request requested) after ${duration}ms`,
          );
          return false; // Exit if we aborted on purpose
        } else {
          console.warn(
            `[NativeMapMatcher] Tile ${gh} attempt ${attempt} error:`,
            error.message,
          );
        }
        await new Promise((r) => setTimeout(r, MAP_MATCHER_RETRY_DELAY_MS));
      }
    }

    if (!success || !tileData) {
      console.error(
        `[NativeMapMatcher] Failed to load tile ${gh} after ${MAP_MATCHER_MAX_RETRIES} attempts.`,
      );
      this.loadingTiles.delete(gh);
      return false;
    }

    // Process the successful download
    try {
      if (this.requestedTile !== gh) {
        this.loadingTiles.delete(gh);
        return false;
      }
      console.log(`[NativeMapMatcher] Rebuilding graph for tile ${gh}...`);
      MapMatcher.rebuildGraph(tileData);
      this.currentTile = gh;
      this.loadingTiles.delete(gh);
      return true;
    } catch (err) {
      console.error(
        `[NativeMapMatcher] Error rebuilding graph for tile ${gh}:`,
        err,
      );
      this.loadingTiles.delete(gh);
      return false;
    }
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
