import * as Location from "expo-location";
import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Platform } from "react-native";

/**
 * Hook to manage location permissions using expo-location.
 * Prompts user to grant foreground location permissions on first launch.
 * If user declines, the app exits. On next launch, prompts again.
 */
export function useLocationPermission() {
  const hasAttemptedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (hasAttemptedRef.current) return true;
    hasAttemptedRef.current = true;

    try {
      // Check if already granted
      const { status: existingStatus } =
        await Location.getForegroundPermissionsAsync();
      if (existingStatus === "granted") {
        return true;
      }

      // Request foreground permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // User declined - show alert and exit app
        Alert.alert(
          "Location Permission Required",
          "NavigatorX needs location access to provide navigation. Please grant location permission in Settings and restart the app.",
          [
            {
              text: "Exit",
              onPress: () => {
                if (Platform.OS === "android") {
                  BackHandler.exitApp();
                }
              },
            },
          ],
          { cancelable: false },
        );
        return false;
      }

      // Enable network provider for better accuracy (Android only)
      if (Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // User may have declined - continue anyway
          console.log(
            "Network provider not enabled, using available providers",
          );
        }
      }

      return true;
    } catch (error) {
      console.error("Permission request error:", error);
      return false;
    }
  }, []);

  // Auto-request on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  return { requestPermission };
}
