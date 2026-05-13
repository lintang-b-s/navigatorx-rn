import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { Dimensions } from "react-native";

import { CameraRef } from "@maplibre/maplibre-react-native";
import {
  DEFAULT_CONSTANT_SPEED,
  GPS_INTERVAL_MS,
  INVALID_LAT,
  INVALID_LON,
  MAX_ANIMATION_DURATION,
  MIN_ANIMATION_DURATION,
} from "../lib/constants";
import { Candidate, Coord, Gps } from "../lib/mapmatchApi";
import {
  MapMatchResponseData,
  nativeMapMatcher,
} from "../lib/nativeMapMatcher";
import { isUserOffTheRoute } from "../lib/routing";
import { NavigationState } from "../lib/types";
import { haversineDistance, isAccuracyGood } from "../lib/util";

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
  animDuration: any;
  cameraRef: React.RefObject<CameraRef | null>;
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
    animDuration,
    cameraRef,
  } = params;

  // Track last GPS update time for dead reckoning timeout
  const lastGpsUpdateTimeRef = useRef<number>(0);
  const prevTimeRef = useRef<Date>(new Date());

  // Use refs for values that should be accessed but not trigger effect re-runs
  const destinationLocRef = useRef(destinationLoc);
  destinationLocRef.current = destinationLoc;

  const setNavigationStateRef = useRef(setNavigationState);
  setNavigationStateRef.current = setNavigationState;

  const setSnappedEdgeIDRef = useRef(setSnappedEdgeID);
  setSnappedEdgeIDRef.current = setSnappedEdgeID;

  const setRawGpsLocRef = useRef(setRawGpsLoc);
  setRawGpsLocRef.current = setRawGpsLoc;

  const setSpeedRef = useRef(setSpeed);
  setSpeedRef.current = setSpeed;

  const setRouteStartedRef = useRef(setRouteStarted);
  setRouteStartedRef.current = setRouteStarted;

  const setRouteDataRef = useRef(setRouteData);
  setRouteDataRef.current = setRouteData;

  const setPolylineDataRef = useRef(setPolylineData);
  setPolylineDataRef.current = setPolylineData;

  const setAlternativeRoutesLineDataRef = useRef(setAlternativeRoutesLineData);
  setAlternativeRoutesLineDataRef.current = setAlternativeRoutesLineData;

  const setActiveRouteRef = useRef(setActiveRoute);
  setActiveRouteRef.current = setActiveRoute;

  const setNextTurnIndexRef = useRef(setNextTurnIndex);
  setNextTurnIndexRef.current = setNextTurnIndex;

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
      setNavigationStateRef.current((prev) => ({
        ...prev,
        matchedGpsLoc: undefined,
        matchedHeading: 0,
      }));
      setSnappedEdgeIDRef.current(0);
      currentGpsLocRef.current = null;
      currentHeadingRef.current = 0;
      return;
    }

    let watchSubscription: Location.LocationSubscription | null = null;

    /**
     * Checks if user has arrived at destination, mirrors FE logic.
     */
    const checkArrival = () => {
      if (
        destinationLocRef.current &&
        !hasArrived.current &&
        currentGpsLocRef.current
      ) {
        const distToDest =
          haversineDistance(
            currentGpsLocRef.current.lat,
            currentGpsLocRef.current.lon,
            destinationLocRef.current.osm_object.lat,
            destinationLocRef.current.osm_object.lon,
          ) * 1000;

        if (distToDest < 30) {
          // USER_HAS_ARRIVED_DESTINATION_DISTANCE
          hasArrived.current = true;
          setRouteStartedRef.current(false);
          setRouteDataRef.current(undefined);
          setPolylineDataRef.current(undefined);
          setAlternativeRoutesLineDataRef.current([]);
          setActiveRouteRef.current(0);
          activeRouteRef.current = 0;
          setNextTurnIndexRef.current(-1);
          setNavigationStateRef.current({
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
          resp.matched_gps_point.matched_coord.lat === INVALID_LAT &&
          resp.matched_gps_point.matched_coord.lon === INVALID_LON
        ) {
          // Reset — matcher lost track
          mapMatchStep.current = 1;
          candidates.current = [];
          speedMeanK.current = DEFAULT_CONSTANT_SPEED;
          speedStdK.current = DEFAULT_CONSTANT_SPEED;
          lastBearing.current = 0.0;
          setNavigationStateRef.current((prev) => ({
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
                setActiveRouteRef.current(otherRouteIndex);
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
          setNavigationStateRef.current((prev) => ({
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
              zoom: 16,
              duration: 1000,
              easing: "linear",
              padding: {
                top: screenHeight * 0.62,
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

          // Set animation targets (Direct jump, interpolation happens in CarMarker)
          animDuration.value = duration * 1000;
          animLat.value = matched.lat;
          animLon.value = matched.lon;
          animHeading.value = targetHContinuous;

          // Update ref values for interpolation targets
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
              zoom: 16,
              duration: duration * 1000,
              easing: "linear",
              padding: {
                top: screenHeight * 0.62,
                bottom: 0,
                left: 0,
                right: 0,
              },
            });
          }
        }

        setSnappedEdgeIDRef.current(resp.matched_gps_point.roadnetwork_edge_id);
        checkArrival();
      } catch (err) {
        console.error("[LocationTracking] Failed to process match:", err);
      }
    };

    const processGpsUpdate = async (location: {
      coords: {
        latitude: number;
        longitude: number;
        speed?: number | null;
        accuracy?: number | null;
      };
    }) => {
      if (!routeStarted) return;

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
        accuracy: location.coords.accuracy ?? null,
      };

      // Update last GPS time for dead reckoning detection
      lastGpsUpdateTimeRef.current = Date.now();
      prevTimeRef.current = currentTime;

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
      setRawGpsLocRef.current({ lat: currentGps.lat, lon: currentGps.lon });
      setSpeedRef.current(currentGps.speed);
      prevGps.current = currentGps;
    };

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return;
      }

      // ini expo-location pakai FusedLocationProvider android API see requestLocationUpdates dan AsyncFunction("watchPositionImplAsync")) : https://github.com/expo/expo/blob/main/packages/expo-location/android/src/main/java/expo/modules/location/LocationModule.kt
      // locationRequest https://github.com/expo/expo/blob/main/packages/expo-location/android/src/main/java/expo/modules/location/LocationHelpers.kt
      // industry best practices (update rate 1hz / watchPositionAsync timeInterval 1s): https://developer.tomtom.com/navigation/android/guides/navigation/map-matching
      // dan https://docs.mapbox.com/archive/android/navigation/api/core/0.24.0/com/mapbox/services/android/navigation/v5/navigation/MapboxNavigation.html
      // mapsme pakai interval 500ms (minInterval nya 500ms/2): https://github.com/mapsme/omim/blob/master/android/src/com/mapswithme/maps/location/LocationHelper.java
      // osmand pakai mininterval 500ms juga: https://github.com/osmandapp/OsmAnd/blob/master/OsmAnd/src/net/osmand/plus/helpers/GmsLocationServiceHelper.java

      // idk ikut yang mana, tapi OsmAnd & maps.me pakai interval 500ms , default expo-location juga 500ms
      // app maps.me dan OsmAnd di googleplay  (https://play.google.com/store/apps/details?id=com.mapswithme.maps.pro dan https://play.google.com/store/apps/details?id=net.osmand&hl=en) 
      // review nya bagus & user nya banyak (legit). di code mereka juga ada filter gps by its accuracy, jadi kita ikutin aja wkwkwk
      watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          // timeInterval: 1000, 
          distanceInterval: 0,
        },
        async (location) => {
          if (
            location.coords.accuracy != null && // https://developer.android.com/reference/kotlin/android/location/Location#getaccuracy
            location.coords.speed != null &&
            prevGps.current &&
            prevGps.current.accuracy != null &&
            !isAccuracyGood(
              location.coords.speed,
              (location.timestamp - prevGps.current.time.getTime()) / 1000.0,
              prevGps.current.accuracy,
              prevGps.current.speed,
              location.coords.accuracy,
            )
          ) {
            return;
          }
          processGpsUpdate(location);
        },
      );
    };

    startTracking();

    return () => {
      if (watchSubscription) watchSubscription.remove();
    };
  }, [
    routeStarted,
    activeRouteRef,
    animDuration,
    animHeading,
    animLat,
    animLon,
    candidates,
    cameraRef,
    currentGpsLocRef,
    currentHeadingRef,
    deadReckoning,
    hasArrived,
    isInitialReroutePerformed,
    lastBearing,
    lastMatchedPointRef,
    mapMatchStep,
    prevGps,
    routeDataRef,
    snappedEdgeIDRef,
    speedMeanK,
    speedStdK,
    startTimeRef,
    totalDistanceTraveledRef,
  ]);
}
