import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import {
  Easing,
  useAnimatedReaction,
  withTiming,
} from "react-native-reanimated";
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
import { isUserOffTheRoute } from "../lib/routing";
import { NavigationState } from "../lib/types";
import { haversineDistance } from "../lib/util";

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
  routeDataRef: React.MutableRefObject<any[] | undefined>;
  activeRouteRef: React.MutableRefObject<number>;
  snappedEdgeIDRef: React.MutableRefObject<number>;
  destinationLoc: any;
  hasArrived: React.MutableRefObject<boolean>;
  // State setters
  setSnappedEdgeID: (id: number) => void;
  setNavigationState: React.Dispatch<React.SetStateAction<NavigationState>>;
  setRawGpsLoc: (loc: Coord) => void;
  setSpeed: (speed: number) => void;
  setRouteStarted: (val: boolean) => void;
  setRouteData: (data: any[] | undefined) => void;
  setPolylineData: (data: any) => void;
  setAlternativeRoutesLineData: (data: any[]) => void;
  setActiveRoute: (index: number) => void;
  setNextTurnIndex: (index: number) => void;
  animLat: any;
  animLon: any;
  animHeading: any;
  cameraRef: React.RefObject<any>;
}

/**
 * Replaces navigator.geolocation.watchPosition with expo-location.
 * Handles GPS → map match → smooth animation pipeline.
 * Follows the exact logic from navigatorx-crp-fe app/page.tsx.
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
    routeDataRef,
    activeRouteRef,
    snappedEdgeIDRef,
    destinationLoc,
    hasArrived,
    setSnappedEdgeID,
    setNavigationState,
    setRawGpsLoc,
    setSpeed,
    setRouteStarted,
    setRouteData,
    setPolylineData,
    setAlternativeRoutesLineData,
    setActiveRoute,
    setNextTurnIndex,
    animLat,
    animLon,
    animHeading,
    cameraRef,
  } = params;

  // Track last GPS update time for dead reckoning timeout
  const lastGpsUpdateTimeRef = useRef<number>(0);
  const prevTimeRef = useRef<Date>(new Date());

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
      lastGpsUpdateTimeRef.current = 0;
      isInitialReroutePerformed.current = false;
      hasArrived.current = false;
      setNavigationState((prev) => ({
        ...prev,
        matchedGpsLoc: undefined,
        matchedHeading: 0,
      }));
      setSnappedEdgeID(0);
      currentGpsLocRef.current = null;
      currentHeadingRef.current = 0;
      return;
    }

    let watchSubscription: Location.LocationSubscription | null = null;

    /**
     * Checks if user has arrived at destination, mirrors FE logic.
     */
    const checkArrival = () => {
      if (destinationLoc && !hasArrived.current && currentGpsLocRef.current) {
        const distToDest =
          haversineDistance(
            currentGpsLocRef.current.lat,
            currentGpsLocRef.current.lon,
            destinationLoc.osm_object.lat,
            destinationLoc.osm_object.lon,
          ) * 1000;

        if (distToDest < 30) {
          // USER_HAS_ARRIVED_DESTINATION_DISTANCE
          hasArrived.current = true;
          setRouteStarted(false);
          setRouteData(undefined);
          setPolylineData(undefined);
          setAlternativeRoutesLineData([]);
          setActiveRoute(0);
          activeRouteRef.current = 0;
          setNextTurnIndex(-1);
          setNavigationState({
            matchedGpsLoc: undefined,
            matchedHeading: 0,
            distanceFromNextTurnPoint: 0,
            currentDirectionIndex: 0,
            timeSpent: 0,
            distanceTraveled: 0,
          });
        }
      }
    };

    const handleMapMatchResponse = (resp: MapMatchResponseData | null) => {
      try {
        if (!resp) {
          return;
        }

        // Check if map matcher lost track of the vehicle
        if (
          resp.matched_gps_point.matched_coord.lat == INVALID_LAT &&
          resp.matched_gps_point.matched_coord.lon == INVALID_LON
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

        candidates.current = resp.candidates;
        speedMeanK.current = resp.speed_mean_k;
        speedStdK.current = resp.speed_std_k;
        lastBearing.current = resp.edge_initial_bearing;

        const targetHeading = resp.edge_initial_bearing;
        const matched = resp.matched_gps_point.matched_coord;

        // Track time and distance
        if (!startTimeRef.current) {
          startTimeRef.current = new Date();
          lastMatchedPointRef.current = {
            lat: matched.lat,
            lon: matched.lon,
          };
        } else if (lastMatchedPointRef.current) {
          const dist = haversineDistance(
            lastMatchedPointRef.current.lat,
            lastMatchedPointRef.current.lon,
            matched.lat,
            matched.lon,
          );
          totalDistanceTraveledRef.current += dist;
          lastMatchedPointRef.current = {
            lat: matched.lat,
            lon: matched.lon,
          };
        }

        // --- Rerouting check: detect if user switched to another route ---
        const usedRoute = routeDataRef.current?.[activeRouteRef.current];
        if (
          usedRoute &&
          snappedEdgeIDRef.current !== -1 &&
          mapMatchStep.current > 1
        ) {
          const isOffRoute = isUserOffTheRoute({
            snappedEdgeID: snappedEdgeIDRef.current,
            routeData: usedRoute,
          });

          if (isOffRoute) {
            // Check if user moved to another existing route
            const allRoutes = routeDataRef.current;
            if (allRoutes) {
              const otherRouteIndex = allRoutes.findIndex(
                (route, idx) =>
                  idx !== activeRouteRef.current &&
                  !isUserOffTheRoute({
                    snappedEdgeID: snappedEdgeIDRef.current,
                    routeData: route,
                  }),
              );

              if (otherRouteIndex !== -1) {
                setActiveRoute(otherRouteIndex);
                activeRouteRef.current = otherRouteIndex;
              }
            }
          }
        }

        if (!currentGpsLocRef.current) {
          // First match — set immediately
          currentGpsLocRef.current = { lat: matched.lat, lon: matched.lon };
          currentHeadingRef.current = targetHeading;
          animLat.value = matched.lat;
          animLon.value = matched.lon;
          animHeading.value = targetHeading;
          setNavigationState((prev) => ({
            ...prev,
            matchedGpsLoc: { lat: matched.lat, lon: matched.lon },
            matchedHeading: targetHeading,
          }));

          // Directly move the map camera (easeTo handles the glide)
          if (cameraRef.current) {
            const screenHeight = Dimensions.get("window").height;
            cameraRef.current.easeTo({
              center: [matched.lon, matched.lat],
              bearing: targetHeading,
              zoom: 17,
              duration: 1000,
              easing: "linear",
              padding: {
                top: screenHeight * (2 / 3),
                bottom: 0,
                left: 0,
                right: 0,
              },
            });
          }
        } else {
          // Smooth interpolation via Reanimated (replaces GSAP)
          let duration = 0.5;
          // Match FE logic: use both prevGps and current GPS time for duration
          if (prevGps.current?.time instanceof Date) {
            const prevMs = prevGps.current.time.getTime();
            duration = (Date.now() - prevMs) / 1000;
          }
          duration = Math.max(
            MIN_ANIMATION_DURATION,
            Math.min(duration, MAX_ANIMATION_DURATION),
          );

          // Handle heading wrap-around
          let diff = targetHeading - currentHeadingRef.current;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          const targetHContinuous = currentHeadingRef.current + diff;

          // Set animation targets
          animLat.value = withTiming(matched.lat, {
            duration: duration * 1000,
            easing: Easing.linear,
          });

          animLon.value = withTiming(matched.lon, {
            duration: duration * 1000,
            easing: Easing.linear,
          });
          animHeading.value = withTiming(targetHContinuous, {
            duration: duration * 1000,
            easing: Easing.linear,
          });

          // Update ref values for interpolation
          currentGpsLocRef.current = { lat: matched.lat, lon: matched.lon };
          const targetHContinuousNormalized =
            ((targetHContinuous % 360) + 360) % 360;
          currentHeadingRef.current = targetHContinuousNormalized;

          // Directly move the map camera (easeTo handles the glide)

          if (cameraRef.current) {
            const screenHeight = Dimensions.get("window").height;
            cameraRef.current.easeTo({
              center: [matched.lon, matched.lat],
              bearing: targetHContinuous,
              zoom: 17,
              duration: duration * 1000,
              easing: "linear",
              padding: {
                top: screenHeight * (2 / 3),
                bottom: 0,
                left: 0,
                right: 0,
              },
            });
          }
        }

        setSnappedEdgeID(resp.matched_gps_point.edge_id);
        checkArrival();
      } catch (err) {
        console.error("[LocationTracking] Failed to process match:", err);
      }
    };

    const processGpsUpdate = async (location: {
      coords: { latitude: number; longitude: number; speed?: number | null };
    }) => {
      const currentTime = new Date();
      deadReckoning.current = false;
      let deltaTime = 0;
      let speed = 0.0;
      let distance = 0;
      if (mapMatchStep.current > 1 && prevGps.current) {
        deltaTime =
          (currentTime.getTime() -
            (prevGps.current.time instanceof Date
              ? prevGps.current.time.getTime()
              : 0)) /
          1000.0;

        distance =
          haversineDistance(
            prevGps.current.lat,
            prevGps.current.lon,
            location.coords.latitude,
            location.coords.longitude,
          ) * 1000;
      }

      if (
        location.coords.speed !== null &&
        location.coords.speed !== undefined
      ) {
        speed = location.coords.speed;
      } else if (deltaTime > 0) {
        speed = distance / deltaTime;
      }

      const currentGps: Gps = {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        speed,
        delta_time: mapMatchStep.current === 1 ? 0 : deltaTime,
        time: currentTime,
        dead_reckoning: false,
      };

      // Speed threshold: skip if stationary (but not the first step)
      if (
        (speed < MIN_SPEED_THRESHOLD ||
          speedMeanK.current < MIN_SPEED_THRESHOLD) &&
        distance < THROTTLE_DISTANCE_THRESHOLD &&
        mapMatchStep.current > 1
      ) {
        return;
      }

      // Update last GPS time for dead reckoning detection
      lastGpsUpdateTimeRef.current = Date.now();
      prevTimeRef.current = currentTime;

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
    };

    const startTracking = async () => {
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
    };

    startTracking();

    return () => {
      if (watchSubscription) watchSubscription.remove();
    };
  }, [routeStarted]);

  // Bridge Reanimated SharedValues to refs so downstream consumers (useNavigationSync, CarMarker) can read them
  useAnimatedReaction(
    () => ({
      lat: animLat.value,
      lon: animLon.value,
      heading: animHeading.value,
    }),
    (result) => {
      currentGpsLocRef.current = { lat: result.lat, lon: result.lon };
      currentHeadingRef.current = result.heading;
    },
  );
}
