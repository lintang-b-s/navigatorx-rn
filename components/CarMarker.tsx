import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as MapLibre from '@maplibre/maplibre-react-native';
import { Coord } from '../lib/mapmatchApi';

interface CarMarkerProps {
  currentGpsLocRef: React.MutableRefObject<Coord | null>;
  currentHeadingRef: React.MutableRefObject<number>;
  iconSource: any;
}

/**
 * High-performance Car Marker using MapLibre.Marker.
 * Updates the position and rotation at 60fps using requestAnimationFrame.
 */
export const CarMarker: React.FC<CarMarkerProps> = ({
  currentGpsLocRef,
  currentHeadingRef,
  iconSource,
}) => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const loc = currentGpsLocRef.current;
      if (loc) {
        setPosition([loc.lon, loc.lat]);
        setHeading(currentHeadingRef.current);
      }
      frameIdRef.current = requestAnimationFrame(update);
    };

    frameIdRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, []);

  if (!position) return null;

  return (
    <MapLibre.Marker
      id="car-marker"
      lngLat={position}
      anchor="center"
    >
      <View style={[styles.container, { transform: [{ rotate: `${heading}deg` }] }]}>
        <Image 
          source={iconSource} 
          style={styles.icon}
          contentFit="contain"
        />
      </View>
    </MapLibre.Marker>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(247, 251, 250, 0.8)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  icon: {
    width: 30,
    height: 30,
  },
});
