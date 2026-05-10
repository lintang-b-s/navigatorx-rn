import * as MapLibre from "@maplibre/maplibre-react-native";
import React, { useState } from "react";
import Animated, {
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

const CAR_SVG_XML = `
<svg width="32" height="32" viewBox="0 0 32 32">
    <polygon fill="#00B0EB" stroke="#00B0EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="16,3 3,29 16,24 29,29 " />
</svg>
`;

interface CarMarkerProps {
  currentGpsLocRef?: React.MutableRefObject<{
    lat: number;
    lon: number;
  } | null>;
  animLat?: SharedValue<number>;
  animLon?: SharedValue<number>;
  iconSource: any;
}

/**
 * High-performance Car Marker component using Reanimated.
 * Position is synced to the JS thread for MapLibre compatibility.
 * Heading is fixed at 0 as requested.
 */
export const CarMarker = ({ animLat, animLon }: CarMarkerProps) => {
  // Use state for position since MapLibre.Marker isn't natively animatable via Reanimated props
  const [position, setPosition] = useState<[number, number] | null>(() => {
    if (animLat?.value && animLon?.value) {
      return [animLon.value, animLat.value];
    }
    return null;
  });

  // Sync shared values to local state for MapLibre
  useAnimatedReaction(
    () => {
      if (!animLat || !animLon) return null;
      return [animLon.value, animLat.value] as [number, number];
    },
    (curr) => {
      if (curr) {
        scheduleOnRN(setPosition, curr);
      }
    },
  );

  // Animate the rotation of the icon on the UI thread
  const animatedStyle = useAnimatedStyle(() => {
    const heading = 0; // Fixed heading as requested
    const lat = animLat?.value ?? 0;
    const lon = animLon?.value ?? 0;

    // Hide marker if coordinates are zero (uninitialized)
    const opacity = lat === 0 && lon === 0 ? 0 : 1;

    return {
      transform: [{ rotate: `${heading}deg` }],
      opacity,
    };
  });

  if (!position || !animLat || !animLon) {
    return null;
  }

  return (
    <MapLibre.Marker id="car-marker" lngLat={position} anchor="center">
      <Animated.View
        style={[
          animatedStyle,
          {
            width: 50,
            height: 50,
            backgroundColor: "rgba(247, 251, 250, 0.8)", // bg-[#F7FBFA]/80 parity
            borderRadius: 25,
            justifyContent: "center",
            alignItems: "center",
            // Premium shadow
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 5,
          },
        ]}
      >
        <SvgXml xml={CAR_SVG_XML} width="30" height="30" />
      </Animated.View>
    </MapLibre.Marker>
  );
};
