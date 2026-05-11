import axios from "axios";
import { API_CONFIG } from "./config";

export interface OsmObject {
  id: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  type: string;
}

export interface Place {
  osm_object: OsmObject;
  distance: number;
}

export interface SearchResponse {
  data: Place[];
}

export const fetchSearch = async (
  query: string,
  lat: number,
  lon: number,
): Promise<SearchResponse> => {
  try {
    const { data } = await axios.get(
      `${API_CONFIG.SEARCH_API_URL}/api?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lon}&limit=10`,
      {},
    );

    const places: Place[] = data.features.map((feature: any) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates; // [lon, lat]

      const addressParts = [
        props.street,
        props.housenumber,
        props.district,
        props.city,
        props.state,
        props.country,
      ].filter(Boolean);
      const address = addressParts.join(", ");

      return {
        osm_object: {
          id: props.osm_id,
          name: props.name || addressParts[0] || "Unknown",
          lat: coords[1],
          lon: coords[0],
          address: address,
          type: props.osm_value || "unknown",
        },
        distance: 0,
      };
    });

    return { data: places };
  } catch {
    throw new Error("Failed to fetch search results");
  }
};

export type ReverseGeocodingRequest = {
  lat: number;
  lon: number;
};

export type ReverseGeocodingResponse = {
  data: {
    data: {
      lat: number;
      lon: number;
      name: string;
      address: string;
    };
  };
};

export const fetchReverseGeocoding = async ({
  lat,
  lon,
}: ReverseGeocodingRequest): Promise<ReverseGeocodingResponse> => {
  try {
    const { data } = await axios.get(
      `${API_CONFIG.SEARCH_API_URL}/reverse?lat=${lat}&lon=${lon}`,
      {},
    );

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates; // [lon, lat]

      const addressParts = [
        props.street,
        props.housenumber,
        props.district,
        props.city,
        props.state,
        props.country,
      ].filter(Boolean);
      const address = addressParts.join(", ");

      return {
        data: {
          data: {
            lat: coords[1],
            lon: coords[0],
            name: props.name || addressParts[0] || "Unknown",
            address: address,
          },
        },
      };
    } else {
      throw new Error("No results found");
    }
  } catch {
    throw new Error("Failed to fetch reverse geocoding results");
  }
};
