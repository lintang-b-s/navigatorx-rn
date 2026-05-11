// https://navigatorx.lintangbs.site/mapmatch/api/map-match/map-matching

export interface Coord {
  lat: number;
  lon: number;
}

export interface Candidate {
  roadnetwork_edge_id: number;
  weight: number;
  length: number;
}

export interface Gps {
  lon: number;
  lat: number;
  time: Date;
  speed: number;
  delta_time: number;
  dead_reckoning: boolean;
}

export interface MatchedGpsPoint {
  gps_point: Gps;
  roadnetwork_edge_id: number;
  matched_coord: Coord;
  predicted_gps_coord: Coord;
  edge_initial_bearing: number;
}

export interface MapMatchRequest {
  gps_point: Gps;
  k: number;
  candidates: Candidate[];
  speed_mean_k: number;
  speed_std_k: number;
  last_bearing: number;
}

export interface Observation {
  observation: Coord;
  snapped_edge_id: number;
}

export interface MapMatchResponse {
  data: {
    matched_gps_point: MatchedGpsPoint;
    candidates: Candidate[];
    speed_mean_k: number;
    speed_std_k: number;
    edge_initial_bearing: number;
  };
}
