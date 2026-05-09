import { useCallback, useRef, useState } from 'react';
import { fetchSearch, fetchReverseGeocoding, Place } from '../lib/searchApi';

/**
 * Search functionality hook.
 * Handles text search with debouncing, reverse geocoding, and coordinate parsing.
 */
export function useSearch(userLat: number, userLon: number) {
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseCoordinates = useCallback((input: string) => {
    const coordRegex =
      /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
    const trimmedInput = input.trim();
    if (coordRegex.test(trimmedInput)) {
      const [lat, lon] = trimmedInput
        .split(',')
        .map((v) => parseFloat(v.trim()));
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }
    return null;
  }, []);

  /**
   * Perform a search query (debounced).
   */
  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      // Check if input is coordinates
      const coords = parseCoordinates(query);
      if (coords) {
        setSearchResults([
          {
            osm_object: {
              id: 0,
              name: `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`,
              lat: coords.lat,
              lon: coords.lon,
              address: 'Coordinate',
              type: 'coordinate',
            },
            distance: 0,
          },
        ]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const resp = await fetchSearch(query, userLat, userLon);
          setSearchResults(resp.data);
        } catch (e: any) {
          console.error('[Search] Error:', e);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [userLat, userLon, parseCoordinates],
  );

  /**
   * Reverse geocode a location. Defaults to current user location if no coords provided.
   */
  const reverseGeocode = useCallback(
    async (lat?: number, lon?: number): Promise<Place | null> => {
      try {
        const targetLat = lat ?? userLat;
        const targetLon = lon ?? userLon;
        const resp = await fetchReverseGeocoding({
          lat: targetLat,
          lon: targetLon,
        });
        const data = resp.data.data;
        return {
          osm_object: {
            id: 0,
            name: data.name,
            lat: data.lat,
            lon: data.lon,
            address: data.address,
            type: 'source',
          },
          distance: 0,
        };
      } catch (error: any) {
        console.error('[Search] Reverse geocode error:', error);
        return null;
      }
    },
    [userLat, userLon],
  );

  const clearResults = useCallback(() => {
    setSearchResults([]);
  }, []);

  return {
    searchResults,
    isSearching,
    search,
    reverseGeocode,
    clearResults,
    parseCoordinates,
  };
}
