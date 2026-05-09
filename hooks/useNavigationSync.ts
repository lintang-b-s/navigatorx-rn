import { useEffect } from "react";
import { Platform, ToastAndroid } from "react-native";
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
  return ((bearing % 360) + 360) % 360;
};

/**
 * Type representing the return value of useNavigation hook.
 * Using a partial interface to avoid circular dependencies.
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
}

/**
 * 60fps sync loop that reads refs and updates UI state at a throttled rate.
 * Ports the requestAnimationFrame sync effect from page.tsx.
 */
export function useNavigationSync(nav: NavigationHookResult) {
  const {
    routeStarted,
    currentGpsLocRef,
    currentHeadingRef,
    snappedEdgeIDRef,
    routeDataRef,
    activeRouteRef,
    startTimeRef,
    totalDistanceTraveledRef,
    mapMatchStep,
    hasArrived,
    lastMatchedPointRef,
    navigationState,
    setNavigationState,
    setSnappedEdgeID,
    destinationLoc,
    setRouteStarted,
    setRouteData,
    setPolylineData,
    setAlternativeRoutesLineData,
    setActiveRoute,
    setNextTurnIndex,
  } = nav;

  useEffect(() => {
    if (!routeStarted) return;

    let frameId: number;
    let lastLat = 0;
    let lastLon = 0;
    let lastH = 0;
    let lastDist = 0;
    let lastDirIndex = -1;
    let lastUpdateTimestamp = 0;

    const sync = () => {
      if (currentGpsLocRef.current) {
        const curLat = currentGpsLocRef.current.lat;
        const curLon = currentGpsLocRef.current.lon;
        const curH = normalizeBearing(currentHeadingRef.current);

        let updatedState: Partial<NavigationState> = {};
        let stateChanged = false;

        const usedRoute = routeDataRef.current?.[activeRouteRef.current];
        if (usedRoute) {
          const usedRouteDirections = usedRoute.driving_directions;

          // 1. Identify which turn instruction the user is currently in
          const directionsIndex = getCurrentUserDirectionIndex({
            snappedEdgeID: snappedEdgeIDRef.current,
            drivingDirections: usedRouteDirections,
          });

          // When rerouting, skip initial "Head [Direction]" instruction at index 0
          let targetIndex = directionsIndex;
          if (
            mapMatchStep.current > 1 &&
            targetIndex === 0 &&
            usedRouteDirections.length > 1
          ) {
            targetIndex = 1;
          }

          if (directionsIndex !== lastDirIndex || mapMatchStep.current > 1) {
            updatedState.currentDirectionIndex = targetIndex;
            lastDirIndex = directionsIndex;
            stateChanged = true;
          }

          // 2. Calculate distance to the next turn point
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
            }) * 1000.0; // Convert KM to Meters

          const timeSpent = startTimeRef.current
            ? (new Date().getTime() - startTimeRef.current.getTime()) / 60000
            : 0;

          if (
            Math.abs(newDist - lastDist) > UPDATE_TURN_INSTRUCTION_DISTANCE_MIN
          ) {
            updatedState.distanceFromNextTurnPoint = newDist;
            lastDist = newDist;
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
            }
          }
        }

        // Throttled state update for UI re-render
        const posChanged =
          Math.abs(curLat - lastLat) > 0.000001 ||
          Math.abs(curLon - lastLon) > 0.000001;
        const headingChanged = Math.abs(curH - lastH) > 2;

        if (posChanged || headingChanged) {
          updatedState.matchedGpsLoc = { lat: curLat, lon: curLon };
          updatedState.matchedHeading = curH;
          lastLat = curLat;
          lastLon = curLon;
          lastH = curH;
          stateChanged = true;
        }

        const now = Date.now();
        if (
          stateChanged &&
          now - lastUpdateTimestamp > UPDATE_NAVIGATION_STATE_THRESHOLD_MS
        ) {
          setNavigationState((prev) => ({ ...prev, ...updatedState }));
          lastUpdateTimestamp = now;
        }
      }

      frameId = requestAnimationFrame(sync);
    };

    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [routeStarted]);
}
