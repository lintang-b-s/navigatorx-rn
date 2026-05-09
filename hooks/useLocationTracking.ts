import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import {
  DEFAULT_CONSTANT_SPEED,
  INVALID_LAT,
  INVALID_LON,
  MAX_ANIMATION_DURATION,
  MIN_ANIMATION_DURATION,
  MIN_SPEED_THRESHOLD,
  THROTTLE_DISTANCE_THRESHOLD,
} from "../lib/constants";
import { Candidate, Coord, Gps } from "../lib/mapmatchApi";
import {
  MapMatchResponseData,
  nativeMapMatcher,
} from "../lib/nativeMapMatcher";
import { NavigationState } from "../lib/types";
import { haversineDistance } from "../lib/util";
import { useSimulation } from "./useSimulation";

const normalizeBearing = (bearing: number) => {
  return ((bearing % 360) + 360) % 360;
};

interface UseLocationTrackingParams {
  routeStarted: boolean;
  // Refs from useNavigation
  currentGpsLocRef: React.MutableRefObject<Coord | null>;
  currentHeadingRef: React.MutableRefObject<number>;
  lastMatchedPointRef: React.MutableRefObject<Coord | null>;
  startTimeRef: React.MutableRefObject<Date | null>;
  totalDistanceTraveledRef: React.MutableRefObject<number>;
  candidates: React.MutableRefObject<Candidate[]>;
  speedMeanK: React.MutableRefObject<number>;
  speedStdK: React.MutableRefObject<number>;
  lastBearing: React.MutableRefObject<number>;
  prevGps: React.MutableRefObject<Gps | undefined>;
  mapMatchStep: React.MutableRefObject<number>;
  deadReckoning: React.MutableRefObject<boolean>;
  isInitialReroutePerformed: React.MutableRefObject<boolean>;
  isSimulation: boolean;
  // State setters
  setSnappedEdgeID: (id: number) => void;
  setNavigationState: React.Dispatch<React.SetStateAction<NavigationState>>;
  setRawGpsLoc: (loc: Coord) => void;
  setSpeed: (speed: number) => void;
}

/**
 * Replaces navigator.geolocation.watchPosition with expo-location.
 * Handles GPS → map match → smooth animation pipeline.
 * Includes dead reckoning when GPS is lost.
 */
