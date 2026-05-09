import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

interface NavigationFooterProps {
  arrivalTime: string;
  durationMinutes: number;
  distanceKm: number;
  onStop: () => void;
}

export const NavigationFooter = React.memo(function NavigationFooter({
  arrivalTime,
  durationMinutes,
  distanceKm,
  onStop,
}: NavigationFooterProps) {
  const formatTime = (minutes: number): string => {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 1,
    }).format(minutes);
  };

  const formatDistance = (distance: number): string => {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 2,
    }).format(distance);
  };

  return (
    <View
      style={{ height: 100 }}
      className="absolute bottom-0 left-0 right-0 bg-white flex-row items-center justify-between px-6 shadow-2xl"
    >
      {/* Empty View for centering logic like web */}
      <View />

      <View className="flex-col items-center justify-center">
        <Text className="font-bold text-xl tracking-wide text-black">
          {arrivalTime}
        </Text>
        <View className="flex-row items-center mt-2">
          <Text className="text-base text-black">
            {formatTime(durationMinutes)} menit
          </Text>
          <View className="w-3.5 h-3.5 items-center justify-center mx-1">
            <View className="w-1.5 h-1.5 rounded-full bg-[#dedfe0]" />
          </View>
          <Text className="text-base text-black">
            {distanceKm >= 1
              ? `${formatDistance(distanceKm)} km`
              : `${formatDistance(distanceKm * 1000)} m`}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onStop}
        className="flex-row justify-center items-center h-14 w-14 bg-[#dedfe0] rounded-full active:bg-gray-300"
      >
        <Ionicons name="close" size={18} color="#222831" />
      </Pressable>
    </View>
  );
});
