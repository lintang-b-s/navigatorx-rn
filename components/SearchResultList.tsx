import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Place } from "../lib/searchApi";

interface SearchResultListProps {
  searchResults: Place[];
  onSelect: (result: Place) => void;
}

export const SearchResultList = React.memo(function SearchResultList({
  searchResults,
  onSelect,
}: SearchResultListProps) {
  if (searchResults.length === 0) return null;

  return (
    <View 
      style={{ width: '94%', alignSelf: 'center' }}
      className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-[300px]"
    >
      <FlatList
        data={searchResults}
        keyExtractor={(item, index) => `${item.osm_object.id}-${index}`}
        ItemSeparatorComponent={() => <View className="h-[1px] bg-gray-100 ml-14" />}
        renderItem={({ item }) => (
          <Pressable
            className="px-4 py-3 active:bg-gray-50 flex-row items-center"
            onPress={() => onSelect(item)}
          >
            <View className="w-10 h-10 rounded-xl bg-[#FFE1DF] items-center justify-center mr-3">
              <Ionicons name="location" size={24} color="#FF3528" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-black" numberOfLines={1}>
                {item.osm_object.name}
              </Text>
              {item.osm_object.address ? (
                <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                  {item.osm_object.address}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
});
