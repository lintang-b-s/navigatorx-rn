import { Ionicons } from "@expo/vector-icons";
import * as MapLibre from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Coord } from "../lib/mapmatchApi";
import { project, unproject } from "../lib/util";
import { CarMarker } from "./CarMarker";

export interface MapComponentProps {
  lineData?: any;
  alternativeRoutes?: any[];
  activeRoute?: number;
  isDirectionActive?: boolean;
  routeDataCRP?: any[];
  nextTurnIndex?: number;
  nextTurnTrigger?: number;
  routeStarted?: boolean;
  currentGpsLocRef?: React.RefObject<Coord | null>;
  userHeading?: number;
  animLat?: any;
  animLon?: any;
  animHeading?: any;
  cameraRef?: React.RefObject<any>;
  triggerGeolocate?: number;
  boundingBoxGeoJSON?: any;
  rawGpsLoc?: Coord;
  gpsWindowPoints?: Coord[];
  onSelectSource?: (place: any) => void;
  onSelectDestination?: (place: any) => void;
  onUserLocationUpdateHandler?: (lat: number, lon: number) => void;
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
}

const ACTIVE_ROUTE_COLOR = "#470DF9";
const ACTIVE_ROUTE_OPACITY = 0.9;
const ACTIVE_ROUTE_WIDTH_BY_ZOOM = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  2,
  13,
  4,
  15,
  6,
  17,
  8,
];

function scalarProjection(
  dx: number,
  dy: number,
  dx0: number,
  dy0: number,
): number {
  const roadNorm = dx * dx + dy * dy;
  let t = 0;
  if (roadNorm > 0) {
    t = Math.max(0, Math.min(1, (dx0 * dx + dy0 * dy) / roadNorm));
  }
  return t;
}

function findClosestPointOnRoute(
  lon: number,
  lat: number,
  coordinates?: number[][],
): [number, number] {
  if (!coordinates || coordinates.length === 0) {
    return [lon, lat];
  }

  const p0 = project(lat, lon);
  let minDistance = Number.POSITIVE_INFINITY;
  let closestPoint: [number, number] = [lon, lat];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];
    const p1 = project(c1[1], c1[0]);
    const p2 = project(c2[1], c2[0]);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dx0 = p0.x - p1.x;
    const dy0 = p0.y - p1.y;
    const t = scalarProjection(dx, dy, dx0, dy0);

    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const distSq = (p0.x - projX) ** 2 + (p0.y - projY) ** 2;
    if (distSq < minDistance) {
      minDistance = distSq;
      const foot = unproject(projX, projY);
      closestPoint = [foot.lon, foot.lat];
    }
  }

  if (coordinates.length === 1) {
    return [coordinates[0][0], coordinates[0][1]];
  }

  return closestPoint;
}

function getTurnIconDirection(turnType: string): any {
  switch (turnType) {
    case "TURN_RIGHT":
    case "TURN_SHARP_RIGHT":
      return require("../assets/images/icons_white/turn_right.png");
    case "TURN_LEFT":
    case "TURN_SHARP_LEFT":
      return require("../assets/images/icons_white/turn_left.png");
    case "CONTINUE_ONTO":
      return require("../assets/images/icons_white/straight.png");
    case "TURN_SLIGHT_RIGHT":
      return require("../assets/images/icons_white/turn_slight_right.png");
    case "TURN_SLIGHT_LEFT":
      return require("../assets/images/icons_white/turn_slight_left.png");
    case "KEEP_RIGHT":
      return require("../assets/images/icons_white/fork_right.png");
    case "KEEP_LEFT":
      return require("../assets/images/icons_white/fork_left.png");
    case "MERGE_ONTO":
      return require("../assets/images/icons_white/merge_onto.png");
    case "U_TURN_RIGHT":
      return require("../assets/images/icons_white/u_turn_right.png");
    case "U_TURN_LEFT":
      return require("../assets/images/icons_white/u_turn_left.png");
    case "ROUNDABOUT":
      return require("../assets/images/icons_white/roundabout_right.png");
    default:
      return require("../assets/images/icons_white/straight.png");
  }
}

