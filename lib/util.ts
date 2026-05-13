import {
  DEFAULT_MIN_SPEED_MPS,
  EARTH_RADIUS_KM,
  EPS,
  EQUATORIAL_RADIUS_METERS,
  TRUNCATE_STRING_DEFAULT_LENGTH,
} from "./constants";

export function truncateString(
  str: string,
  maxLength: number = TRUNCATE_STRING_DEFAULT_LENGTH,
) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

export function getArrivalTime(
  etaMinutes: number,
  baseDate: Date = new Date(),
) {
  const arrivalDate = new Date(baseDate.getTime() + etaMinutes * 60 * 1000);

  let hours = arrivalDate.getHours();
  const minutes = arrivalDate.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  const minuteStr = minutes.toString().padStart(2, "0");

  return `${hours}:${minuteStr} ${ampm}`;
}

function toRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

function hav(angleRad: number): number {
  return (1 - Math.cos(angleRad)) / 2;
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a = hav(Δφ) + Math.cos(φ1) * Math.cos(φ2) * hav(Δλ);
  const c = 2 * Math.asin(Math.sqrt(a));

  return EARTH_RADIUS_KM * c;
}

// https://wiki.openstreetmap.org/wiki/Mercator#JavaScript_(or_ActionScript)

const PI = Math.PI;
const RAD2DEG = 180 / PI;
const DEG2RAD = PI / 180;
const R = EQUATORIAL_RADIUS_METERS;

function y2lat(y: number): number {
  return (2 * Math.atan(Math.exp(y / R)) - PI / 2) * RAD2DEG;
}
function x2lon(x: number): number {
  return RAD2DEG * (x / R);
}

function lat2y(lat: number): number {
  return Math.log(Math.tan(PI / 4 + (lat * DEG2RAD) / 2)) * R;
}
function lon2x(lon: number): number {
  return lon * DEG2RAD * R;
}

// spherical mercator
export function project(lat: number, lon: number): { x: number; y: number } {
  return { x: lon2x(lon), y: lat2y(lat) };
}

export function unproject(x: number, y: number): { lat: number; lon: number } {
  return { lat: y2lat(y), lon: x2lon(x) };
}

export function mercatorDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = project(lat1, lon1);
  const p2 = project(lat2, lon2);
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function mercatorDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return mercatorDistance(lat1, lon1, lat2, lon2) / 1000;
}

export { EPS };

// floating point comparison operators

export function Eq(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

export function EqEps(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

export function Lt(a: number, b: number): boolean {
  return a + EPS < b;
}

export function Le(a: number, b: number): boolean {
  return a <= b + EPS;
}

export function Gt(a: number, b: number): boolean {
  return Lt(b, a);
}

export function Ge(a: number, b: number): boolean {
  return Le(b, a);
}

export function isAccuracyGood(
  gpsSpeed: number,
  timeDiff: number, // timeDiff in seconds
  lastAccuracy: number,
  lastGpsSpeed: number,
  accuracy: number,
) {
  const speed = Math.max(
    DEFAULT_MIN_SPEED_MPS,
    (gpsSpeed + lastGpsSpeed) / 2.0,
  );
  const lastAccuracyGreater = lastAccuracy + speed * timeDiff;
  return Lt(accuracy, lastAccuracyGreater);
}

