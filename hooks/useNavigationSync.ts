import { useCallback, useRef } from "react";
import { Platform, ToastAndroid } from "react-native";
import {
    useAnimatedReaction,
    useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
    UPDATE_NAVIGATION_STATE_THRESHOLD_MS,
    UPDATE_TURN_INSTRUCTION_DISTANCE_MIN,
    USER_HAS_ARRIVED_DESTINATION_DISTANCE,
} from "../lib/constants";
import { Coord } from "../lib/mapmatchApi";
import { RouteCRPResponse } from "../lib/navigatorxApi";
import {
    getCurrentUserDirectionIndex,
    getDistanceFromUserToNextTurn,
} from "../lib/routing";
import { NavigationState } from "../lib/types";
import { haversineDistance } from "../lib/util";

const normalizeBearing = (bearing: number) => {
  "worklet";
  return ((bearing % 360) + 360) % 360;
};

/**
 * Type representing the return value of useNavigation hook.
 */
interface NavigationHookResult {
  routeStarted: boolean;
  currentGpsLocRef: React.MutableRefObject<Coord | null>;
  currentHeadingRef: React.MutableRefObject<number>;
  snappedEdgeIDRef: React.MutableRefObject<number>;
  routeDataRef: React.MutableRefObject<RouteCRPResponse[] | undefined>;
  activeRouteRef: React.MutableRefObject<number>;
  startTimeRef: React.MutableRefObject<Date | null>;
  totalDistanceTraveledRef: React.MutableRefObject<number>;
  mapMatchStep: React.MutableRefObject<number>;
  hasArrived: React.MutableRefObject<boolean>;
  lastMatchedPointRef: React.MutableRefObject<Coord | null>;
  navigationState: NavigationState;
  setNavigationState: React.Dispatch<React.SetStateAction<NavigationState>>;
  setSnappedEdgeID: (id: number) => void;
  destinationLoc: any;
  setRouteStarted: (val: boolean) => void;
  setRouteData: (data: RouteCRPResponse[] | undefined) => void;
  setPolylineData: (data: any) => void;
  setAlternativeRoutesLineData: (data: any[]) => void;
  setActiveRoute: (index: number) => void;
  setNextTurnIndex: (index: number) => void;
  animLat: any;
  animLon: any;
  animHeading: any;
}

/**
 * High-performance sync loop using Reanimated to update UI state at a throttled rate.
 */
