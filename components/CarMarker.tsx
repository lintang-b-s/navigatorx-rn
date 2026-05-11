import * as MapLibre from "@maplibre/maplibre-react-native";
import React, { useState } from "react";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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
  animDuration?: SharedValue<number>;
}

/**
 * High-performance Car Marker component using Reanimated.
 * Handles internal interpolation using the dynamic GPS duration.
 */
export const CarMarker = ({
  animLat,
  animLon,
  animDuration,
}: CarMarkerProps) => {
  // MapLibre.Marker lives on the JS thread, so we must use state for position.
  const [position, setPosition] = useState<[number, number] | null>(null);

  // Internal interpolated values to ensure smoothness on the UI thread
  const interpolatedLat = useSharedValue(0);
  const interpolatedLon = useSharedValue(0);

  // Sync initial values on mount safely outside of render
  React.useEffect(() => {
    if (animLat?.value && animLon?.value) {
      interpolatedLat.value = animLat.value;
      interpolatedLon.value = animLon.value;
      setPosition([animLon.value, animLat.value]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1. React to "Target" changes from the tracking hook
  useAnimatedReaction(
    () => ({
      targetLat: animLat?.value ?? 0,
      targetLon: animLon?.value ?? 0,
      duration: animDuration?.value ?? 1000,
    }),
    (target) => {
      // Smoothly glide toward the target using the calculated duration from GPS updates
      interpolatedLat.value = withTiming(target.targetLat, {
        duration: target.duration,
        easing: Easing.linear,
      });
      interpolatedLon.value = withTiming(target.targetLon, {
        duration: target.duration,
        easing: Easing.linear,
      });
    },
  );

  // 2. Bridge update: Sync interpolated position back to JS state
  // Throttling removed as per user's last manual edit, but we monitor for performance.
  useAnimatedReaction(
    () => ({
      lat: interpolatedLat.value,
      lon: interpolatedLon.value,
    }),
    (curr) => {
      scheduleOnRN(setPosition, [curr.lon, curr.lat]);
    },
  );

  // Animate the rotation and visibility of the icon on the UI thread
  const animatedStyle = useAnimatedStyle(() => {
    const heading = 0; // Fixed heading as requested
    const lat = interpolatedLat.value;
    const lon = interpolatedLon.value;

    // Hide marker if coordinates are zero (uninitialized)
    const opacity = lat === 0 && lon === 0 ? 0 : 1;

    return {
      transform: [{ rotate: `${heading}deg` }],
      opacity,
    };
  });

  if (!position) {
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