export const MapComponent = React.memo(function MapComponent(
  props: MapComponentProps,
) {
  const [zoomLevel, setZoomLevel] = useState(13);
  const [contextMenuCoord, setContextMenuCoord] = useState<{
    lon: number;
    lat: number;
  } | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 110.37432,
    latitude: -7.78787,
    zoom: 13,
    bearing: 0,
    pitch: 0,
  });

  const mapRef = useRef<MapLibre.MapRef>(null);
  const userPosition = MapLibre.useCurrentPosition();

  // Geolocate handler - uses expo-location for accurate GPS
  const handleGeolocate = useCallback(async () => {
    try {
      // Solution 2: Ensure high accuracy mode is enabled on Android
      if (Platform.OS === "android") {
        await Location.enableNetworkProviderAsync().catch(() => {
          /* user might cancel or it might already be enabled */
        });
      }

      // Solution 1: Use BestForNavigation for highest accuracy
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      if (location.coords) {
        const { latitude, longitude } = location.coords;
        props.onUserLocationUpdateHandler?.(latitude, longitude);
        props.cameraRef?.current?.flyTo({
          center: [longitude, latitude],
          zoom: 17,
          duration: 500,
        });
      }
    } catch (error) {
      console.error("Geolocate error:", error);
    }
  }, [props.onUserLocationUpdateHandler]);

  // Zoom in/out handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(viewState.zoom + 1, 20);
    props.cameraRef?.current?.flyTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: newZoom,
      duration: 300,
    });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(viewState.zoom - 1, 3);
    props.cameraRef?.current?.flyTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: newZoom,
      duration: 300,
    });
  };

  // Jump to route start if active route or line data changes
  useEffect(() => {
    if (props.routeStarted || !props.lineData?.geometry?.coordinates) return;
    const coords = props.lineData.geometry.coordinates;
    if (coords.length > 0) {
      const fittedViewState = getRouteFittedViewState(coords);
      props.cameraRef?.current?.flyTo({
        center: fittedViewState.centerCoordinate,
        zoom: fittedViewState.zoomLevel,
        duration: 1000,
      });
    }
  }, [props.lineData, props.activeRoute, props.routeStarted]);

  // Jump to next turn when nextTurnIndex or trigger changes
  useEffect(() => {
    const turn =
      props.routeDataCRP?.[props.activeRoute || 0]?.driving_directions?.[
        props.nextTurnIndex || 0
      ];
    if (
      props.nextTurnIndex !== undefined &&
      props.nextTurnIndex !== -1 &&
      turn &&
      !props.routeStarted
    ) {
      props.cameraRef?.current?.flyTo({
        center: [turn.turn_point.lon, turn.turn_point.lat],
        zoom: 18,
        duration: 500,
      });
    }
  }, [
    props.nextTurnIndex,
    props.nextTurnTrigger,
    props.routeDataCRP,
    props.activeRoute,
    props.routeStarted,
  ]);

  const activeRouteCoordinates = useMemo(() => {
    if (props.activeRoute === 0) {
      return props.lineData?.geometry?.coordinates;
    }
    return props.alternativeRoutes?.[props.activeRoute || 0]?.geometry
      ?.coordinates;
  }, [props.activeRoute, props.lineData, props.alternativeRoutes]);

  const spRouteGeoJSON = useMemo(() => {
    if (!props.lineData) return null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: props.lineData.geometry.coordinates,
      },
      properties: {},
    };
  }, [props.lineData]);

  const activeRouteGeoJSON = useMemo(() => {
    if (
      props.activeRoute === 0 ||
      !props.alternativeRoutes?.[props.activeRoute || 0]
    )
      return null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates:
          props.alternativeRoutes[props.activeRoute || 0].geometry.coordinates,
      },
      properties: {},
    };
  }, [props.activeRoute, props.alternativeRoutes]);

  // Alternative routes (filter out active and main route)
  const alternativeRouteGeoJSONs = useMemo(() => {
    if (!props.alternativeRoutes || props.alternativeRoutes.length === 0)
      return [];
    return props.alternativeRoutes
      .filter((_, i) => i !== 0 && i !== props.activeRoute)
      .map((route, index) => ({
        id: `alt-route-${index}`,
        data: {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: route.geometry.coordinates,
          },
          properties: {},
        },
      }));
  }, [props.alternativeRoutes, props.activeRoute]);

  // Turn Markers Logic (Match Web)
  const turnMarkers = useMemo(() => {
    if (
      !props.isDirectionActive ||
      !props.routeDataCRP?.[props.activeRoute || 0]?.driving_directions
    )
      return [];

    return props.routeDataCRP[props.activeRoute || 0].driving_directions.map(
      (turn: any, index: number) => {
        const icon = getTurnIconDirection(turn.turn_type);
        const turnPointOnPolyline = findClosestPointOnRoute(
          turn.turn_point.lon,
          turn.turn_point.lat,
          activeRouteCoordinates,
        );

        return {
          id: `turn-${index}`,
          coordinate: turnPointOnPolyline,
          icon,
          bearing: (turn.turn_bearing * 180) / Math.PI,
        };
      },
    );
  }, [
    props.isDirectionActive,
    props.routeDataCRP,
    props.activeRoute,
    activeRouteCoordinates,
  ]);

  const gpsWindowGeoJSON = useMemo(() => {
    if (!props.gpsWindowPoints || props.gpsWindowPoints.length === 0)
      return null;
    return {
      type: "FeatureCollection" as const,
      features: props.gpsWindowPoints.map((p, i) => ({
        type: "Feature" as const,
        id: i,
        geometry: {
          type: "Point" as const,
          coordinates: [p.lon, p.lat],
        },
        properties: {},
      })),
    };
  }, [props.gpsWindowPoints]);

  // Zoom-based turn scale (match web) - ensure high opacity for visibility
  const zoomBasedTurnScale = Math.max(
    0,
    Math.min(1, (zoomLevel - 10) / (17 - 10)),
  );
  const turnIconSize = 40 * zoomBasedTurnScale;
  // Use higher base opacity so turn icons are clearly visible even at lower zoom levels
  const turnOpacity = Math.min(1, 0.5 + 0.5 * zoomBasedTurnScale);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapLibre.Map
        style={StyleSheet.absoluteFillObject}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        logo={false}
        compass={false}
        attribution={false}
        touchZoom={true}
        touchRotate={true}
        onRegionWillChange={(e) => setZoomLevel(e.nativeEvent.zoom)}
        onRegionDidChange={(e) => {
          setViewState({
            longitude: e.nativeEvent.center[0],
            latitude: e.nativeEvent.center[1],
            zoom: e.nativeEvent.zoom,
            bearing: e.nativeEvent.bearing || 0,
            pitch: e.nativeEvent.pitch || 0,
          });
        }}
        onLongPress={(e) => {
          const coord = e.nativeEvent.lngLat;
          setContextMenuCoord({ lon: coord[0], lat: coord[1] });
        }}
        onPress={() => {
          if (contextMenuCoord) setContextMenuCoord(null);
        }}
      >
        <MapLibre.Camera
          ref={props.cameraRef as any}
          initialViewState={{
            center: [viewState.longitude, viewState.latitude],
            zoom: viewState.zoom,
          }}
        />

        {gpsWindowGeoJSON && (
          <MapLibre.GeoJSONSource
            id="gps-window-source"
            data={gpsWindowGeoJSON}
          >
            <MapLibre.Layer
              id="gps-window-layer"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": "#FF0000",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#FFFFFF",
                "circle-opacity": 0.6,
              }}
            />
          </MapLibre.GeoJSONSource>
        )}

        {/* Show fastest route (route 0) always visible when alternative route is selected */}
        {props.activeRoute !== 0 && spRouteGeoJSON && (
          <MapLibre.GeoJSONSource id="sp-route-source" data={spRouteGeoJSON}>
            <MapLibre.Layer
              id="sp-route-layer"
              type="line"
              paint={{
                "line-color": ACTIVE_ROUTE_COLOR,
                "line-width": 4,
                "line-opacity": 0.35,
              }}
            />
          </MapLibre.GeoJSONSource>
        )}

        {/* Alternative routes (inactive) */}
        {alternativeRouteGeoJSONs.map((route) => (
          <MapLibre.GeoJSONSource
            key={route.id}
            id={route.id}
            data={route.data}
          >
            <MapLibre.Layer
              id={`${route.id}-layer`}
              type="line"
              paint={{
                "line-color": ACTIVE_ROUTE_COLOR,
                "line-width": 4,
                "line-opacity": 0.35,
              }}
            />
          </MapLibre.GeoJSONSource>
        ))}

        {/* Active route from alternative routes */}
        {props.activeRoute !== 0 && activeRouteGeoJSON && (
          <MapLibre.GeoJSONSource
            id="active-route-source"
            data={activeRouteGeoJSON}
          >
            <MapLibre.Layer
              id="active-route-layer"
              type="line"
              paint={{
                "line-color": ACTIVE_ROUTE_COLOR,
                "line-width": ACTIVE_ROUTE_WIDTH_BY_ZOOM as any,
                "line-opacity": ACTIVE_ROUTE_OPACITY,
              }}
            />
          </MapLibre.GeoJSONSource>
        )}

        {/* Turn Markers (Exact Parity) */}
        {turnMarkers.map((marker: any, i: number) => {
          if (!marker.icon || turnIconSize <= 0) return null;
          return (
            <MapLibre.Marker
              key={marker.id}
              id={marker.id}
              lngLat={marker.coordinate}
              anchor="center"
            >
              <View
                style={{
                  transform: [
                    {
                      rotate: `${marker.bearing - (props.userHeading || 0)}deg`,
                    },
                  ],
                  opacity: turnOpacity,
                }}
              >
                <Image
                  source={marker.icon}
                  style={{
                    width: turnIconSize,
                    height: turnIconSize,
                    shadowColor: "black",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.4,
                    shadowRadius: 3,
                  }}
                  resizeMode="contain"
                />
              </View>
            </MapLibre.Marker>
          );
        })}

        {/* Main active route (index 0) */}
        {props.activeRoute === 0 && spRouteGeoJSON && (
          <MapLibre.GeoJSONSource id="polyline-source" data={spRouteGeoJSON}>
            <MapLibre.Layer
              id="polyline-layer"
              type="line"
              paint={{
                "line-color": ACTIVE_ROUTE_COLOR,
                "line-width": ACTIVE_ROUTE_WIDTH_BY_ZOOM as any,
                "line-opacity": ACTIVE_ROUTE_OPACITY,
              }}
            />
          </MapLibre.GeoJSONSource>
        )}

        {props.routeStarted && props.currentGpsLocRef && (
          <CarMarker
            animLat={props.animLat}
            animLon={props.animLon}
            currentGpsLocRef={
              props.currentGpsLocRef as React.MutableRefObject<{
                lat: number;
                lon: number;
              } | null>
            }
            iconSource={require("../assets/images/navigation_material.svg")}
          />
        )}

        {props.boundingBoxGeoJSON && (
          <MapLibre.GeoJSONSource
            id="bounding-box-source"
            data={props.boundingBoxGeoJSON}
          >
            <MapLibre.Layer
              id="bounding-box-layer"
              type="line"
              paint={{
                "line-color": ACTIVE_ROUTE_COLOR,
                "line-width": 5,
              }}
            />
          </MapLibre.GeoJSONSource>
        )}

        <MapLibre.UserLocation animated={true} accuracy={true} />
      </MapLibre.Map>

      {/* Map Control Buttons (Geolocate, Zoom In, Zoom Out) - Bottom Right */}
      <View
        className="absolute z-10 flex flex-col gap-2"
        style={{
          right: 16 + (props.safeAreaInsets?.right ?? 0),
          bottom: props.routeStarted
            ? 120 + (props.safeAreaInsets?.bottom ?? 0)
            : 16 + (props.safeAreaInsets?.bottom ?? 0),
        }}
      >
        {/* Geolocate Button */}
        <Pressable
          onPress={handleGeolocate}
          className="bg-white rounded-lg shadow-md items-center justify-center"
          style={{ width: 40, height: 40 }}
        >
          <Ionicons name="locate" size={20} color="#1e40af" />
        </Pressable>

        {/* Zoom In Button */}
        <Pressable
          onPress={handleZoomIn}
          className="bg-white rounded-lg shadow-md items-center justify-center"
          style={{ width: 40, height: 40 }}
        >
          <Ionicons name="add" size={20} color="#1e40af" />
        </Pressable>

        {/* Zoom Out Button */}
        <Pressable
          onPress={handleZoomOut}
          className="bg-white rounded-lg shadow-md items-center justify-center"
          style={{ width: 40, height: 40 }}
        >
          <Ionicons name="remove" size={20} color="#1e40af" />
        </Pressable>
      </View>

      {/* Context Menu Popup (Long Press) */}
      {contextMenuCoord && (
        <View
          className="absolute z-50 bg-white rounded-xl shadow-2xl px-4 py-3"
          style={{
            left: 20,
            right: 20,
            bottom: 100,
          }}
        >
          <View className="flex-row items-center gap-2 mb-2">
            <View className="flex items-center justify-center rounded-lg h-[35px] w-[35px] bg-[#FFE1DF]">
              <Ionicons name="location" size={24} color="#FF3528" />
            </View>
            <Text className="text-base text-gray-700">
              {contextMenuCoord.lat.toFixed(4)},{" "}
              {contextMenuCoord.lon.toFixed(5)}
            </Text>
          </View>
          <Pressable
            className="py-2 border-b border-gray-100"
            onPress={() => {
              props.onSelectSource?.({
                osm_object: {
                  id: 0,
                  name: `${contextMenuCoord.lat}, ${contextMenuCoord.lon}`,
                  lat: contextMenuCoord.lat,
                  lon: contextMenuCoord.lon,
                  type: "source",
                  address: "",
                },
                distance: 0,
              });
              setContextMenuCoord(null);
            }}
          >
            <Text className="text-lg text-gray-800">Set as source point</Text>
          </Pressable>
          <Pressable
            className="py-2"
            onPress={() => {
              props.onSelectDestination?.({
                osm_object: {
                  id: 0,
                  name: `${contextMenuCoord.lat}, ${contextMenuCoord.lon}`,
                  lat: contextMenuCoord.lat,
                  lon: contextMenuCoord.lon,
                  type: "destination",
                  address: "",
                },
                distance: 0,
              });
              setContextMenuCoord(null);
            }}
          >
            <Text className="text-lg text-gray-800">
              Set as destination point
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

function getRouteFittedViewState(coordinates: number[][]): {
  centerCoordinate: [number, number];
  zoomLevel: number;
} {
  const [minLon, minLat, maxLon, maxLat] = coordinates.reduce(
    (acc, [lon, lat]) => [
      Math.min(acc[0], lon),
      Math.min(acc[1], lat),
      Math.max(acc[2], lon),
      Math.max(acc[3], lat),
    ],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
  );

  const screenHeight = Dimensions.get("window").height;
  const screenWidth = Dimensions.get("window").width;
  const padding = 20;

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  const lonDiff = maxLon - minLon;
  const latDiff = maxLat - minLat;

  const maxZoomLon = Math.log2(
    (360 * (screenWidth - 2 * padding)) / (lonDiff * 512),
  );
  const maxZoomLat = Math.log2(
    (360 * (screenHeight - 2 * padding)) /
      (latDiff * 512 * Math.cos((centerLat * Math.PI) / 180)),
  );

  const zoomLevel = Math.min(maxZoomLon, maxZoomLat, 17);

  return {
    centerCoordinate: [centerLon, centerLat],
    zoomLevel: Math.max(zoomLevel, 10),
  };
}