export function useNavigationSync(nav: NavigationHookResult) {
  const {
    routeStarted,
    snappedEdgeIDRef,
    routeDataRef,
    activeRouteRef,
    startTimeRef,
    totalDistanceTraveledRef,
    mapMatchStep,
    hasArrived,
    navigationState,
    setNavigationState,
    destinationLoc,
    setRouteStarted,
    setRouteData,
    setPolylineData,
    setAlternativeRoutesLineData,
    setActiveRoute,
    setNextTurnIndex,
    animLat,
    animLon,
    animHeading,
  } = nav;

  // Tracking refs for the sync logic (on JS thread)
  const lastUpdateTimestamp = useRef(0);
  const lastLat = useRef(0);
  const lastLon = useRef(0);
  const lastH = useRef(0);
  const lastDist = useRef(0);
  const lastDirIndex = useRef(-1);

  const syncLogic = useCallback((curLat: number, curLon: number, curH: number) => {
    let updatedState: Partial<NavigationState> = {};
    let stateChanged = false;

    const usedRoute = routeDataRef.current?.[activeRouteRef.current];
    if (usedRoute) {
      const usedRouteDirections = usedRoute.driving_directions;

      // 1. Identify turn instruction index
      const directionsIndex = getCurrentUserDirectionIndex({
        snappedEdgeID: snappedEdgeIDRef.current,
        drivingDirections: usedRouteDirections,
      });

      let targetIndex = directionsIndex;
      if (
        mapMatchStep.current > 1 &&
        targetIndex === 0 &&
        usedRouteDirections.length > 1
      ) {
        targetIndex = 1;
      }

      if (directionsIndex !== lastDirIndex.current || mapMatchStep.current > 1) {
        updatedState.currentDirectionIndex = targetIndex;
        lastDirIndex.current = directionsIndex;
        stateChanged = true;
      }

      // 2. Calculate distance to next turn
      const nextTurnPoint =
        targetIndex >= 0 && usedRouteDirections[targetIndex]?.turn_point
          ? usedRouteDirections[targetIndex].turn_point
          : {
              lat: destinationLoc?.osm_object.lat ?? curLat,
              lon: destinationLoc?.osm_object.lon ?? curLon,
            };

      const newDist =
        getDistanceFromUserToNextTurn({
          matchedGpsLoc: { lat: curLat, lon: curLon },
          nextTurnPoint,
        }) * 1000.0;

      const timeSpent = startTimeRef.current
        ? (new Date().getTime() - startTimeRef.current.getTime()) / 60000
        : 0;

      if (
        Math.abs(newDist - lastDist.current) > UPDATE_TURN_INSTRUCTION_DISTANCE_MIN
      ) {
        updatedState.distanceFromNextTurnPoint = newDist;
        lastDist.current = newDist;
        stateChanged = true;
      }

      updatedState.timeSpent = timeSpent;
      updatedState.distanceTraveled = totalDistanceTraveledRef.current;
      stateChanged = true;

      // Arrival check
      if (destinationLoc && !hasArrived.current) {
        const distToDest =
          haversineDistance(
            curLat,
            curLon,
            destinationLoc.osm_object.lat,
            destinationLoc.osm_object.lon,
          ) * 1000;

        if (distToDest < USER_HAS_ARRIVED_DESTINATION_DISTANCE) {
          hasArrived.current = true;
          if (Platform.OS === "android") {
            ToastAndroid.show(
              "You have arrived at your destination!",
              ToastAndroid.LONG,
            );
          }
          setRouteStarted(false);
          setRouteData(undefined);
          setPolylineData(undefined);
          setAlternativeRoutesLineData([]);
          setActiveRoute(0);
          setNextTurnIndex(-1);
          return; // Stop processing if arrived
        }
      }
    }

    // Throttled state update for UI re-render
    const posChanged =
      Math.abs(curLat - lastLat.current) > 0.000001 ||
      Math.abs(curLon - lastLon.current) > 0.000001;
    const headingChanged = Math.abs(curH - lastH.current) > 2;

    if (posChanged || headingChanged) {
      updatedState.matchedGpsLoc = { lat: curLat, lon: curLon };
      updatedState.matchedHeading = curH;
      lastLat.current = curLat;
      lastLon.current = curLon;
      lastH.current = curH;
      stateChanged = true;
    }

    if (stateChanged) {
      setNavigationState((prev) => ({ ...prev, ...updatedState }));
    }
  }, [
    routeDataRef,
    activeRouteRef,
    snappedEdgeIDRef,
    mapMatchStep,
    destinationLoc,
    startTimeRef,
    totalDistanceTraveledRef,
    hasArrived,
    setNavigationState,
    setRouteStarted,
    setRouteData,
    setPolylineData,
    setAlternativeRoutesLineData,
    setActiveRoute,
    setNextTurnIndex,
  ]);

  const lastReactionTimestamp = useSharedValue(0);

  useAnimatedReaction(
    () => {
      if (!routeStarted) return null;
      return {
        lat: animLat.value,
        lon: animLon.value,
        heading: normalizeBearing(animHeading.value),
      };
    },
    (data) => {
      if (!data || !data.lat || !data.lon) return;

      const now = Date.now();
      if (now - lastReactionTimestamp.value > UPDATE_NAVIGATION_STATE_THRESHOLD_MS) {
        lastReactionTimestamp.value = now;
        scheduleOnRN(syncLogic, data.lat, data.lon, data.heading);
      }
    },
    [routeStarted, syncLogic]
  );
}
