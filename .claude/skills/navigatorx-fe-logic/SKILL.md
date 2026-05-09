---
name: navigatorx-fe-logic
description: Comprehensive guide to the NavigatorX frontend architecture, including 60fps sync loops, WASM map-matching, MHT algorithms, and file-level logic explanations.
---

# NavigatorX Frontend Mapping & Routing Logic

This skill explains the core mapping, routing, online map matching, driving directions, dynamic rerouting logic, search, and simulation mode within the NavigatorX Frontend Next.js application.

## Objectives of the NextJS NavigatorX Map Project

The primary objectives of this project are:

1. **Search and Routing**: Create a map (similar to Google Maps, Apple Maps, Waze, etc.) that provides the fastest route and alternative routes—along with driving directions, ETA information, and distance metrics—when a user enters a search query for an origin and destination.
2. **Turn-by-Turn Navigation**: Provide real-time navigation features (like Google Maps, Apple Maps, Waze, etc.). When a user initiates navigation (by clicking the "Navigate" button on a selected route), the map delivers the next closest turn-by-turn instruction based on the specific road segment/edge the user is on (determined by online map matching).
   - **Rerouting**: If the user deviates from the selected route while navigating, the map automatically reroutes, providing a new path in the same direction as the user's current trajectory.
   - **Dynamic Alternatives**: The map also intelligently provides alternative route suggestions on-the-fly when the user approaches major intersections or decision points.

## Core Technical Architecture: The "Ref vs. State" Pattern

A critical architectural decision in NavigatorX is the separation of **High-Frequency Logic** from **UI State Management**.

1.  **Mutable Refs (`useRef`)**: All performance-critical calculations (GPS map matching, 60fps car animations, distance-to-next-turn math) are handled using `useRef`. This allows the application to process data 60 times per second without triggering React's expensive re-render cycle.
2.  **Reactive State (`useState`)**: React state is used only for elements that the user sees on screen (instruction text, distance numbers, map visibility). State updates are "throttled" by the natural speed of the browser's render cycle, while the underlying math remains frame-accurate in the background.
3.  **Web Worker Offloading**: CPU-intensive operations are separated from the main UI thread. Heavy operations like polyline decoding, JSON parsing for massive alternative routes (`routingWorkerProxy.ts`), and the entire WASM map-matching graph traversal (`wasmMapMatch.worker.ts`) execute asynchronously to prevent main-thread blocking and ensure consistent 60fps UI animations.

## Detailed File Breakdown

### Root Components

- **`app/page.tsx`**: The main orchestrator. It manages the `navigator.geolocation` watch, handles the high-frequency `requestAnimationFrame` sync loop, and coordinates rerouting and alternative suggestions.
- **`app/simulation/page.tsx`**: A developer sandbox that replays GPS traces to verify map matching and routing behavior.

### Library Logic (`app/lib/`)

- **`lib/routing.ts`**: Contains the "brain" for route-following.
  - `isUserOffTheRoute`: Detects deviations from the path using Set-based lookup.
  - `getCurrentUserDirectionIndex`: Maps the current road (EdgeID) to a specific turn instruction.
  - `getDistanceFromUserToNextTurn`: Calculates Haversine distance to the junction.
- **`lib/wasmMapmatch.ts`**: The bridge to the Go-compiled WebAssembly engine.
  - Loads tiles based on S2 cells (Level 13).
  - Handles the `InitializeMapMatchingGraph` and `OnlineMapMatch` WASM functions.
- **`lib/util.ts`**: Geometry and formatting utilities (Haversine, Mercator projection).
- **`lib/navigatorxApi.ts`**: The API client for CRP (Custom Routing Plan) engine.

---

## 1. Online Map Matching (WASM Engine)

