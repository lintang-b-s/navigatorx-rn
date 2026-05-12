import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MapComponent } from "../components/MapComponent";
import { NavigationFooter } from "../components/NavigationFooter";
import { RouterPanel } from "../components/RouterPanel";
import { SearchBox } from "../components/SearchBox";
import { SearchResultList } from "../components/SearchResultList";
import { Speedometer } from "../components/Speedometer";
import { TurnInstructionBox } from "../components/TurnInstructionBox";
import { useLocationPermission } from "../hooks/useLocationPermission";
import { useLocationTracking } from "../hooks/useLocationTracking";
import { useNavigation } from "../hooks/useNavigation";
import { useNavigationSync } from "../hooks/useNavigationSync";
import { useRerouting } from "../hooks/useRerouting";
import { useSearch } from "../hooks/useSearch";
import { fetchBoundingBox } from "../lib/navigatorxApi";
import { Place } from "../lib/searchApi";

/**
 * Main Navigation Screen
 * Orchestrates Map, Search, Routing, and Navigation states.
 */
export default function NavigationScreen() {
  return (
    <SafeAreaProvider>
      <NavigationScreenInner />
    </SafeAreaProvider>
  );
}

function NavigationScreenInner() {
  // --- Location Permission ---
  useLocationPermission();

  const [boundingBoxGeoJSON, setBoundingBoxGeoJSON] = useState<any>(null);

  useEffect(() => {
    const getBoundingBox = async () => {
      try {
        const response = await fetchBoundingBox();
        const { min_lat, min_lon, max_lat, max_lon } = response.data;

        setBoundingBoxGeoJSON({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [min_lon, min_lat],
              [max_lon, min_lat],
              [max_lon, max_lat],
              [min_lon, max_lat],
              [min_lon, min_lat],
            ],
          },
        });
      } catch (error) {
        console.error("Failed to fetch bounding box:", error);
      }
    };
    void getBoundingBox();
  }, []);

  // --- Safe Area Insets ---
  const insets = useSafeAreaInsets();

  // --- Navigation Core ---
  const nav = useNavigation();

  // High-frequency sync loops
  useNavigationSync(nav);
  useRerouting(nav);

  // Location tracking during navigation mode (GPS → map match → smooth animation)
  useLocationTracking({
    routeStarted: nav.routeStarted,
    currentGpsLocRef: nav.currentGpsLocRef,
    currentHeadingRef: nav.currentHeadingRef,
    lastMatchedPointRef: nav.lastMatchedPointRef,
    startTimeRef: nav.startTimeRef,
    totalDistanceTraveledRef: nav.totalDistanceTraveledRef,
    candidates: nav.candidates,
    speedMeanK: nav.speedMeanK,
    speedStdK: nav.speedStdK,
    lastBearing: nav.lastBearing,
    prevGps: nav.prevGps,
    mapMatchStep: nav.mapMatchStep,
    deadReckoning: nav.deadReckoning,
    isInitialReroutePerformed: nav.isInitialReroutePerformed,
    routeDataRef: nav.routeDataRef,
    activeRouteRef: nav.activeRouteRef,
    snappedEdgeIDRef: nav.snappedEdgeIDRef,
    destinationLoc: nav.destinationLoc,
    hasArrived: nav.hasArrived,
    setSnappedEdgeID: nav.setSnappedEdgeID,
    setNavigationState: nav.setNavigationState,
    setRawGpsLoc: nav.setRawGpsLoc,
    setSpeed: nav.setSpeed,
    setRouteStarted: nav.setRouteStarted,
    setRouteData: nav.setRouteData,
    setPolylineData: nav.setPolylineData,
    setAlternativeRoutesLineData: nav.setAlternativeRoutesLineData,
    setActiveRoute: nav.setActiveRoute,
    setNextTurnIndex: nav.setNextTurnIndex,
    animLat: nav.animLat,
    animLon: nav.animLon,
    animHeading: nav.animHeading,
    animDuration: nav.animDuration,
    cameraRef: nav.cameraRef,
  });

  // --- Search Logic ---
  // Use raw GPS location for search (more accurate than matched location)
  const searchLat =
    nav.navigationState.matchedGpsLoc?.lat ?? nav.rawGpsLoc?.lat ?? -6.2;
  const searchLon =
    nav.navigationState.matchedGpsLoc?.lon ?? nav.rawGpsLoc?.lon ?? 106.8;
  const { searchResults, search, clearResults, reverseGeocode } = useSearch(
    searchLat,
    searchLon,
  );

  // Track which input is active for search results
  const [activeSearch, setActiveSearch] = useState<
    "source" | "destination" | null
  >(null);

  // --- UI Handlers ---
  const handleSearch = useCallback(
    (query: string, isSource: boolean) => {
      setActiveSearch(isSource ? "source" : "destination");
      search(query);
    },
    [search],
  );

  const handleSelectResult = useCallback(
    (place: Place) => {
      if (activeSearch === "source") {
        nav.onSelectSource(place);
      } else {
        nav.onSelectDestination(place);
      }
      clearResults();
      setActiveSearch(null);
    },
    [activeSearch, nav, clearResults],
  );

  /**
   * Handle "Your Location" button - uses expo-location for accurate GPS
   */
  const handleReverseGeocode = useCallback(
    async (isSource: boolean) => {
      try {
        // Solution 2: Ensure high accuracy mode is enabled on Android
        if (Platform.OS === "android") {
          await Location.enableNetworkProviderAsync().catch(() => {
            /* user might cancel or it might already be enabled */
          });
        }

        // Get accurate current location using expo-location
        // Solution 1: Use BestForNavigation for highest accuracy
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        const { latitude, longitude } = location.coords;

        // Sync the accurate location back to the navigation state so useSearch updates
        nav.handleUserLocationUpdate(latitude, longitude);

        // Reverse geocode using the accurate location
        const place = await reverseGeocode(latitude, longitude);
        if (place) {
          // Override with accurate GPS coordinates
          const accuratePlace: Place = {
            ...place,
            osm_object: {
              ...place.osm_object,
              lat: latitude,
              lon: longitude,
              name:
                place.osm_object.name + ", " + place.osm_object.address ||
                `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            },
          };
          if (isSource) nav.onSelectSource(accuratePlace);
          else nav.onSelectDestination(accuratePlace);
        }
      } catch (error) {
        console.error("Reverse geocode error:", error);
        // Fallback to existing reverseGeocode
        const place = await reverseGeocode();
        if (place) {
          if (isSource) nav.onSelectSource(place);
          else nav.onSelectDestination(place);
        }
      }
    },
    [reverseGeocode, nav],
  );

  const handleShowDirections = useCallback(() => {
    nav.handleDirectionActive(true);
  }, [nav]);

  const handleShowDirectionsBack = useCallback(() => {
    nav.handleDirectionActive(false);
  }, [nav]);

  const handleDirectionClick = useCallback(
    (direction: any, index: number) => {
      const route = nav.routeData?.[nav.activeRoute];
      if (route?.driving_directions && direction?.turn_point) {
        nav.handleSetNextTurnIndex(index);
      }
    },
    [nav],
  );

  // --- Derived State ---
  const isRouting =
    !nav.routeStarted && nav.routeData && nav.routeData.length > 0;
  const isNavigating = nav.routeStarted;

  const currentInstruction = useMemo(() => {
    if (!nav.routeData || nav.activeRoute >= nav.routeData.length) return null;
    const route = nav.routeData[nav.activeRoute];
    return route.driving_directions[nav.navigationState.currentDirectionIndex];
  }, [
    nav.routeData,
    nav.activeRoute,
    nav.navigationState.currentDirectionIndex,
  ]);

  const distanceFormatted = useMemo(() => {
    const dist = nav.navigationState.distanceFromNextTurnPoint;
    if (dist >= 1000) return `${(dist / 1000).toFixed(1)} km`;
    return `${Math.round(dist)} m`;
  }, [nav.navigationState.distanceFromNextTurnPoint]);

  const [isFocused, setIsFocused] = React.useState(false);

  // Sync isFocused when activeSearch changes
  React.useEffect(() => {
    if (!activeSearch) setIsFocused(false);
  }, [activeSearch]);

  const [nowTime, setNowTime] = useState<Date | null>(null);
  useEffect(() => {
    setNowTime(new Date());
    const id = setInterval(() => setNowTime(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  const arrivalTimeStr = useMemo(() => {
    if (!nav.routeData || nav.activeRoute >= nav.routeData.length)
      return "--:--";
    const route = nav.routeData[nav.activeRoute];
    const remainingMinutes = Math.max(
      0,
      route.travel_time - (nav.timeSpent || 0),
    );
    if (!nowTime) return "--:--";
    const arrival = new Date(nowTime.getTime() + remainingMinutes * 60000);
    return arrival.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [nav.routeData, nav.activeRoute, nav.timeSpent, nowTime]);

  const remainingMinutes = useMemo(() => {
    if (!nav.routeData || nav.activeRoute >= nav.routeData.length) return 0;
    const route = nav.routeData[nav.activeRoute];
    return Math.ceil(Math.max(0, route.travel_time - (nav.timeSpent || 0)));
  }, [nav.routeData, nav.activeRoute, nav.timeSpent]);

  const remainingDistanceKm = useMemo(() => {
    if (!nav.routeData || nav.activeRoute >= nav.routeData.length) return 0;
    const route = nav.routeData[nav.activeRoute];
    return Math.max(0, route.distance - (nav.distanceTraveled || 0));
  }, [nav.routeData, nav.activeRoute, nav.distanceTraveled]);

  return (
    <View className="flex-1 bg-black">
      {/* Hide status bar during navigation mode */}
      {isNavigating && (
        <StatusBar
          hidden={true}
          backgroundColor="transparent"
          translucent={true}
        />
      )}

      {/* 1. Map Layer */}
      <MapComponent
        lineData={nav.polylineData}
        alternativeRoutes={nav.alternativeRoutesLineData}
        activeRoute={nav.activeRoute}
        isDirectionActive={nav.isDirectionActive}
        routeDataCRP={nav.routeData}
        routeStarted={nav.routeStarted}
        currentGpsLocRef={nav.currentGpsLocRef}
        userHeading={nav.navigationState.matchedHeading}
        animLat={nav.animLat}
        animLon={nav.animLon}
        animHeading={nav.animHeading}
        animDuration={nav.animDuration}
        cameraRef={nav.cameraRef}
        rawGpsLoc={nav.rawGpsLoc}
        nextTurnIndex={nav.nextTurnIndex}
        nextTurnTrigger={nav.nextTurnTrigger}
        onSelectSource={nav.onSelectSource}
        onSelectDestination={nav.onSelectDestination}
        onUserLocationUpdateHandler={nav.handleUserLocationUpdate}
        safeAreaInsets={insets}
        boundingBoxGeoJSON={boundingBoxGeoJSON}
      />

      {/* 2. Top UI: Search, Router Panel, or Turn Instructions */}
      <View
        className="absolute z-20 left-0 right-0"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top }}
      >
        {isNavigating ? (
          <View className="px-4 pt-4">
            <TurnInstructionBox
              instruction={currentInstruction}
              distanceText={distanceFormatted}
            />
          </View>
        ) : isRouting ? (
          <View>
            <RouterPanel
              routes={nav.routeData || []}
              activeRoute={nav.activeRoute}
              onSelectRoute={nav.handleRouteClick}
              onStartNavigation={async () => {
                await nav.handleStartRoute(true);
              }}
              onClose={() => nav.setRouteData(undefined)}
              onShowDirections={handleShowDirections}
              onShowDirectionsBack={handleShowDirectionsBack}
              onDirectionClick={handleDirectionClick}
              isFetchingRoutes={nav.isFetchingRoutes}
              isStartingNavigation={nav.isStartingNavigation}
              nowTime={nowTime}
            />
            {nav.isStartingNavigation && (
              <View className="px-6 py-2">
                <View className="bg-white rounded-2xl px-4 py-2 flex-row items-center self-start border border-blue-100 shadow-sm">
                  <ActivityIndicator
                    size="small"
                    color="#2563eb"
                    style={{ marginRight: 8 }}
                  />
                  <Text className="text-blue-700 text-sm font-bold">
                    Starting navigation
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View className="px-4 pt-4">
            <SearchBox
              sourceName={
                nav.sourceLoc
                  ? `${nav.sourceLoc.osm_object.name}${
                      nav.sourceLoc.osm_object.address
                        ? `, ${nav.sourceLoc.osm_object.address}`
                        : ""
                    }`
                  : ""
              }
              destinationName={
                nav.destinationLoc
                  ? `${nav.destinationLoc.osm_object.name}${
                      nav.destinationLoc.osm_object.address
                        ? `, ${nav.destinationLoc.osm_object.address}`
                        : ""
                    }`
                  : ""
              }
              onSearch={handleSearch}
              onReverseGeocode={handleReverseGeocode}
              isAlternativeChecked={nav.isAlternativeChecked}
              onToggleAlternative={nav.handleClickAlternativeCheckbox}
              onGetRoutes={nav.handleGetRoutes}
              isFetchingRoutes={nav.isFetchingRoutes}
              isFocused={isFocused}
              onFocus={(isSource) => {
                setActiveSearch(isSource ? "source" : "destination");
                setIsFocused(true);
              }}
            />

            {/* Search Results Overlay */}
            {isFocused && searchResults.length > 0 && (
              <View className="absolute top-[190px] left-0 right-0 z-50">
                <SearchResultList
                  searchResults={searchResults}
                  onSelect={handleSelectResult}
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* 3. Bottom UI: Speedometer and Navigation Footer (Navigation Phase) */}
      {isNavigating && (
        <>
          <View
            className="absolute left-4 z-10"
            style={{ bottom: insets.bottom + 120 }}
          >
            <Speedometer speed={nav.speed} />
          </View>
          <View
            className="absolute left-0 right-0 z-10"
            style={{ bottom: insets.bottom }}
          >
            <NavigationFooter
              arrivalTime={arrivalTimeStr}
              durationMinutes={remainingMinutes}
              distanceKm={remainingDistanceKm}
              onStop={async () => {
                await nav.handleStartRoute(false);
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}
