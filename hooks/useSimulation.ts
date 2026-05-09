import { useEffect, useState, useRef } from 'react';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

export interface SimulationGps {
  lat: number;
  lon: number;
  speed: number;
  timestamp: string;
}

export function useSimulation(active: boolean) {
  const [data, setData] = useState<SimulationGps[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        // Load the asset
        const asset = Asset.fromModule(require('../assets/images/noisy_data_wgs84_3_5_1_0.csv'));
        await asset.downloadAsync();
        
        let content = '';
        if (asset.localUri) {
           content = await FileSystem.readAsStringAsync(asset.localUri);
        } else {
           // Fallback or error
           console.error('Simulation file localUri is missing');
           return;
        }

        // Parse first 1000 lines to avoid memory issues
        const lines = content.split('\n').slice(0, 1000);
        const parsed: SimulationGps[] = lines.map(line => {
          const parts = line.split('\t');
          if (parts.length < 6) return null;
          return {
            lon: parseFloat(parts[2]),
            lat: parseFloat(parts[3]),
            speed: parseFloat(parts[5]),
            timestamp: parts[1],
          };
        }).filter((p): p is SimulationGps => p !== null);

        setData(parsed);
        setCurrentIndex(0);
      } catch (err) {
        console.error('Failed to load simulation data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [active]);

  return {
    data,
    currentIndex,
    setCurrentIndex,
    isLoading,
  };
}
