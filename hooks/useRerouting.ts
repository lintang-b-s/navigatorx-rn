import polyline from "@mapbox/polyline";
import { useEffect, useRef } from "react";
import { Platform, ToastAndroid } from "react-native";
import { Candidate, Coord } from "../lib/mapmatchApi";
import { fetchAlternativeRoutes, RouteCRPResponse } from "../lib/navigatorxApi";
import {
  getCurrentUserDirectionIndex,
  isNearEndOfSuggestAlternativesStep,
  isUserOffTheRoute,
} from "../lib/routing";
import { fetchAndProcessRoutes } from "../lib/routingService";
import { Place } from "../lib/searchApi";
import { LineData, NavigationState } from "../lib/types";

/**
 * Type representing the return value of useNavigation hook (partial).
 */
interface NavigationHookResult {
  routeStarted: boolean;
  isReroutingRef: React.MutableRefObject<boolean>;
  routeDataRef: React.MutableRefObject<RouteCRPResponse[] | undefined>;
  activeRouteRef: React.MutableRefObject<number>;
  snappedEdgeIDRef: React.MutableRefObject<number>;
  currentGpsLocRef: React.MutableRefObject<Coord | null>;
  isInitialReroutePerformed: React.MutableRefObject<boolean>;
  mapMatchStep: React.MutableRefObject<number>;
  candidates: React.MutableRefObject<Candidate[]>;
  lastFetchedAlternativesStep: React.MutableRefObject<number>;
  startTimeRef: React.MutableRefObject<Date | null>;
  totalDistanceTraveledRef: React.MutableRefObject<number>;
  navigationState: NavigationState;
  destinationLoc: Place | undefined;
  setRouteData: (data: RouteCRPResponse[]) => void;
  setActiveRoute: (index: number) => void;
  setPolylineData: (data: LineData | undefined) => void;
  setAlternativeRoutesLineData: (data: LineData[]) => void;
}

/**
 * Re-routing logic: detects off-route conditions and fetches new routes.
 * Also handles dynamic alternative route suggestions at decision points.
 * Ports the rerouting useEffect from page.tsx.
 */
