import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { RouteCRPResponse } from "../lib/navigatorxApi";

interface RouterPanelProps {
  routes: RouteCRPResponse[];
  activeRoute: number;
  onSelectRoute: (index: number) => void;
  onStartNavigation: () => void;
  onClose: () => void;
  onShowDirections: () => void;
  onShowDirectionsBack: () => void;
  onDirectionClick?: (direction: any, index: number) => void;
  isFetchingRoutes?: boolean;
  isStartingNavigation?: boolean;
  nowTime?: Date | null;
}

export const RouterPanel = React.memo(function RouterPanel({
  routes,
  activeRoute,
  onSelectRoute,
  onStartNavigation,
  onClose,
  onShowDirections,
  onShowDirectionsBack,
  onDirectionClick,
  isFetchingRoutes,
  isStartingNavigation,
  nowTime,
}: RouterPanelProps) {
  const [showDirections, setShowDirections] = useState(false);

  const handleShowDirections = () => {
    setShowDirections(true);
    onShowDirections?.();
  };

  const formatTime = (minutes: number): string => {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 2,
    }).format(minutes);
  };

  const formatDistance = (distance: number): string => {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 2,
    }).format(distance);
  };

  const getTurnIcon = (turnType: string) => {
    switch (turnType) {
      case "TURN_RIGHT":
      case "TURN_SHARP_RIGHT":
        return require("../assets/images/icons/turn_right.png");
      case "TURN_LEFT":
      case "TURN_SHARP_LEFT":
        return require("../assets/images/icons/turn_left.png");
      case "CONTINUE_ONTO":
        return require("../assets/images/icons/straight.png");
      case "TURN_SLIGHT_RIGHT":
        return require("../assets/images/icons/turn_slight_right.png");
      case "TURN_SLIGHT_LEFT":
        return require("../assets/images/icons/turn_slight_left.png");
      case "KEEP_RIGHT":
        return require("../assets/images/icons/fork_right.png");
      case "KEEP_LEFT":
        return require("../assets/images/icons/fork_left.png");
      case "MERGE_ONTO":
        return require("../assets/images/icons/merge_onto.png");
      case "U_TURN_RIGHT":
        return require("../assets/images/icons/u_turn_right.png");
      case "U_TURN_LEFT":
        return require("../assets/images/icons/u_turn_left.png");
      case "ROUNDABOUT":
        return require("../assets/images/icons/roundabout_right.png");
      default:
        return require("../assets/images/icons/straight.png");
    }
  };

  const routeDirections = useMemo(() => {
    if (!routes[activeRoute]) return [];
    return routes[activeRoute].driving_directions.reduce<any[]>(
      (acc, currentDirection) => {
        const last = acc[acc.length - 1];
        const cumulativeEta = last
          ? last.cumulativeEta + currentDirection.travel_time
          : currentDirection.travel_time;
        const cumulativeDistance = last
          ? last.cumulativeDistance + currentDirection.distance
          : currentDirection.distance;

        return [
          ...acc,
          {
            ...currentDirection,
            cumulativeEta,
            cumulativeDistance,
          },
        ];
      },
      [],
    );
  }, [routes, activeRoute]);

  if (isFetchingRoutes) {
    return (
      <View
        className="bg-white rounded-2xl shadow-2xl h-[200px] justify-center items-center mt-4"
        style={{ width: "94%", alignSelf: "center" }}
      >
        <ActivityIndicator size="large" color="#00A4EB" />
        <Text className="mt-4 text-gray-500 font-medium text-sm">
          Finding best routes...
        </Text>
      </View>
    );
  }

  if (showDirections) {
    return (
      <View
        style={{ width: "94%", alignSelf: "center", maxHeight: 500 }}
        className="bg-white rounded-2xl shadow-2xl overflow-hidden mt-4"
      >
        <View className="flex-row items-center justify-between p-4 border-b border-gray-100">
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                setShowDirections(false);
                onShowDirectionsBack();
              }}
              className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-md active:bg-blue-700"
            >
              <Ionicons name="chevron-back" size={20} color="white" />
              <Text className="text-white text-sm font-medium ml-1">Back</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onStartNavigation}
            disabled={isStartingNavigation}
            className="flex-row items-center bg-blue-500 px-3 py-2 rounded-lg active:bg-blue-600 disabled:bg-blue-400"
          >
            {isStartingNavigation ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white text-sm font-bold ml-2">
                  Starting
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="flash" size={18} color="white" />
                <Text className="text-white text-sm font-bold ml-2">
                  Navigate
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={true}
          style={{ height: 170 }} // Constrain height to exactly 2 items (2 * 85px)
          snapToInterval={85} // Snap to each item
          decelerationRate="fast"
        >
          {routeDirections.map((direction, index) => (
            <View
              key={index}
              style={{ height: 85 }} // Fixed height for each direction item
              className={`flex-row items-stretch border-t border-[#D3DAE0] ${
                index === routeDirections.length - 1 ? "border-b" : ""
              }`}
            >
              <View className="w-1 bg-blue-500" />
              <Pressable
                className="flex-1 flex-row items-center p-3 active:bg-gray-50"
                onPress={() => onDirectionClick?.(direction, index)}
              >
                <View className="mr-3">
                  <Image
                    source={getTurnIcon(direction.turn_type)}
                    style={{ width: 24, height: 24 }}
                    resizeMode="contain"
                  />
                </View>
                <View className="flex-1 py-1">
                  <Text
                    className="text-base font-normal text-gray-800"
                    numberOfLines={2}
                  >
                    {direction.instruction}
                  </Text>
                  <Text className="text-sm font-light text-gray-500 mt-0.5">
                    {formatTime(direction.cumulativeEta)} menit (
                    {formatDistance(direction.cumulativeDistance)} m)
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={{ width: "94%", alignSelf: "center" }}
      className="bg-white rounded-2xl shadow-2xl overflow-hidden mt-4"
    >
      <View className="flex-row items-center justify-between p-4 border-b border-gray-100">
        <View className="flex-row items-center">
          <Pressable
            onPress={onClose}
            className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-md active:bg-blue-700"
          >
            <Ionicons name="chevron-back" size={20} color="white" />
            <Text className="text-white text-sm font-medium ml-1">Back</Text>
          </Pressable>
          <Text className="ml-4 text-base font-bold text-[#0a0a0a]">Rute</Text>
        </View>

        <Pressable
          onPress={onStartNavigation}
          disabled={isStartingNavigation}
          className="flex-row items-center bg-blue-500 px-3 py-2 rounded-lg active:bg-blue-600 disabled:bg-blue-400"
        >
          {isStartingNavigation ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-sm font-bold ml-2">
                Starting
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={18} color="white" />
              <Text className="text-white text-sm font-bold ml-2">
                Navigate
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={{ maxHeight: 400 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {routes.map((route, index) => {
            const isActive = activeRoute === index;
            const arrivalTime = nowTime
              ? new Date(
                  nowTime.getTime() + route.travel_time * 60000,
                ).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
              : "--:--";

            return (
              <Pressable
                key={index}
                onPress={() => onSelectRoute(index)}
                className={`flex-row items-stretch border-t border-[#D3DAE0] active:bg-gray-50 ${
                  index === routes.length - 1 ? "border-b" : ""
                }`}
              >
                <View
                  className={`w-1 ${isActive ? "bg-blue-500" : "bg-transparent"}`}
                />

                <View className="flex-1 flex-row items-center p-4">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-gray-600 mb-1">
                      <Text className="text-lg font-bold text-black">
                        {formatTime(route.travel_time)} Menit
                      </Text>
                      {"   "}Tiba pada {arrivalTime}
                    </Text>
                    <Text className="text-sm text-[#4C4C4C]">
                      {formatDistance(route.distance)} KM
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleShowDirections}
                    className="bg-blue-500 px-3 py-1.5 rounded-lg flex-row items-center active:bg-blue-600"
                  >
                    <Text className="text-white text-sm font-medium mr-2">
                      Show Directions
                    </Text>
                    <Ionicons name="location" size={18} color="white" />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
});
