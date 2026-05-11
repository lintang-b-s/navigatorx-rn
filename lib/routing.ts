import { Coord } from "./mapmatchApi";
import { Direction, RouteCRPResponse } from "./navigatorxApi";
import { haversineDistance } from "./util";

export function isUserOffTheRoute({
  snappedEdgeID,
  routeData,
}: {
  snappedEdgeID: number;
  routeData: RouteCRPResponse;
}): boolean {
  // Use a Set for O(1) lookup instead of nested O(D×E) loops
  const edgeSet = new Set<number>();
  for (const direction of routeData.driving_directions) {
    for (const edgeID of direction.edge_ids) {
      edgeSet.add(edgeID);
    }
  }

  if (edgeSet.has(snappedEdgeID)) {
    return false;
  }
  
  return true;
}

/**
 * Resolves which driving direction instruction (e.g., "Turn Left") matches the user's current road.
 * It searches through the driving directions array to find a segment that contains the current snappedEdgeID.
 */
export function getCurrentUserDirectionIndex({
  snappedEdgeID,
  drivingDirections,
}: {
  snappedEdgeID: number;
  drivingDirections: Direction[];
}): number {
  if (snappedEdgeID === -1) return 0;

  for (let i = 0; i < drivingDirections.length; i++) {
    const direction = drivingDirections[i];
    for (let j = 0; j < direction.edge_ids.length; j++) {
      const directionEdgeID = direction.edge_ids[j];
      if (snappedEdgeID === directionEdgeID) {
        return i;
      }
    }
  }

  return 0;
}

/**
 * Calculates the real-world distance (in KM) from the user to the point where they need to perform a turn.
 */
export function getDistanceFromUserToNextTurn({
  matchedGpsLoc,
  nextTurnPoint,
}: {
  matchedGpsLoc: Coord;
  nextTurnPoint: {
    lat: number;
    lon: number;
  };
}): number {
  return haversineDistance(
    matchedGpsLoc.lat,
    matchedGpsLoc.lon,
    nextTurnPoint.lat,
    nextTurnPoint.lon
  );
}

/**
 * Checks if the user is approaching a "Decision Point" where alternative routes should be suggested.
 * This is triggered based on a specific 'suggest_alternatives' flag in the route data 
 * and a proximity to the end of the current step.
 */
export function isNearEndOfSuggestAlternativesStep({
  snappedEdgeID,
  drivingDirections,
  currentIndex,
}: {
  snappedEdgeID: number;
  drivingDirections: Direction[];
  currentIndex: number;
}): boolean {
  const currentDirection = drivingDirections[currentIndex];
  if (!currentDirection || !currentDirection.suggest_alternatives) return false;

  const lastThreeEdges = currentDirection.edge_ids.slice(-3);
  return lastThreeEdges.includes(snappedEdgeID);
}
