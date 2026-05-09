import Constants from 'expo-constants';

/**
 * Central configuration for API endpoints.
 * Values are read from app.json `extra` field, falling back to defaults.
 */
const extra = Constants.expoConfig?.extra ?? {};

export const API_CONFIG = {
  ROUTER_API_URL: (extra.routerApiUrl as string) || 'http://localhost:6060',
  SEARCH_API_URL: (extra.searchApiUrl as string) || 'http://localhost:2322',
} as const;
