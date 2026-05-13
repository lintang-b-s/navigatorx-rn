export const EPS = 1e-9;
export const INVALID_LAT = 91;
export const INVALID_LON = 181;
export const RAD_TO_DEG = 180 / Math.PI;
export const DEFAULT_CONSTANT_SPEED = 8.3333; // m/s (approx 30 km/h)
export const MAP_MATCH_SAMPLING_INTERVAL = 1.0; // seconds
export const LOST_GPS_THRESHOLD = 2000; // ms
export const UPDATE_NAVIGATION_STATE_THRESHOLD_MS = 25; // ms
export const MIN_ANIMATION_DURATION = 0.1; // second (100ms)
export const MAX_ANIMATION_DURATION = 1; // seconds
export const USER_HAS_ARRIVED_DESTINATION_DISTANCE = 15; // meter
export const UPDATE_TURN_INSTRUCTION_DISTANCE_MIN = 1; // meter

// Map Matching Constants
export const MAP_MATCHER_GEOHASH_PRECISION = 6;
export const MAP_MATCHER_MAX_RETRIES = 4;
export const MAP_MATCHER_RETRY_DELAY_MS = 10;
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36";

// Geographical Constants
export const EARTH_RADIUS_KM = 6371.0;
export const EQUATORIAL_RADIUS_METERS = 6378137.0;

// Utility Constants
export const TRUNCATE_STRING_DEFAULT_LENGTH = 30;

// API Constants
export const INVALID_EDGE_ID = 1000000001;
export const ALTERNATIVE_ROUTES_COUNT = 2;

export const DEFAULT_MIN_SPEED_MPS = 5;
export const GPS_INTERVAL_MS = 500;
