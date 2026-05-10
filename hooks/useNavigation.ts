import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ToastAndroid } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { DEFAULT_CONSTANT_SPEED } from "../lib/constants";
import { Candidate, Coord, Gps } from "../lib/mapmatchApi";
import { nativeMapMatcher } from "../lib/nativeMapMatcher";
import { RouteCRPResponse } from "../lib/navigatorxApi";
import { fetchAndProcessRoutes } from "../lib/routingService";
import { Place } from "../lib/searchApi";
import { LineData, NavigationState } from "../lib/types";

function showToast(msg: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  }
}

/**
 * Core navigation orchestration hook.
 * Manages route data, active route, source/destination, navigation lifecycle.
 */
export function useNavigation() {
  // === Reanimated Shared Values for smooth UI thread animations ===
  const animLat = useSharedValue(0);
  const animLon = useSharedValue(0);
  const animHeading = useSharedValue(0);

  // MapLibre Camera Reference for direct control
  const cameraRef = useRef<any>(null);

  // === Refs for high-frequency updates ===
  const isReroutingRef = useRef(false);
  const routeDataRef = useRef<RouteCRPResponse[] | undefined>(undefined);
  const activeRouteRef = useRef(0);
  const snappedEdgeIDRef = useRef(-1);
  const currentGpsLocRef = useRef<Coord | null>(null);
  const currentHeadingRef = useRef<number>(0);
  const lastMatchedPointRef = useRef<Coord | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const totalDistanceTraveledRef = useRef<number>(0);

  // Map matching state refs
  const candidates = useRef<Candidate[]>([]);
  const speedMeanK = useRef<number>(DEFAULT_CONSTANT_SPEED);
  const speedStdK = useRef<number>(DEFAULT_CONSTANT_SPEED);
  const lastBearing = useRef<number>(0.0);
  const prevGps = useRef<Gps | undefined>(undefined);
  const mapMatchStep = useRef<number>(1);
  const deadReckoning = useRef<boolean>(false);
  const isInitialReroutePerformed = useRef<boolean>(false);
  const lastFetchedAlternativesStep = useRef<number>(-1);
  const hasArrived = useRef(false);

  // === React state ===
  const [snappedEdgeID, setSnappedEdgeID] = useState<number>(-1);
  const [routeStarted, setRouteStarted] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    matchedGpsLoc: undefined,
    matchedHeading: 0,
    distanceFromNextTurnPoint: 0,
    currentDirectionIndex: 0,
    timeSpent: 0,
    distanceTraveled: 0,
  });

  const [rawGpsLoc, setRawGpsLoc] = useState<Coord>();
  const [speed, setSpeed] = useState(0);

  // Routing state
  const [routeData, setRouteData] = useState<RouteCRPResponse[]>();
  const [activeRoute, setActiveRoute] = useState(0);
  const [isDirectionActive, setIsDirectionActive] = useState(false);
  const [isStartingNavigation, setIsStartingNavigation] = useState(false);
  const [sourceLoc, setSourceLoc] = useState<Place>();
  const [destinationLoc, setDestinationLoc] = useState<Place>();
  const [polylineData, setPolylineData] = useState<LineData>();
  const [alternativeRoutesLineData, setAlternativeRoutesLineData] = useState<
    LineData[]
  >([]);
  const [isAlternativeChecked, setIsAlternativeChecked] = useState(false);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);
  const [nextTurnIndex, setNextTurnIndex] = useState(-1);
  const [nextTurnTrigger, setNextTurnTrigger] = useState(0);

  // Keep refs in sync with state
  useEffect(() => {
    routeDataRef.current = routeData;
  }, [routeData]);
  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);
  useEffect(() => {
    snappedEdgeIDRef.current = snappedEdgeID;
  }, [snappedEdgeID]);

  // Auto-fix activeRoute if routeData changes
  useEffect(() => {
    if (routeData?.length === 0) {
      setPolylineData(undefined);
      setAlternativeRoutesLineData([]);
    }
  }, [routeData]);

  useEffect(() => {
    if (!routeData || routeData.length === 0) {
      if (activeRoute !== 0) setActiveRoute(0);
      return;
    }
    if (activeRoute >= routeData.length) {
      setActiveRoute(0);
    }
  }, [routeData, activeRoute]);

  // === Handlers ===
  const handleClickAlternativeCheckbox = useCallback(() => {
    setIsAlternativeChecked((prev) => !prev);
  }, []);

  const onSelectSource = useCallback((place: Place) => {
    setSourceLoc(place);
  }, []);

  const onSelectDestination = useCallback((place: Place) => {
    setDestinationLoc(place);
  }, []);

  const handleRouteClick = useCallback((index: number) => {
    setActiveRoute(index);
  }, []);

  const handleDirectionActive = useCallback((show: boolean) => {
    setIsDirectionActive(show);
  }, []);

  const handleSetNextTurnIndex = useCallback((index: number) => {
    setNextTurnIndex(index);
    setNextTurnTrigger((prev) => prev + 1);
  }, []);

  /**
   * Fetch routes from the backend.
   */
  const handleGetRoutes = useCallback(async () => {
    if (isFetchingRoutes) return;

    if (!sourceLoc || !destinationLoc) {
      showToast("Please select both source and destination");
      return;
    }

    try {
      setIsFetchingRoutes(true);
      setRouteStarted(false);
      setNextTurnIndex(-1);
      setRouteData([]);
      setNavigationState({
        matchedGpsLoc: undefined,
        matchedHeading: 0,
        distanceFromNextTurnPoint: 0,
        currentDirectionIndex: 0,
        timeSpent: 0,
        distanceTraveled: 0,
      });
      lastFetchedAlternativesStep.current = -1;

      const reqBody = {
        srcLat: sourceLoc.osm_object.lat,
        srcLon: sourceLoc.osm_object.lon,
        destLat: destinationLoc.osm_object.lat,
        destLon: destinationLoc.osm_object.lon,
      };

      const processedRoutes = await fetchAndProcessRoutes(
        reqBody,
        isAlternativeChecked,
      );

      setActiveRoute(0);
      setPolylineData(processedRoutes.mainLineData);

      if (processedRoutes.alternativeRoutesLineData.length > 0) {
        setAlternativeRoutesLineData(processedRoutes.alternativeRoutesLineData);
      } else {
        setAlternativeRoutesLineData([]);
      }

      setRouteData(processedRoutes.combinedRoutes);
    } catch (error: any) {
      showToast(error.message || "Failed to fetch routes");
    } finally {
      setIsFetchingRoutes(false);
    }
  }, [sourceLoc, destinationLoc, isAlternativeChecked, isFetchingRoutes]);

  /**
   * Start or stop navigation.
   */
  const handleStartRoute = useCallback(async (start: boolean) => {
    if (start) {
      setIsStartingNavigation(true);
      try {
        await nativeMapMatcher.init();

        // Ensure the initial tile is loaded before tracking
        const usedRoute = routeDataRef.current?.[activeRouteRef.current];
        const startLat = usedRoute?.driving_directions?.[0]?.turn_point?.lat;
        const startLon = usedRoute?.driving_directions?.[0]?.turn_point?.lon;
        if (startLat !== undefined && startLon !== undefined) {
          await nativeMapMatcher.loadTile(startLat, startLon);
        }
      } catch (error) {
        showToast("Failed to initialize map matcher");
        setIsDirectionActive(false);
        setIsStartingNavigation(false);
        return;
      } finally {
        setIsStartingNavigation(false);
      }

      // Reset trip trackers
      startTimeRef.current = null;
      totalDistanceTraveledRef.current = 0;
      lastMatchedPointRef.current = null;

      // Seed map matcher with first route edge
      const usedRoute = routeDataRef.current?.[activeRouteRef.current];
      const firstRouteEdgeID =
        usedRoute?.driving_directions?.[0]?.edge_ids?.[0];

      if (firstRouteEdgeID) {
        mapMatchStep.current = 1;
        // Convert original Graph edge ID to local graph index
        // The map matcher uses local IDs internally; the R-tree search returns local IDs
        const localEdgeId = nativeMapMatcher.getLocalEdgeId(firstRouteEdgeID);
        if (localEdgeId !== 1000000001) {
          candidates.current = [
            { edge_id: localEdgeId, weight: 1.0, length: 0 },
          ];
        } else {
          // Edge not found in tile - start without seeded candidates
          candidates.current = [];
        }
      } else {
        mapMatchStep.current = 1;
        candidates.current = [];
      }
    } else {
      // Stop navigation
      setNavigationState({
        matchedGpsLoc: undefined,
        matchedHeading: 0,
        distanceFromNextTurnPoint: 0,
        currentDirectionIndex: 0,
        timeSpent: 0,
        distanceTraveled: 0,
      });
    }

    hasArrived.current = false;
    setRouteStarted(start);
  }, []);

  /**
   * Handle geolocation update from map control button
   */
  const handleUserLocationUpdate = useCallback((lat: number, lon: number) => {
    const coord: Coord = { lat, lon };
    currentGpsLocRef.current = coord;
    setRawGpsLoc(coord);
    setNavigationState((prev) => ({
      ...prev,
      matchedGpsLoc: coord,
    }));
  }, []);

  return {
    // Refs (for high-frequency access by other hooks)
    isReroutingRef,
    routeDataRef,
    activeRouteRef,
    snappedEdgeIDRef,
    currentGpsLocRef,
    currentHeadingRef,
    lastMatchedPointRef,
    animLat,
    animLon,
    animHeading,
    cameraRef,
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
    lastFetchedAlternativesStep,
    hasArrived,

    // State
    snappedEdgeID,
    setSnappedEdgeID,
    routeStarted,
    setRouteStarted,
    navigationState,
    setNavigationState,
    rawGpsLoc,
    setRawGpsLoc,
    speed,
    setSpeed,
    routeData,
    setRouteData,
    activeRoute,
    setActiveRoute,
    isDirectionActive,
    setIsDirectionActive,
    isStartingNavigation,
    sourceLoc,
    destinationLoc,
    polylineData,
    setPolylineData,
    alternativeRoutesLineData,
    setAlternativeRoutesLineData,
    isAlternativeChecked,
    isFetchingRoutes,
    nextTurnIndex,
    setNextTurnIndex,
    nextTurnTrigger,

    // Convenience getters from navigationState
    get timeSpent() {
      return navigationState.timeSpent;
    },
    get distanceTraveled() {
      return navigationState.distanceTraveled;
    },

    // Handlers
    handleClickAlternativeCheckbox,
    onSelectSource,
    onSelectDestination,
    handleGetRoutes,
    handleRouteClick,
    handleDirectionActive,
    handleSetNextTurnIndex,
    handleStartRoute,
    handleUserLocationUpdate,
  };
}
