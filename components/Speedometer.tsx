import React from "react";
import { Text, View } from "react-native";

interface SpeedometerProps {
  speed: number; // in m/s
}

export const Speedometer = React.memo(function Speedometer({
  speed,
}: SpeedometerProps) {
  // Convert m/s to km/h
  const speedKmh = Math.round(speed * 3.6);

  return (
    <View 
      style={{ width: 68, height: 68 }}
      className="flex flex-col items-center justify-center bg-white/95 rounded-full shadow-2xl border-4 border-[#3b82f6]/10"
    >
      <View className="flex flex-col items-center justify-center -mt-1">
        <Text className="text-4xl font-black text-[#0f172a] leading-none tracking-tighter">
          {speedKmh}
        </Text>
        <Text className="text-[10px] font-extrabold text-[#2563eb] uppercase tracking-wider mt-0.5">
          km/h
        </Text>
      </View>

      {/* Decorative inner ring */}
      <View className="absolute inset-2 border border-[#3b82f6]/5 rounded-full" />
    </View>
  );
});