export function useLocationTracking(params: UseLocationTrackingParams) {
  const {
    routeStarted,
    currentGpsLocRef,
    currentHeadingRef,
    lastMatchedPointRef,
    startTimeRef,
    totalDistanceTraveledRef,
    candidates,
    speedMeanK,
    speedStdK,
    lastBearing,
    prevGps,
    mapMatchStep,
    deadReckoning,
    isInitialReroutePerformed,
    isSimulation,
    setSnappedEdgeID,
    setNavigationState,
    setRawGpsLoc,
    setSpeed,
  } = params;

  const simulation = useSimulation(routeStarted && isSimulation);

  // Animation refs for smooth interpolation (replaces GSAP)
  const animTargetRef = useRef<{ lat: number; lon: number; heading: number }>({
    lat: 0,
    lon: 0,
    heading: 0,
  });
  const animStartRef = useRef<{ lat: number; lon: number; heading: number }>({
    lat: 0,
    lon: 0,
    heading: 0,
  });
  const animStartTimeRef = useRef<number>(0);
  const animDurationRef = useRef<number>(0.5);

  useEffect(() => {
    if (!routeStarted) {
      // Reset state when navigation stops
      mapMatchStep.current = 1;
      candidates.current = [];
      speedMeanK.current = DEFAULT_CONSTANT_SPEED;
      speedStdK.current = DEFAULT_CONSTANT_SPEED;
      lastBearing.current = 0.0;
      prevGps.current = undefined;
      deadReckoning.current = false;
      setNavigationState((prev) => ({
        ...prev,
        matchedGpsLoc: undefined,
        matchedHeading: 0,
      }));
      setSnappedEdgeID(0);
      isInitialReroutePerformed.current = false;
      currentGpsLocRef.current = null;
      currentHeadingRef.current = 0;
      return;
    }

    let watchSubscription: Location.LocationSubscription | null = null;
    let simulationInterval: ReturnType<typeof setInterval> | null = null;
    let lastGpsTimestamp = Date.now();
    let prevTime: Date = new Date();

    const handleMapMatchResponse = (resp: MapMatchResponseData) => {
      try {
        if (
          !resp ||
          !resp.matched_gps_point ||
          !resp.matched_gps_point.matched_coord ||
          resp.matched_gps_point.matched_coord.lat === INVALID_LAT ||
          resp.matched_gps_point.matched_coord.lon === INVALID_LON
        ) {
          // Reset — matcher lost track
          mapMatchStep.current = 1;
          candidates.current = [];
          speedMeanK.current = DEFAULT_CONSTANT_SPEED;
          speedStdK.current = DEFAULT_CONSTANT_SPEED;
          lastBearing.current = 0.0;
          setNavigationState((prev) => ({
            ...prev,
            matchedHeading: 0,
            matchedGpsLoc: undefined,
          }));
          currentGpsLocRef.current = null;
          currentHeadingRef.current = 0;
          return;
        }

        if (deadReckoning.current) {
          prevGps.current = {
            lat: resp.matched_gps_point.predicted_gps_coord.lat,
            lon: resp.matched_gps_point.predicted_gps_coord.lon,
            speed: resp.speed_mean_k,
            time: prevTime,
            delta_time: 0,
            dead_reckoning: true,
          };
        }

        candidates.current = resp.candidates;
        speedMeanK.current = resp.speed_mean_k;
        speedStdK.current = resp.speed_std_k;
        lastBearing.current = resp.edge_initial_bearing;

        const targetHeading = normalizeBearing(resp.edge_initial_bearing);
        const matched = resp.matched_gps_point.matched_coord;

        // Track time and distance
        if (!startTimeRef.current) {
          startTimeRef.current = new Date();
          lastMatchedPointRef.current = { lat: matched.lat, lon: matched.lon };
        } else if (lastMatchedPointRef.current) {
          const dist = haversineDistance(
            lastMatchedPointRef.current.lat,
            lastMatchedPointRef.current.lon,
            matched.lat,
            matched.lon,
          );
          totalDistanceTraveledRef.current += dist;
          lastMatchedPointRef.current = { lat: matched.lat, lon: matched.lon };
        }

        if (!currentGpsLocRef.current) {
          // First match — set immediately
          currentGpsLocRef.current = { lat: matched.lat, lon: matched.lon };
          currentHeadingRef.current = targetHeading;
          setNavigationState((prev) => ({
            ...prev,
            matchedGpsLoc: { lat: matched.lat, lon: matched.lon },
            matchedHeading: targetHeading,
          }));
        } else {
          // Smooth interpolation via refs (replaces GSAP)
          let duration = 0.5;
          if (prevGps.current?.time) {
            const prevMs =
              prevGps.current.time instanceof Date
                ? prevGps.current.time.getTime()
                : 0;
            duration = (Date.now() - prevMs) / 1000;
          }
          duration = Math.max(
            MIN_ANIMATION_DURATION,
            Math.min(duration, MAX_ANIMATION_DURATION),
          );

          // Set up interpolation targets
          animStartRef.current = {
            lat: currentGpsLocRef.current.lat,
            lon: currentGpsLocRef.current.lon,
            heading: currentHeadingRef.current,
          };

          // Handle heading wrap-around
          let diff = targetHeading - currentHeadingRef.current;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          const targetHContinuous = currentHeadingRef.current + diff;

          animTargetRef.current = {
            lat: matched.lat,
            lon: matched.lon,
            heading: targetHContinuous,
          };
          animStartTimeRef.current = Date.now();
          animDurationRef.current = duration;
        }

        setSnappedEdgeID(resp.matched_gps_point.edge_id);
      } catch (err) {
        console.error("[LocationTracking] Failed to process match:", err);
      }
    };

    const processGpsUpdate = async (location: {
      coords: { latitude: number; longitude: number; speed?: number | null };
    }) => {
      lastGpsTimestamp = Date.now();
      const currentTime = new Date();
      deadReckoning.current = false;
      let deltaTime = 0;
      let speed = 0.0;

      let distance = 1;
      if (
        location.coords.speed !== null &&
        location.coords.speed !== undefined &&
        location.coords.speed >= 0
      ) {
        speed = location.coords.speed;
      } else if (mapMatchStep.current > 1 && prevGps.current) {
        deltaTime =
          (currentTime.getTime() -
            (prevGps.current?.time instanceof Date
              ? prevGps.current.time.getTime()
              : 0)) /
          1000.0;
        distance =
          haversineDistance(
            prevGps.current?.lat ?? 0,
            prevGps.current?.lon ?? 0,
            location.coords.latitude,
            location.coords.longitude,
          ) * 1000;
        if (deltaTime > 0) {
          speed = distance / deltaTime;
        }
      }

      const currentGps: Gps = {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        speed,
        delta_time: mapMatchStep.current === 1 ? 0 : deltaTime,
        time: currentTime,
        dead_reckoning: false,
      };

      // Speed threshold: skip if stationary
      if (
        (speed < MIN_SPEED_THRESHOLD ||
          speedMeanK.current < MIN_SPEED_THRESHOLD) &&
        distance < THROTTLE_DISTANCE_THRESHOLD &&
        mapMatchStep.current > 1
      ) {
        return;
      }

      // Load tile asynchronously (non-blocking)
      void nativeMapMatcher.loadTile(
        location.coords.latitude,
        location.coords.longitude,
      );
     
      // Perform map matching
      const resp = nativeMapMatcher.onlineMapMatch(
        { ...currentGps },
        mapMatchStep.current,
        candidates.current,
        speedMeanK.current,
        speedStdK.current,
        lastBearing.current,
      );

      if (resp) handleMapMatchResponse(resp);

      mapMatchStep.current += 1;
      setRawGpsLoc({ lat: currentGps.lat, lon: currentGps.lon });
      setSpeed(currentGps.speed);
      prevGps.current = currentGps;
      prevTime = currentTime;
    };

    const startTracking = async () => {
      if (isSimulation) {
        // Simulation mode
        simulationInterval = setInterval(() => {
          if (simulation.data.length === 0) return;
          const point = simulation.data[simulation.currentIndex];
          if (!point) return;

          processGpsUpdate({
            coords: {
              latitude: point.lat,
              longitude: point.lon,
              speed: point.speed,
            },
          });

          simulation.setCurrentIndex(
            (prev) => (prev + 1) % simulation.data.length,
          );
        }, 1000); // 1Hz simulation
      } else {
        // Real GPS mode
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.error("Location permission denied");
          return;
        }

        watchSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 500,
            distanceInterval: 1,
          },
          async (location) => {
            processGpsUpdate(location);
          },
        );
      }
    };

    startTracking();

    return () => {
      watchSubscription?.remove();
      if (simulationInterval) clearInterval(simulationInterval);
    };
  }, [routeStarted, isSimulation, simulation.data]);

  // Smooth interpolation loop (replaces GSAP)
  useEffect(() => {
    if (!routeStarted) return;

    let frameId: number;

    const interpolate = () => {
      const now = Date.now();
      const elapsed = (now - animStartTimeRef.current) / 1000;
      const duration = animDurationRef.current;

      if (duration > 0 && elapsed < duration && currentGpsLocRef.current) {
        const t = Math.min(elapsed / duration, 1);
        const start = animStartRef.current;
        const target = animTargetRef.current;

        currentGpsLocRef.current = {
          lat: start.lat + (target.lat - start.lat) * t,
          lon: start.lon + (target.lon - start.lon) * t,
        };
        currentHeadingRef.current =
          start.heading + (target.heading - start.heading) * t;
      }

      frameId = requestAnimationFrame(interpolate);
    };

    frameId = requestAnimationFrame(interpolate);
    return () => cancelAnimationFrame(frameId);
  }, [routeStarted]);
}