NavigatorX implements a high-performance WebAssembly engine following the **Multiple Hypothesis Technique (MHT)**.
Online map matching aligns noisy raw GPS coordinates from the device to actual road segments (edges) on the map in real-time. NavigatorX implements a high-performance **WebAssembly (WASM)** engine that imitates the **client-side real-time map matching architecture** pioneered by [Lyft Engineering](https://eng.lyft.com/using-client-side-map-data-to-improve-real-time-positioning-a382585ac6e).

### Core Mechanism: Multiple Hypothesis Technique (MHT)

Unlike traditional HMM-based methods that introduce latency by waiting for future GPS points (Viterbi), NavigatorX uses MHT to provide **near-zero-latency matching**. It maintains a set of **weighted hypotheses (candidates)** for the current road segment.
The logic specifically follows the **Multiple Hypothesis Technique (MHT)** and **Route Prediction** model described in:

> [1] Taguchi, S., Koide, S. and Yoshimura, T. (2019) “Online Map Matching With Route Prediction,” IEEE Transactions on Intelligent Transportation Systems, 20(1), pp. 338–347. [Available at IEEE](https://doi.org/10.1109/TITS.2018.2812147).

### Implementation Details:

- **Initialization**: Triggered when `routeStarted` is set to `true`. Initializes the WASM engine via `wasmMapMatcher.init()`. It establishes a dedicated Web Worker (`wasmMapMatch.worker.ts`) wrapped via Comlink to handle WASM instantiation and graph logic without blocking the UI thread. The initial tile must be explicitly `await`ed before starting tracking to guarantee the graph is populated.
- **Graph Context & Dynamic Tiles**:
  - NavigatorX uses **Geohashing** (level 6) to partition map data.
  - As the user moves, `loadTile(lat, lon)` runs asynchronously in the background inside the `watchPosition` loop. It fetches tile-specific **CSR (Compressed Sparse Row)** graph data to rebuild the local matching graph on-the-fly.
- **Local Execution**: The matching logic runs entirely on the client (Go-compiled WASM), eliminating server round-trip latency and enabling real-time UI synchronization.
- **Dead Reckoning**: If GPS signal is lost (`LOST_GPS_THRESHOLD` exceeded), the engine uses a **constant velocity model** to predict the next coordinate, feeding it back into the MHT process to maintain path continuity.
- **Smooth Marker Animation (60 FPS)**: Uses `gsap` (GreenSock) inside an imperative `requestAnimationFrame` loop to animate the car marker between matched coordinates, filtering out GPS jitter and providing a premium navigation experience.

## 2. Driving Directions

Driving directions are fetched from the routing engine and displayed contextually as the user drives.

### Mechanism:

- **Routing API**: Initiated by `routingWorker.fetchAndProcessRoutes(reqBody)`, which proxies the heavy API call (`fetchRouteCRP`) and subsequent data transformation (e.g., Polyline decoding into GeoJSON) entirely within a dedicated Web Worker (`routing.worker.ts`). This ensures the map doesn't freeze when calculating cross-country routes. It returns a combined `RouteCRPResponse` containing the full polyline `path` and an array of `driving_directions`.
- **Direction Structure**: Each direction step contains:
  - `edge_ids`: The sequence of road segment IDs that make up this specific direction.
  - `turn_point`: Latitude and longitude of where the maneuver/turn happens.
  - `turn_type`: e.g., `TURN_RIGHT`, `KEEP_LEFT`, `CONTINUE_ONTO`.
  - `turn_bearing`: Angle for the UI arrow icon.
  - `suggest_alternatives`: Boolean flag indicating if this edge is an opportunity to suggest dynamic alternatives.
- **Current Direction Calculation**: In the sync loop of `page.tsx`, `getCurrentUserDirectionIndex` iterates through `driving_directions`. It checks which direction's `edge_ids` array contains the current `snappedEdgeID`.
- **Distance to Turn**: Uses `getDistanceFromUserToNextTurn` (Haversine) from the current `matchedGpsLoc` to the current direction's `nextTurnPoint`.
- **UI Rendering**: `MapComponent` filters and renders turn markers. Zoom-level-based scaling is applied to turn icons, rotating them based on `turn_bearing - userHeading`. `Router` component shows the step-by-step turn instructions.
- **Sync Loop Tracking**: In `page.tsx`, the system constantly checks if the current `snappedEdgeID` exists in the current direction step's `edge_ids`.
- **ETA Normalization**: To keep ETAs accurate during alternative route switches, the system uses:
  - `currentTimeOffset`: Time already spent driving.
  - `currentDistOffset`: Distance already traveled.
    Total ETA = (Remaining Time from API) + `currentTimeOffset`.

## 3. Reroute Logic

Rerouting happens automatically when the user deviates from the active path.

### Mechanism:

- **Off-Route Detection**: `isUserOffTheRoute` is checked inside a `useEffect` whenever `snappedEdgeID` changes. It loops through all `edge_ids` in all `driving_directions` of the current route. If `snappedEdgeID` is not found in the set of the route's edges, the user is off-route.
- **Alternative Match Check**: Before requesting a completely new route from the backend, the app checks if the user simply switched to one of the previously fetched alternative routes (`otherRouteIndex`). If true, it just switches `activeRoute` without an API call.
- **API Reroute Request**: If genuinely off-route, and the map match step is beyond the initial buffer (e.g., `mapMatchStep > 5` to prevent false positive reroutes at startup), a reroute API call is made via `routingWorker.fetchAndProcessRoutes` passing the `reroute: true` flag. This runs in the Web Worker to avoid freezing the UI.
- **Payload**: The payload includes `reroute: true`, `startEdgeId: snappedEdgeID`, and the current user location as the new source.
- **State Reset**: `routeData` is replaced, `polylineData` is redrawn, and `activeRoute` is reset to `0`.

## 4. Alternative Routes Suggestion (Dynamic Alternatives)

Suggests alternative routes dynamically as the user approaches specific intersections or decision points.

### Mechanism:

- **Trigger**: Checked on every snapped edge update. Uses `isNearEndOfSuggestAlternativesStep`.
- **Condition**: Checks if the current direction step has `suggest_alternatives == true`, and if the current `snappedEdgeID` is among the **last 3 edges** of this direction step's `edge_ids` array.
- **Dynamic Fetch**: If the condition is met and it hasn't fetched alternatives for this specific direction index yet (`lastFetchedAlternativesStep`), it triggers an async background call to `fetchAlternativeRoutes(reqBody)` using `startEdgeId: snappedEdgeID`.
- **UI Update**: When the backend responds with new alternatives, it combines them with the _existing_ main route (`routeData[0]`) and updates `alternativeRoutesLineData`. These new alternative polylines instantly appear on the map as the user approaches the intersection, allowing them to visibly choose a new path without interrupting current navigation.

## 5. Search & Geocoding

The application supports searching for destinations and querying user locations.

### Mechanism:

- **Forward Geocoding (`fetchSearch`)**:
  - Activated from the search boxes in the UI (`app/ui/routing.tsx`).
  - Calls a Photon API (`NEXT_PUBLIC_SEARCH_API_URL`) passing the text `query`, `lat`, and `lon` (for location-biased results).
  - Normalizes the response into an array of `Place` objects, handling street, housenumber, district, city, state, and country.
- **Reverse Geocoding (`fetchReverseGeocoding`)**:
  - Triggered when the user clicks the "Your Location" GPS button.
  - Sends the current device coordinates to the Photon API reverse geocoding endpoint.
  - Extracts the closest address to automatically populate the `source` or `destination` fields.
- **URL Sync**: Selected sources and destinations are synchronized with URL search parameters (e.g., `?source=...&destination=...`), allowing route states to be shareable.

## 6. Simulation Mode

Found in `app/simulation/page.tsx`, this feature allows developers and testers to replay GPS traces to verify map matching and routing behavior without physical movement.

### Mechanism:

- **Data Loading**: Loads an array of predefined `points` (raw GPS data).
- **Execution Loop**: Uses an imperative loop (with delays) to step through each GPS point. The delay is calculated from the time differences (`datetime_utc`) to match real-time driving speeds.
- **Map Matching Config**: Users can choose between:
  - **WASM Mode**: Exclusively uses the client-side WebAssembly engine (`wasmMapMatcher`), including CSR graph tile loading.
  - **WebSocket/HTTP Mode**: Legacy modes that proxy requests to a backend service.
- **GPS Window Buffer**: Can visually render a window of raw GPS points around the current point (`isShowingGpsWindow`), creating a red dot buffer on the map to visualize raw input noise versus the snapped route.
- **Animation and Events**: It uses the same imperative `gsap.to` animation block and distance thresholds as the live application to accurately test UI responsiveness. At the end, it allows downloading a log of the matched points (edge IDs and coordinates).

## 7. UI Components & Visuals

The application's UI is divided into the interactive Map layer and the floating UI components.

### Mechanism:

- **MapComponent (`app/ui/map.tsx`)**:
  - Built on `@vis.gl/react-maplibre`.
  - Dynamically renders layers using `Source` and `Layer` for `spRouteGeoJSON` (main path) and `alternativeRoutes` paths.
  - Dynamically applies styles such as `ACTIVE_ROUTE_COLOR` and zoom-based widths (`ACTIVE_ROUTE_WIDTH_BY_ZOOM`).
  - `GeolocateControl` and `NavigationControl` provide native map interactions.
  - Incorporates context menus for setting source and destination directly via long-press (mobile) or right-click.
- **Router UI (`app/ui/routing.tsx`)**:
  - Provides a responsive card-based layout (bottom sheet on mobile, sidebar on desktop).
  - Displays route summaries (ETA, distance) and step-by-step turn instructions.
  - Uses specific icons generated via `getTurnIcon` mapping API turn types (e.g., `TURN_RIGHT`) to static image files (`/icons/turn_right.png`).

## 8. Testing Guidelines

**Every time you change the code, you MUST test your code by running all features.**

Specifically, when verifying the **Online Map Matching** functionality:

- Use the **Simulation Page** feature (`app/simulation/page.tsx`).
- Run the simulation using the dataset `"data/noisy_data_wgs84_3_5_1_0.csv"`.
- Ensure that you verify the map behavior and UI responsiveness across multiple viewports: **desktop, tablet, and mobile device views**.
- **Zero Errors**: Ensure that there are absolutely no errors or warnings (e.g., "Maximum update depth exceeded", rendering crashes) in the browser console when trying and testing any feature, particularly during the high-frequency map matching process.
