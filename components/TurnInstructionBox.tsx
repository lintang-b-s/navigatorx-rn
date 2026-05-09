import React from "react";
import { Image, Text, View } from "react-native";
import { Direction } from "../lib/navigatorxApi";

interface TurnInstructionBoxProps {
  instruction: Direction | null;
  distanceText: string;
}

export const TurnInstructionBox = React.memo(function TurnInstructionBox({
  instruction,
  distanceText,
}: TurnInstructionBoxProps) {
  if (!instruction) return null;

  // Map turn_type to icon (exact parity with web getTurnIcon)
  const getIcon = (type: string) => {
    switch (type) {
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
  };

  // Extract distance number and unit
  const distNumber = distanceText.replace(" km", "").replace(" m", "");
  const distUnit = distanceText.includes("km") ? "km" : "m";

  // Extract street name from instruction (match web logic)
  const instructionWithoutStreet = instruction.instruction
    ?.replace(instruction.street_name ?? "", "")
    .trim();

  return (
    <View className="bg-[#0F172A]/95 rounded-2xl p-4 flex-row items-center w-full shadow-xl">
      <View className="bg-white/10 p-2 rounded-xl mr-4">
        <Image
          source={getIcon(instruction.turn_type)}
          style={{ width: 42, height: 42 }}
          resizeMode="contain"
        />
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between items-baseline w-full">
          <Text className="text-xl font-black text-white leading-tight">
            {distNumber}
            <Text className="text-sm font-normal opacity-70 ml-1">
              {distUnit}
            </Text>
          </Text>
          <Text
            className="text-sm font-black text-white text-right ml-4 leading-tight"
            numberOfLines={1}
          >
            {instructionWithoutStreet || instruction.instruction}
          </Text>
        </View>
        <Text
          className="text-sm font-bold text-blue-400 mt-1"
          numberOfLines={1}
        >
          {instruction.street_name || ""}
        </Text>
      </View>
    </View>
  );
});