export function useRerouting(nav: NavigationHookResult) {
  const {
    routeStarted,
    isReroutingRef,
    routeDataRef,
    activeRouteRef,
    snappedEdgeIDRef,
    currentGpsLocRef,
    isInitialReroutePerformed,
    mapMatchStep,
    lastFetchedAlternativesStep,
    startTimeRef,
    totalDistanceTraveledRef,
    navigationState,
    destinationLoc,
    setRouteData,
    setActiveRoute,
    setPolylineData,
    setAlternativeRoutesLineData,
  } = nav;

  const rerouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for values that should be accessed but not trigger effect re-runs
  const destinationLocRef = useRef(destinationLoc);
  destinationLocRef.current = destinationLoc;

  const setRouteDataRefInternal = useRef(setRouteData);
  setRouteDataRefInternal.current = setRouteData;

  const setActiveRouteRefInternal = useRef(setActiveRoute);
  setActiveRouteRefInternal.current = setActiveRoute;

  const setPolylineDataRefInternal = useRef(setPolylineData);
  setPolylineDataRefInternal.current = setPolylineData;

  const setAlternativeRoutesLineDataRefInternal = useRef(setAlternativeRoutesLineData);
  setAlternativeRoutesLineDataRefInternal.current = setAlternativeRoutesLineData;

  useEffect(() => {
    if (!routeStarted) return;

    const { matchedGpsLoc } = navigationState;
    if (!matchedGpsLoc || !destinationLocRef.current) return;

    const usedRoute = routeDataRef.current?.[activeRouteRef.current];
    if (!usedRoute) return;

    const usedRouteDirections = usedRoute.driving_directions;

    // DYNAMIC ALTERNATIVES: Triggered when approaching the end of a road segment
    const directionsIndex = getCurrentUserDirectionIndex({
      snappedEdgeID: snappedEdgeIDRef.current,
      drivingDirections: usedRouteDirections,
    });

    if (
      isNearEndOfSuggestAlternativesStep({
        snappedEdgeID: snappedEdgeIDRef.current,
        drivingDirections: usedRouteDirections,
        currentIndex: directionsIndex,
      }) &&
      directionsIndex !== lastFetchedAlternativesStep.current &&
      !isReroutingRef.current
    ) {
      lastFetchedAlternativesStep.current = directionsIndex;
      isReroutingRef.current = true;

      (async () => {
        try {
          if (!destinationLocRef.current) return;
          const reqBody = {
            srcLat: currentGpsLocRef.current?.lat || matchedGpsLoc.lat,
            srcLon: currentGpsLocRef.current?.lon || matchedGpsLoc.lon,
            destLat: destinationLocRef.current.osm_object.lat,
            destLon: destinationLocRef.current.osm_object.lon,
            reroute: true,
            startEdgeId: snappedEdgeIDRef.current,
          };

          const altResponse = await fetchAlternativeRoutes(reqBody);
          const newAlternatives = altResponse.data.alternative_routes;

          if (newAlternatives.length > 0) {
            const currentDistOffset = totalDistanceTraveledRef.current;
            const currentTimeOffset =
              (Date.now() - (startTimeRef.current?.getTime() ?? Date.now())) /
              60000;

            newAlternatives.forEach((alt: any) => {
              alt.distance = parseFloat(
                (alt.distance / 1000 + currentDistOffset).toFixed(2),
              );
              alt.travel_time = alt.travel_time + currentTimeOffset;
            });

            const combinedRoutes = [usedRoute, ...newAlternatives];
            setRouteDataRefInternal.current(combinedRoutes);
            routeDataRef.current = combinedRoutes;

            const alternativesPolyline = newAlternatives.map((route) => {
              const coords = polyline.decode(route.path);
              return {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: coords.map((coord) => [coord[1], coord[0]]),
                },
              } as LineData;
            });

            const dummyRoute: LineData = {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-100, 40],
                  [-100, 40],
                ],
              },
            };
            setAlternativeRoutesLineDataRefInternal.current([
              dummyRoute,
              ...alternativesPolyline,
            ]);
          }
        } catch (e) {
          console.error("Failed to fetch alternatives dynamically:", e);
        } finally {
          isReroutingRef.current = false;
        }
      })();
    }

    // Skip re-route if at source location
    const firstRouteEdgeID = usedRoute.driving_directions?.[0]?.edge_ids?.[0];
    if (
      snappedEdgeIDRef.current === firstRouteEdgeID &&
      mapMatchStep.current === 1
    ) {
      return;
    }

    // Check if user is off-route
    const offRoute = isUserOffTheRoute({
      snappedEdgeID: snappedEdgeIDRef.current,
      routeData: usedRoute,
    });

    if (offRoute && snappedEdgeIDRef.current !== -1) {
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
          setActiveRouteRefInternal.current(otherRouteIndex);
          if (Platform.OS === "android") {
            ToastAndroid.show(
              `Switched to alternative route ${otherRouteIndex + 1}`,
              ToastAndroid.SHORT,
            );
          }
          return;
        }
      }

      // Genuinely off-route - reroute
      if (mapMatchStep.current <= 1 && isInitialReroutePerformed.current) {
        return;
      }

      if (!rerouteTimeoutRef.current) {
        rerouteTimeoutRef.current = setTimeout(async () => {
          if (isReroutingRef.current) return;
          isReroutingRef.current = true;

          if (mapMatchStep.current <= 1) {
            isInitialReroutePerformed.current = true;
          }

          if (!destinationLocRef.current) return;
          try {
            const reqBody = {
              srcLat: currentGpsLocRef.current?.lat || matchedGpsLoc.lat,
              srcLon: currentGpsLocRef.current?.lon || matchedGpsLoc.lon,
              destLat: destinationLocRef.current.osm_object.lat,
              destLon: destinationLocRef.current.osm_object.lon,
              reroute: true,
              startEdgeId: snappedEdgeIDRef.current,
            };

            const processedRoutes = await fetchAndProcessRoutes(reqBody, true);

            setRouteDataRefInternal.current(processedRoutes.combinedRoutes);
            routeDataRef.current = processedRoutes.combinedRoutes;
            setPolylineDataRefInternal.current(processedRoutes.mainLineData);
            setAlternativeRoutesLineDataRefInternal.current(
              processedRoutes.alternativeRoutesLineData,
            );

            setActiveRouteRefInternal.current(0);
            activeRouteRef.current = 0;

            startTimeRef.current = new Date();
            totalDistanceTraveledRef.current = 0;

            if (Platform.OS === "android") {
              ToastAndroid.show("Route recalculated", ToastAndroid.SHORT);
            }
          } catch (error: any) {
            console.error("[Rerouting] Error:", error);
          } finally {
            isReroutingRef.current = false;
            rerouteTimeoutRef.current = null;
          }
        }, 1000);
      }
    }

    return () => {
      if (rerouteTimeoutRef.current) {
        clearTimeout(rerouteTimeoutRef.current);
        rerouteTimeoutRef.current = null;
      }
    };
  }, [
    routeStarted,
    navigationState,
    activeRouteRef,
    currentGpsLocRef,
    isInitialReroutePerformed,
    isReroutingRef,
    lastFetchedAlternativesStep,
    mapMatchStep,
    routeDataRef,
    snappedEdgeIDRef,
    startTimeRef,
    totalDistanceTraveledRef,
  ]);
}
