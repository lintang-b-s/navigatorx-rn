import { Place } from './searchApi';
import { RouteCRPResponse } from './navigatorxApi';
import { Coord } from './mapmatchApi';

export type LineData = {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type NavigationState = {
  matchedGpsLoc: Coord | undefined;
  matchedHeading: number;
  distanceFromNextTurnPoint: number;
  currentDirectionIndex: number;
  timeSpent: number;
  distanceTraveled: number;
};

export type MapComponentProps = {
  lineData?: LineData;
  alternativeRoutes?: LineData[];
  activeRoute: number;
  isDirectionActive: boolean;
  routeDataCRP?: RouteCRPResponse[];
  nextTurnIndex: number;
  matchedGpsLoc: Coord | undefined;
  rawGpsLoc?: Coord | undefined;
  routeStarted: boolean;
  userHeading: number;
  currentGpsLocRef?: React.RefObject<Coord | null>;
  currentHeadingRef?: React.RefObject<number>;
  triggerGeolocate?: number;
  boundingBoxGeoJSON?: any;
  sourceLoc?: Place;
  destinationLoc?: Place;
};

export type RouterPanelProps = {
  onHandleGetRoutes: () => void;
  isFetchingRoutes: boolean;
  routeDataCRP?: RouteCRPResponse[];
  activeRoute: number;
  routeStarted: boolean;
  isStartingNavigation?: boolean;
  handleRouteClick: (index: number) => void;
  handleDirectionActive: (show: boolean) => void;
  handleSetNextTurnIndex: (index: number) => void;
  handleStartRoute: (start: boolean) => void;
  distanceFromNextTurnPoint: number;
  currentDirectionIndex: number;
  sourceLoc?: Place;
  destinationLoc?: Place;
  onSelectSource: (place: Place) => void;
  onSelectDestination: (place: Place) => void;
  isAlternativeChecked: boolean;
  handleIsAlternativeChecked: () => void;
  timeSpent?: number;
  distanceTraveled?: number;
  speed?: number;
  // Search
  searchResults: Place[];
  onSearch: (query: string, isSource: boolean) => void;
  onReverseGeocode: (isSource: boolean) => void;
};
