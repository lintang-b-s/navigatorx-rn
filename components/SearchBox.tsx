import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

interface SearchBoxProps {
  sourceName: string;
  destinationName: string;
  onSearch: (query: string, isSource: boolean) => void;
  onReverseGeocode: (isSource: boolean) => void;
  isAlternativeChecked: boolean;
  onToggleAlternative: () => void;
  onGetRoutes: () => void;
  isFetchingRoutes: boolean;
  isFocused: boolean;
  onFocus: (isSource: boolean) => void;
}

export const SearchBox = React.memo(function SearchBox({
  sourceName,
  destinationName,
  onSearch,
  onReverseGeocode,
  isAlternativeChecked,
  onToggleAlternative,
  onGetRoutes,
  isFetchingRoutes,
  isFocused,
  onFocus,
}: SearchBoxProps) {
  const [sourceText, setSourceText] = React.useState(sourceName);
  const [destText, setDestText] = React.useState(destinationName);
  const [localSourceFocused, setLocalSourceFocused] = React.useState(false);

  React.useEffect(() => {
    setSourceText(sourceName);
  }, [sourceName]);

  React.useEffect(() => {
    setDestText(destinationName);
  }, [destinationName]);

  const handleSourceChange = (txt: string) => {
    setSourceText(txt);
    onSearch(txt, true);
  };

  const handleDestChange = (txt: string) => {
    setDestText(txt);
    onSearch(txt, false);
  };

  return (
    <View
      style={{ width: "94%" }}
      className="bg-white rounded-2xl shadow-2xl overflow-hidden self-center"
    >
      <View className="flex-row items-center gap-2 pt-8 pl-4 pr-4 pb-3">
        {/* Left Vertical Indicator (Exact Web Parity) */}
        <View className="items-center">
          <Ionicons name="flag" size={20} color="#00A4EB" />
          <Ionicons
            name="ellipsis-vertical"
            size={20}
            color="#869CA7"
            style={{ marginVertical: 4 }}
          />
          <Ionicons name="location" size={20} color="#FF4B28" />
        </View>

        {/* Middle Inputs Column */}
        <View className="flex-1 gap-4">
          <View className="bg-[#F2F4F7] h-[40px] rounded-lg px-4 flex-row items-center">
            {(!localSourceFocused && sourceText) ? (
              <Pressable 
                className="flex-1" 
                onPress={() => {
                  onFocus(true);
                  setLocalSourceFocused(true);
                }}
              >
                <Text 
                  numberOfLines={1} 
                  ellipsizeMode="tail" 
                  className="text-[#869ca7] text-base"
                >
                  {sourceText}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                className="flex-1 text-[#869ca7] text-base"
                placeholder="Source"
                placeholderTextColor="#869ca7"
                value={sourceText}
                onChangeText={handleSourceChange}
                onFocus={() => {
                  onFocus(true);
                  setLocalSourceFocused(true);
                }}
                onBlur={() => setLocalSourceFocused(false)}
                autoFocus={localSourceFocused}
              />
            )}
            {!sourceText && (
              <Ionicons name="search" size={20} color="#959AA6" />
            )}
          </View>
          <View className="bg-[#F2F4F7] h-[40px] rounded-lg px-4 flex-row items-center">
            {(!isFocused && !localSourceFocused && destText) ? (
              <Pressable 
                className="flex-1" 
                onPress={() => {
                  onFocus(false);
                  setLocalSourceFocused(false);
                }}
              >
                <Text 
                  numberOfLines={1} 
                  ellipsizeMode="tail" 
                  className="text-[#869ca7] text-base"
                >
                  {destText}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                className="flex-1 text-[#869ca7] text-base"
                placeholder="Destination"
                placeholderTextColor="#869ca7"
                value={destText}
                onChangeText={handleDestChange}
                onFocus={() => {
                  onFocus(false);
                  setLocalSourceFocused(false);
                }}
                autoFocus={!localSourceFocused && isFocused}
              />
            )}
            {!destText && <Ionicons name="search" size={20} color="#959AA6" />}
          </View>
        </View>

        {/* Right Actions Column */}
        <View className="items-center gap-2">
          <Pressable
            onPress={onGetRoutes}
            disabled={isFetchingRoutes}
            className="h-[50px] w-[50px] rounded-xl bg-white items-center justify-center active:bg-gray-50 shadow-sm"
          >
            {isFetchingRoutes ? (
              <ActivityIndicator color="#00A4EB" size="small" />
            ) : (
              <Ionicons name="navigate" size={30} color="#00A4EB" />
            )}
          </Pressable>

          <Pressable
            onPress={onToggleAlternative}
            className="flex-row items-center ml-1"
          >
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center ${isAlternativeChecked ? "border-blue-500 bg-blue-500" : "border-gray-400 bg-white"}`}
            >
              {isAlternativeChecked && (
                <Ionicons name="checkmark" size={12} color="#E8ECF1" />
              )}
            </View>
            <Text className="ml-2 text-sm text-[#666f74]">alternatives</Text>
          </Pressable>
        </View>
      </View>

      {/* Your Location Button - only visible when focused */}
      <Pressable
        onPress={() => onReverseGeocode(localSourceFocused)}
        className={`flex-row items-center px-4 py-3 ${isFocused ? "opacity-100" : "opacity-0"} active:bg-gray-50`}
      >
        <Ionicons
          name="locate"
          size={25}
          color="#00A4EB"
          style={{ marginRight: 12 }}
        />
        <Text className="text-sm text-gray-700">Your Location</Text>
      </Pressable>
    </View>
  );
});
